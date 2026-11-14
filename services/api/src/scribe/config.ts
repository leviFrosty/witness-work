import type { Environment } from '../types'
import { resolveDevBypassToken } from '../devBypass'
import type { AccountAuth } from '../accounts/auth'
import type { ScribePlan } from './wire'

/**
 * Scribe AI's runtime configuration (protocol: "Kill switches and
 * configuration"). Every limit and model field resolves on its own: KV →
 * environment variable → the defaults below, so one malformed KV field falls
 * through without taking the others with it. KV reads are edge-cached for 60
 * seconds.
 */

/**
 * OpenRouter reasoning effort, or null for reasoning off. Only the efforts
 * GPT-6 Luna lists (`supported_efforts`); it has no `minimal`.
 */
export type ReasoningEffort =
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'
  | null

export interface ScribeLimits {
  /**
   * `weekly` limits a free account. `welcome` replaces it in the account's
   * first weekly window, so a first import isn't cut short. `graceUnits` is
   * the free plan's turn grace.
   */
  free: { weekly: number; welcome: number; graceUnits: number }
  supporter: { session: number; weekly: number }
  windowLengths: { sessionHours: number; weeklyDays: number; monthlyDays: number }
  weights: { input: number; cachedInput: number; cacheWrite: number; output: number }
  graceUnits: number
  turnGraceMinutes: number
  activeStepCap: number
  maxInputTokens: number
  maxStepsPerTurn: number
  maxTools: number
  maxToolsBytes: number
  maxToolSchemaBytes: number
  maxToolDescriptionChars: number
  maxRequestBytes: number
  maxContextBytes: number
  maxUserTextChars: number
  maxToolResultBytes: number
  stepTimeoutMs: number
  transcribePagesPerDay: { free: number; supporter: number }
}

/** The protocol's defaults (`docs/scribe-ai-protocol.md` → Configuration). */
export const DEFAULT_SCRIBE_LIMITS: ScribeLimits = {
  free: { weekly: 25_000, welcome: 150_000, graceUnits: 15_000 },
  supporter: { session: 200_000, weekly: 500_000 },
  windowLengths: { sessionHours: 5, weeklyDays: 7, monthlyDays: 30 },
  weights: { input: 1, cachedInput: 0.1, cacheWrite: 1.25, output: 5 },
  graceUnits: 50_000,
  turnGraceMinutes: 30,
  activeStepCap: 2,
  maxInputTokens: 48_000,
  maxStepsPerTurn: 6,
  maxTools: 24,
  maxToolsBytes: 32_768,
  maxToolSchemaBytes: 4_096,
  maxToolDescriptionChars: 1_024,
  maxRequestBytes: 393_216,
  maxContextBytes: 16_384,
  maxUserTextChars: 32_000,
  maxToolResultBytes: 8_192,
  stepTimeoutMs: 90_000,
  transcribePagesPerDay: { free: 40, supporter: 200 },
}

/**
 * How each field validates: `allowance` is an integer ≥ -1 (-1 unlimited),
 * `count` an integer ≥ 0, `cap` an integer ≥ 1, `length` a positive number
 * (fractions allowed, for short dev windows), `weight` a number ≥ 0.
 */
type FieldKind = 'allowance' | 'count' | 'cap' | 'length' | 'weight'

const LIMIT_FIELDS: readonly (readonly [readonly string[], FieldKind])[] = [
  [['free', 'weekly'], 'allowance'],
  [['free', 'welcome'], 'allowance'],
  [['free', 'graceUnits'], 'count'],
  [['supporter', 'session'], 'allowance'],
  [['supporter', 'weekly'], 'allowance'],
  [['windowLengths', 'sessionHours'], 'length'],
  [['windowLengths', 'weeklyDays'], 'length'],
  [['windowLengths', 'monthlyDays'], 'length'],
  [['weights', 'input'], 'weight'],
  [['weights', 'cachedInput'], 'weight'],
  [['weights', 'cacheWrite'], 'weight'],
  [['weights', 'output'], 'weight'],
  [['graceUnits'], 'count'],
  [['turnGraceMinutes'], 'count'],
  [['activeStepCap'], 'cap'],
  [['maxInputTokens'], 'cap'],
  [['maxStepsPerTurn'], 'cap'],
  [['maxTools'], 'cap'],
  [['maxToolsBytes'], 'cap'],
  [['maxToolSchemaBytes'], 'cap'],
  [['maxToolDescriptionChars'], 'cap'],
  [['maxRequestBytes'], 'cap'],
  [['maxContextBytes'], 'cap'],
  [['maxUserTextChars'], 'cap'],
  [['maxToolResultBytes'], 'cap'],
  [['stepTimeoutMs'], 'cap'],
  [['transcribePagesPerDay', 'free'], 'allowance'],
  [['transcribePagesPerDay', 'supporter'], 'allowance'],
]

