import type { Environment } from '../types'
import {
  SCRIBE_KV,
  readKv,
  resolveScribeConfig,
  type ScribeConfig,
  type ScribeKv,
  type ScribeModelConfig,
  type ScribeModelTarget,
} from './config'
import { TRANSCRIBE_MAX_BYTES, TRANSCRIBE_MIME_TYPES } from './transcribe'
import { SCRIBE_PROTOCOL_MAX, type ScribeStatusResponse } from './wire'

/**
 * Whether Scribe AI can run, and on which model (protocol: Status, Model and
 * provider). Three gates, cheapest first:
 *
 * 1. The kill switch, KV `scribe:enabled`.
 * 2. Provider health: OpenRouter's free endpoints metadata for the model. A
 *    host counts only if it's on the allowlist, its `status` ≥ 0, and its
 *    `supported_parameters` include `tools`. No such host for the primary →
 *    the fallback (if configured and healthy) → else `no_provider`.
 * 3. A probe that fails (network, 5xx, garbage) fails open to the primary.
 *
 * The probe's answer lives in KV `scribe:provider-health` for 300 s; under
 * 60 s old it's served as is, older it's served while `waitUntil` re-probes.
 */

const PROVIDER_FRESH_MS = 60_000
const PROVIDER_CACHE_TTL_SECONDS = 300
const PROBE_TIMEOUT_MS = 2_000

export type ProviderSelection = 'primary' | 'fallback' | 'none'

export interface ScribeAvailability {
  config: ScribeConfig
  enabled: boolean
  reason: 'disabled' | 'no_provider' | null
  /** The model and hosts a step uses; null when not enabled. */
  target: ScribeModelTarget | null
  /** True when the health probe failed and the answer is fail-open. */
  probeFailed: boolean
}

// --- Probe ----------------------------------------------------------------------

interface OpenRouterEndpoint {
  provider_name?: unknown
  tag?: unknown
  status?: unknown
  supported_parameters?: unknown
}

export interface OpenRouterEndpointsResponse {
  data?: { endpoints?: OpenRouterEndpoint[] }
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Loose match of a provider name or tag (`Azure`, `azure/us`) to an allowlist slug. */
const onAllowlist = (endpoint: OpenRouterEndpoint, allowlist: readonly string[]) => {
  const names = [endpoint.provider_name, endpoint.tag]
    .filter((name): name is string => typeof name === 'string')
    .flatMap((name) => [normalize(name), normalize(name.split('/')[0])])
    .filter(Boolean)
  return allowlist.some((slug) => {
    const s = normalize(slug)
    return s.length > 0 && names.some((name) => name === s || name.includes(s) || s.includes(name))
  })
}

const healthyStatus = (status: unknown): boolean => {
  if (status == null) return true
  const n = typeof status === 'number' ? status : Number(status)
  return Number.isFinite(n) ? n >= 0 : true
}

/**
 * Pure: does any allowlisted host serve this model healthily, with tool
 * calls? Exported for tests.
 */
export const anyHostServesTools = (
  body: OpenRouterEndpointsResponse,
  allowlist: readonly string[]
): boolean =>
  (body.data?.endpoints ?? []).some(
    (endpoint) =>
      onAllowlist(endpoint, allowlist) &&
      healthyStatus(endpoint.status) &&
      Array.isArray(endpoint.supported_parameters) &&
      endpoint.supported_parameters.includes('tools')
  )

/** Throws on a failed or unreadable probe, so the caller can fail open. */
export const probeTarget = async (
  apiKey: string,
  target: ScribeModelTarget,
  fetchFn: typeof fetch = fetch
): Promise<boolean> => {
  const slash = target.model.indexOf('/')
  if (slash <= 0) return true
  const url = `https://openrouter.ai/api/v1/models/${encodeURIComponent(
    target.model.slice(0, slash)
  )}/${encodeURIComponent(target.model.slice(slash + 1))}/endpoints`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const response = await fetchFn(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`OpenRouter endpoints API returned ${response.status}`)
    return anyHostServesTools((await response.json()) as OpenRouterEndpointsResponse, target.providers)
  } finally {
    clearTimeout(timeout)
  }
}

interface CachedHealth {
  /** The model config it was probed for; a config change re-probes. */
  key: string
  selection: ProviderSelection
  checkedAt: number
}

const healthKey = (model: ScribeModelConfig) =>
  JSON.stringify([model.model, model.providers, model.fallback])

const parseCachedHealth = (raw: string | null, key: string): CachedHealth | null => {
  if (raw == null) return null
  try {
    const parsed = JSON.parse(raw) as Partial<CachedHealth>
    if (
      parsed.key === key &&
      (parsed.selection === 'primary' ||
        parsed.selection === 'fallback' ||
        parsed.selection === 'none') &&
      typeof parsed.checkedAt === 'number'
    )
      return parsed as CachedHealth
  } catch {
    // Unreadable: probe again.
  }
  return null
}