const isValidField = (kind: FieldKind, value: unknown): value is number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false
  switch (kind) {
    case 'allowance':
      return Number.isInteger(value) && value >= -1
    case 'count':
      return Number.isInteger(value) && value >= 0
    case 'cap':
      return Number.isInteger(value) && value >= 1
    case 'length':
      return value > 0
    case 'weight':
      return value >= 0
  }
}

/** `["windowLengths", "sessionHours"]` → `SCRIBE_WINDOW_LENGTHS_SESSION_HOURS`. */
export const limitEnvName = (path: readonly string[]): string =>
  `SCRIBE_${path
    .map((part) => part.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase())
    .join('_')}`

const at = (record: unknown, path: readonly string[]): unknown =>
  path.reduce<unknown>(
    (node, key) =>
      node && typeof node === 'object' && !Array.isArray(node)
        ? (node as Record<string, unknown>)[key]
        : undefined,
    record
  )

const setAt = (record: Record<string, unknown>, path: readonly string[], value: number) => {
  let node = record
  for (const key of path.slice(0, -1)) node = node[key] as Record<string, unknown>
  node[path[path.length - 1]] = value
}

const envNumber = (raw: string | undefined): number | undefined => {
  if (raw == null || raw.trim() === '') return undefined
  const value = Number(raw.trim())
  return Number.isFinite(value) ? value : undefined
}

type EnvLookup = Record<string, string | undefined>
const envOf = (env: Environment): EnvLookup => env as unknown as EnvLookup