/** Probes the primary, then the fallback. `failed` answers are fail-open and not cached. */
const selectProvider = async (
  apiKey: string,
  model: ScribeModelConfig,
  fetchFn: typeof fetch
): Promise<{ selection: ProviderSelection; failed: boolean }> => {
  try {
    if (await probeTarget(apiKey, model, fetchFn)) return { selection: 'primary', failed: false }
  } catch {
    return { selection: 'primary', failed: true }
  }
  if (!model.fallback) return { selection: 'none', failed: false }
  try {
    return {
      selection: (await probeTarget(apiKey, model.fallback, fetchFn)) ? 'fallback' : 'none',
      failed: false,
    }
  } catch {
    return { selection: 'fallback', failed: true }
  }
}

// --- Availability ---------------------------------------------------------------

export interface AvailabilityDeps {
  env: Environment
  kv?: ScribeKv & Pick<KVNamespace, 'put'>
  /** The request's `waitUntil`: with it, a stale health result is served while it refreshes. */
  waitUntil?: (promise: Promise<unknown>) => void
  fetchFn?: typeof fetch
  now?: () => number
}

const targetFor = (model: ScribeModelConfig, selection: ProviderSelection) =>
  selection === 'primary'
    ? { model: model.model, providers: model.providers }
    : selection === 'fallback'
      ? model.fallback
      : null

/** The kill switch, then provider health. Never throws: it fails open. */
export const resolveScribeAvailability = async ({
  env,
  kv = env.NOTES_KV,
  waitUntil,
  fetchFn = fetch,
  now = Date.now,
}: AvailabilityDeps): Promise<ScribeAvailability> => {
  const [config, cachedRead] = await Promise.all([
    resolveScribeConfig(env, kv),
    readKv(kv, SCRIBE_KV.providerHealth),
  ])
  if (!config.enabled)
    return { config, enabled: false, reason: 'disabled', target: null, probeFailed: false }

  const key = healthKey(config.model)
  const answer = (selection: ProviderSelection, probeFailed: boolean): ScribeAvailability => {
    const target = targetFor(config.model, selection)
    return target
      ? { config, enabled: true, reason: null, target, probeFailed }
      : { config, enabled: false, reason: 'no_provider', target: null, probeFailed }
  }
  if (cachedRead.failed) return answer('primary', true)

  const refresh = async () => {
    const result = await selectProvider(env.OPENROUTER_API_KEY, config.model, fetchFn)
    if (!result.failed) {
      const value = JSON.stringify({ key, selection: result.selection, checkedAt: now() })
      const write = Promise.resolve()
        .then(() => kv.put(SCRIBE_KV.providerHealth, value, { expirationTtl: PROVIDER_CACHE_TTL_SECONDS }))
        .catch(() => undefined)
      if (waitUntil) waitUntil(write)
      else await write
    }
    return result
  }

  const cached = parseCachedHealth(cachedRead.value, key)
  if (cached) {
    const stale = now() - cached.checkedAt >= PROVIDER_FRESH_MS
    if (!stale || waitUntil) {
      if (stale) waitUntil!(refresh().catch(() => undefined))
      return answer(cached.selection, false)
    }
  }
  const result = await refresh()
  return answer(result.selection, result.failed)
}

// --- Public status ----------------------------------------------------------------

export const buildStatusResponse = (availability: ScribeAvailability): ScribeStatusResponse => {
  const { config } = availability
  const { limits } = config
  return {
    ok: true,
    enabled: availability.enabled,
    reason: availability.reason,
    protocol: { min: config.protocolMin, max: SCRIBE_PROTOCOL_MAX },
    minAppVersion: config.minAppVersion,
    disabledTools: config.disabledTools,
    limits: {
      maxInputTokens: limits.maxInputTokens,
      maxOutputTokens: config.model.maxOutputTokens,
      maxStepsPerTurn: limits.maxStepsPerTurn,
      maxTools: limits.maxTools,
      maxToolsBytes: limits.maxToolsBytes,
      maxToolSchemaBytes: limits.maxToolSchemaBytes,
      maxToolDescriptionChars: limits.maxToolDescriptionChars,
      maxRequestBytes: limits.maxRequestBytes,
      maxContextBytes: limits.maxContextBytes,
      maxUserTextChars: limits.maxUserTextChars,
      maxToolResultBytes: limits.maxToolResultBytes,
      transcribe: { maxBytes: TRANSCRIBE_MAX_BYTES, mimeTypes: [...TRANSCRIBE_MIME_TYPES] },
    },
  }
}

const PUBLIC_FRESHNESS_MS = 30_000
const publicCache = new WeakMap<Environment, { expiresAt: number; status: ScribeStatusResponse }>()

/**
 * `GET /scribe/v1/status`: the public answer, reused in this isolate for 30
 * seconds. Enforcement never reads this cache; it resolves availability
 * itself on every step. A fail-open answer (probe failed) isn't reused.
 */
export const getPublicScribeStatus = async (
  env: Environment,
  waitUntil?: (promise: Promise<unknown>) => void,
  now: () => number = Date.now
): Promise<ScribeStatusResponse> => {
  const at = now()
  const cached = publicCache.get(env)
  if (cached && at < cached.expiresAt) return cached.status
  const availability = await resolveScribeAvailability({ env, waitUntil, now })
  const status = buildStatusResponse(availability)
  if (!availability.probeFailed)
    publicCache.set(env, { status, expiresAt: at + PUBLIC_FRESHNESS_MS })
  return status
}

/** Clears the per-isolate status cache (tests). */
export const resetPublicScribeStatus = (env: Environment): void => {
  publicCache.delete(env)
}