const parseJsonObject = (raw: string | null): Record<string, unknown> | null => {
  if (raw == null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/** Each field: KV `scribe:limits` → `SCRIBE_<SNAKE_CASE>` → default. */
export const resolveLimits = (env: Environment, kvRaw: string | null): ScribeLimits => {
  const kv = parseJsonObject(kvRaw)
  const vars = envOf(env)
  const limits = structuredClone(DEFAULT_SCRIBE_LIMITS) as unknown as Record<string, unknown>
  for (const [path, kind] of LIMIT_FIELDS) {
    const fromKv = at(kv, path)
    const fromEnv = envNumber(vars[limitEnvName(path)])
    if (isValidField(kind, fromKv)) setAt(limits, path, fromKv)
    else if (isValidField(kind, fromEnv)) setAt(limits, path, fromEnv)
  }
  return limits as unknown as ScribeLimits
}

/**
 * The dev bypass makes every usage limit unlimited (`-1`): the windows and the
 * daily page ceiling. Request caps (sizes, counts, the step cap, the active
 * cap) still apply, since they protect the worker, not a budget.
 */
export const withDevBypass = (limits: ScribeLimits, devBypass: boolean): ScribeLimits =>
  devBypass
    ? {
        ...limits,
        free: { ...limits.free, weekly: -1, welcome: -1 },
        supporter: { session: -1, weekly: -1 },
        transcribePagesPerDay: { free: -1, supporter: -1 },
      }
    : limits

/** Window lengths in milliseconds. */
export const windowLengthsMs = (limits: ScribeLimits) => ({
  session: limits.windowLengths.sessionHours * 60 * 60 * 1000,
  weekly: limits.windowLengths.weeklyDays * 24 * 60 * 60 * 1000,
  monthly: limits.windowLengths.monthlyDays * 24 * 60 * 60 * 1000,
})

// --- Model ------------------------------------------------------------------

export interface ScribeModelTarget {
  model: string
  /** OpenRouter provider allowlist, in routing-priority order (`only` + `order`). */
  providers: string[]
}

export interface ScribeModelConfig extends ScribeModelTarget {
  reasoningEffort: ReasoningEffort
  /** Includes reasoning. */
  maxOutputTokens: number
  /** Sends each tool with `strict: true` (constrained decoding). */
  strictTools: boolean
  /**
   * Splits Users across this many `prompt_cache_key` buckets (a hash of the
   * account, never the id); 0 sends none, so every step shares OpenRouter's
   * default key. Measured: a key reaches Azure and partitions its cache.
   */
  cacheKeyBuckets: number
  /** Used when no allowlisted host for `model` serves tool calls. */
  fallback: ScribeModelTarget | null
  /** The vision model that reads paper pages, on `providers`. */
  transcribeModel: string
}

export const DEFAULT_SCRIBE_MODEL: ScribeModelConfig = {
  model: 'openai/gpt-6-luna',
  // Western ZDR hosts only (ADR 0008); fail closed, never widened automatically.
  providers: ['azure'],
  reasoningEffort: 'medium',
  maxOutputTokens: 4_096,
  strictTools: false,
  cacheKeyBuckets: 0,
  fallback: null,
  transcribeModel: 'openai/gpt-6-luna',
}

/** The most `prompt_cache_key` buckets KV may ask for. */
export const MAX_CACHE_KEY_BUCKETS = 1_024

const REASONING_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max'])

/** Undefined when `raw` says nothing usable (fall through), null for off. */
const parseReasoning = (raw: unknown): ReasoningEffort | undefined => {
  if (raw === null) return null
  if (typeof raw !== 'string') return undefined
  const value = raw.trim().toLowerCase()
  if (value === '' || value === 'off' || value === 'none') return null
  return REASONING_EFFORTS.has(value) ? (value as ReasoningEffort) : undefined
}

const MODEL_SLUG = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i

const parseModel = (raw: unknown): string | undefined =>
  typeof raw === 'string' && MODEL_SLUG.test(raw.trim()) ? raw.trim() : undefined

const parseProviders = (raw: unknown): string[] | undefined => {
  const list =
    typeof raw === 'string'
      ? raw.split(',')
      : Array.isArray(raw) && raw.every((item) => typeof item === 'string')
        ? (raw as string[])
        : null
  const providers = list?.map((item) => item.trim()).filter(Boolean)
  return providers && providers.length > 0 ? providers : undefined
}

const parseOutputTokens = (raw: unknown): number | undefined => {
  const value = typeof raw === 'string' ? envNumber(raw) : raw
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 128_000
    ? value
    : undefined
}

const parseCacheKeyBuckets = (raw: unknown): number | undefined =>
  typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= MAX_CACHE_KEY_BUCKETS
    ? raw
    : undefined

const firstDefined = <T>(...values: (T | undefined)[]): T | undefined =>
  values.find((value) => value !== undefined)

/**
 * Each field: KV `scribe:model` → `SCRIBE_MODEL`, `SCRIBE_PROVIDERS`,
 * `SCRIBE_REASONING_EFFORT`, `SCRIBE_MAX_OUTPUT_TOKENS`,
 * `SCRIBE_FALLBACK_MODEL`, `SCRIBE_FALLBACK_PROVIDERS`,
 * `SCRIBE_TRANSCRIBE_MODEL` → defaults. `strictTools` and `cacheKeyBuckets`
 * are KV only.
 */
export const resolveModelConfig = (
  env: Environment,
  kvRaw: string | null
): ScribeModelConfig => {
  const kv = parseJsonObject(kvRaw) ?? {}
  const vars = envOf(env)
  const model =
    firstDefined(parseModel(kv.model), parseModel(vars.SCRIBE_MODEL)) ??
    DEFAULT_SCRIBE_MODEL.model
  const providers =
    firstDefined(parseProviders(kv.providers), parseProviders(vars.SCRIBE_PROVIDERS)) ??
    DEFAULT_SCRIBE_MODEL.providers
  const reasoningEffort = firstDefined(
    'reasoningEffort' in kv ? parseReasoning(kv.reasoningEffort) : undefined,
    vars.SCRIBE_REASONING_EFFORT != null ? parseReasoning(vars.SCRIBE_REASONING_EFFORT) : undefined
  )
  const fallbackKv =
    kv.fallback && typeof kv.fallback === 'object' && !Array.isArray(kv.fallback)
      ? (kv.fallback as Record<string, unknown>)
      : {}
  const fallbackModel = firstDefined(
    parseModel(fallbackKv.model),
    parseModel(vars.SCRIBE_FALLBACK_MODEL)
  )
  const fallbackProviders =
    firstDefined(
      parseProviders(fallbackKv.providers),
      parseProviders(vars.SCRIBE_FALLBACK_PROVIDERS)
    ) ?? providers
  return {
    model,
    providers,
    reasoningEffort:
      reasoningEffort === undefined ? DEFAULT_SCRIBE_MODEL.reasoningEffort : reasoningEffort,
    maxOutputTokens:
      firstDefined(
        parseOutputTokens(kv.maxOutputTokens),
        parseOutputTokens(vars.SCRIBE_MAX_OUTPUT_TOKENS)
      ) ?? DEFAULT_SCRIBE_MODEL.maxOutputTokens,
    strictTools: kv.strictTools === true,
    cacheKeyBuckets:
      parseCacheKeyBuckets(kv.cacheKeyBuckets) ?? DEFAULT_SCRIBE_MODEL.cacheKeyBuckets,
    fallback: fallbackModel ? { model: fallbackModel, providers: fallbackProviders } : null,
    transcribeModel:
      firstDefined(
        parseModel(kv.transcribeModel),
        parseModel(vars.SCRIBE_TRANSCRIBE_MODEL)
      ) ?? model,
  }
}

// --- Switches -----------------------------------------------------------------

export const SCRIBE_KV = {
  enabled: 'scribe:enabled',
  disabledTools: 'scribe:disabled-tools',
  protocolMin: 'scribe:protocol-min',
  minVersion: 'scribe:min-version',
  limits: 'scribe:limits',
  model: 'scribe:model',
  providerHealth: 'scribe:provider-health',
  legacyNotesImport: 'scribe:legacy-notes-import',
  devSession: 'scribe:dev-session',
} as const

/** KV's edge cache for every Scribe AI switch. */
export const KV_CACHE_TTL_SECONDS = 60

const KILL_SWITCH_OFF = new Set(['false', 'off', '0', 'no', 'disabled'])

/**
 * `scribe:enabled`: off for `false`/`off`/`0`/`no`/`disabled`, a JSON
 * `false`, or `{"available": false, …}`. Anything else (and absent) is on.
 */
export const parseEnabled = (raw: string | null): boolean => {
  if (raw == null) return true
  const value = raw.trim()
  if (KILL_SWITCH_OFF.has(value.toLowerCase())) return false
  try {
    const parsed: unknown = JSON.parse(value)
    if (parsed === false) return false
    if (parsed && typeof parsed === 'object' && 'available' in parsed)
      return (parsed as { available?: unknown }).available !== false
  } catch {
    // Not JSON and not an off word: on.
  }
  return true
}

const TOOL_NAME = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/

/** `scribe:disabled-tools`: a JSON array of names or a comma list. */
export const parseDisabledTools = (raw: string | null): string[] => {
  if (raw == null) return []
  let items: unknown[]
  try {
    const parsed: unknown = JSON.parse(raw)
    items = Array.isArray(parsed) ? parsed : raw.split(',')
  } catch {
    items = raw.split(',')
  }
  const names = items
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => TOOL_NAME.test(item))
  return [...new Set(names)]
}

/** `scribe:protocol-min`: an integer ≥ 1, else 1. */
export const parseProtocolMin = (raw: string | null): number => {
  const value = raw == null ? NaN : Number(raw.trim())
  return Number.isInteger(value) && value >= 1 ? value : 1
}

const VERSION = /^\d+\.\d+\.\d+$/

const parseVersion = (raw: string | null | undefined): string | null => {
  if (raw == null) return null
  const value = raw.trim()
  if (VERSION.test(value)) return value
  const record = parseJsonObject(value)
  const version = typeof record?.minVersion === 'string' ? record.minVersion.trim() : null
  if (version && VERSION.test(version)) return version
  try {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed === 'string' && VERSION.test(parsed.trim())) return parsed.trim()
  } catch {
    // Not JSON.
  }
  return null
}

/** `scribe:min-version` → `SCRIBE_MIN_APP_VERSION` → null. Advisory only. */
export const resolveMinAppVersion = (env: Environment, kvRaw: string | null): string | null =>
  parseVersion(kvRaw) ?? parseVersion(env.SCRIBE_MIN_APP_VERSION)

/** `scribe:legacy-notes-import`: `on` (or `true`) re-allows the old routes. */
export const parseLegacyNotesImport = (raw: string | null): boolean => {
  const value = raw?.trim().toLowerCase()
  return value === 'on' || value === 'true'
}

/** How a dev session is metered (`scribe:dev-session`). */
export interface DevSessionMetering {
  /** Keep the configured limits; otherwise every limit is unlimited. */
  realLimits: boolean
  /** The plan to meter as. RevenueCat is never asked for a dev session. */
  plan: ScribePlan
}

export const DEFAULT_DEV_SESSION: DevSessionMetering = { realLimits: false, plan: 'free' }

/**
 * `scribe:dev-session`: `{"limits":"real","plan":"supporter"}`, either field
 * on its own. Read only for dev sessions, so verification can reach the limit
 * card and the Supporter windows; production has no dev sessions.
 */
export const parseDevSession = (raw: string | null): DevSessionMetering => {
  const record = raw == null ? null : parseJsonObject(raw.trim())
  if (!record) return DEFAULT_DEV_SESSION
  return {
    realLimits: record.limits === 'real',
    plan: record.plan === 'supporter' ? 'supporter' : 'free',
  }
}

// --- Resolution ---------------------------------------------------------------

export interface ScribeKv {
  get(key: string, options?: { cacheTtl?: number }): Promise<string | null>
}

/** A KV read that reports failure as `failed` instead of throwing. */
export const readKv = (
  kv: ScribeKv,
  key: string
): Promise<{ value: string | null; failed: boolean }> =>
  Promise.resolve()
    .then(() => kv.get(key, { cacheTtl: KV_CACHE_TTL_SECONDS }))
    .then(
      (value) => ({ value, failed: false }),
      () => ({ value: null, failed: true })
    )

export interface ScribeConfig {
  enabled: boolean
  disabledTools: string[]
  protocolMin: number
  minAppVersion: string | null
  limits: ScribeLimits
  model: ScribeModelConfig
}

/**
 * Every switch at once (the reads start together). A failed read counts as
 * absent: Scribe AI stays on and the defaults apply (fail open, as Notes
 * Import's status does).
 */
export const resolveScribeConfig = async (
  env: Environment,
  kv: ScribeKv = env.NOTES_KV
): Promise<ScribeConfig> => {
  const [enabled, disabledTools, protocolMin, minVersion, limits, model] =
    await Promise.all([
      readKv(kv, SCRIBE_KV.enabled),
      readKv(kv, SCRIBE_KV.disabledTools),
      readKv(kv, SCRIBE_KV.protocolMin),
      readKv(kv, SCRIBE_KV.minVersion),
      readKv(kv, SCRIBE_KV.limits),
      readKv(kv, SCRIBE_KV.model),
    ])
  return {
    enabled: parseEnabled(enabled.value),
    disabledTools: parseDisabledTools(disabledTools.value),
    protocolMin: parseProtocolMin(protocolMin.value),
    minAppVersion: resolveMinAppVersion(env, minVersion.value),
    limits: resolveLimits(env, limits.value),
    model: resolveModelConfig(env, model.value),
  }
}

/**
 * A `dev` session (opened with the dev bypass) on a worker that has the
 * bypass token: unlimited usage and debug `detail`. Production never
 * verifies a `dev` token and has no bypass token.
 */
export const isDevSession = (env: Environment, account: AccountAuth): boolean =>
  account.platform === 'dev' && resolveDevBypassToken(env) != null

/** A dev session's metering (`scribe:dev-session`); null for any other session. */
export const resolveDevSession = async (
  env: Environment,
  account: AccountAuth,
  kv: ScribeKv = env.NOTES_KV
): Promise<DevSessionMetering | null> => {
  if (!isDevSession(env, account)) return null
  return parseDevSession((await readKv(kv, SCRIBE_KV.devSession)).value)
}
