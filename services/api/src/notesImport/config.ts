import { z } from 'zod'
import type { Environment } from '../types'
import { resolveDevBypassToken } from '../devBypass'

/**
 * Environment-only Notes Import controls (model/provider, abuse ceilings,
 * active concurrency, Empty Import grace, and retention). Usage allowances are
 * resolved separately at runtime from KV → env → defaults below.
 */
/** OpenRouter reasoning effort levels, or null to leave reasoning off. */
export type ReasoningEffort =
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'
  | null

export interface NotesImportConfig {
  model: string
  /**
   * OpenRouter provider allowlist — vetted **Western** ZDR hosts (ADR 0008),
   * IN ROUTING-PRIORITY ORDER (used for both `only` and `order`): the first is
   * preferred, the rest are fallbacks tried in turn when it errors (e.g. a 429).
   * This list controls *jurisdiction*; `zdr: true` + `data_collection: 'deny'`
   * enforce *retention* separately. Keep it Western-only: ZDR means the data
   * isn't stored, but the host still processes it in-flight, and a Western host
   * means enforceable recourse if that policy is ever broken. DeepInfra is
   * deliberately excluded — its reasoning parser misroutes the structured JSON
   * into the reasoning channel (no genuine reasoning; see llm.ts recovery path).
   */
  providers: string[]
  maxChars: number
  maxOutputTokens: number
  /**
   * Rolling window (seconds) over which free Empty Imports are counted. An Empty
   * Import (a run that produced no records) doesn't spend a credit, but each still
   * costs a real model call — so only {@link emptyWindowLimit} of them are free
   * within this window before they charge again (ADR 0012). Default 7 days.
   */
  emptyWindowSeconds: number
  /** Free Empty Imports allowed per {@link emptyWindowSeconds} before soft degrade. Default 5. */
  emptyWindowLimit: number
  /**
   * @deprecated Ignored by `isSupporter` (witness-work ADR 0014). Remove once
   * no caller passes it.
   */
  entitlementId: string
  devBypassToken: string | null
  /** Reject development App Attest attestations in the production Worker. */
  requireProduction: boolean
  /** Max concurrent in-flight imports per identity (non-Supporter). */
  activeImportCap: number
  /** Max concurrent in-flight imports per identity (Supporter). */
  activeImportCapSupporter: number
  /** How long a finished import's DO retains its result for reconnect (seconds). */
  resultRetentionSeconds: number
  /** TTL of a subscribe capability token in KV (seconds). */
  subscribeTokenTtlSeconds: number
  /**
   * OpenRouter reasoning effort, or null to disable. V4.1 Flash supports
   * `low`, `high`, and `max`. Legacy `xhigh` overrides normalize to `max`
   * for that model; other models retain the gateway's broader effort range.
   * Reasoning helps with date math, deduplication, and role inference.
   *
   * The model co-emits reasoning and strict structured output through
   * `response_format: json_schema` (`Output.object`, rather than tool calling).
   * Some hosts misroute the final JSON into the reasoning channel and leave
   * the completion blank. `runNotesImportModel` recovers a schema-valid object
   * only when that blank response finished normally.
   */
  reasoningEffort: ReasoningEffort
  /**
   * Vision model that reads a photographed page into plain text before the
   * text import runs (Import from Paper). Routed through the same Western ZDR
   * provider allowlist as {@link model}.
   */
  transcribeModel: string
  /** Largest accepted page image, in decoded bytes. */
  transcribeMaxBytes: number
  /** `maxOutputTokens` ceiling for one page's transcription. */
  transcribeMaxOutputTokens: number
  /** Pages one identity may transcribe per rolling day (non-Supporter). */
  transcribePagesPerDay: number
  /** Pages one identity may transcribe per rolling day (Supporter). */
  transcribePagesPerDaySupporter: number
}

const DEFAULTS = {
  model: 'openai/gpt-6-luna',
  // Western ZDR hosts, in routing-priority order (ADR 0008). Azure is the only
  // OpenRouter host serving GPT-6 Luna. `zdr: true` gates each endpoint's retention.
  providers: ['azure'],
  maxChars: 100_000,
  // Includes reasoning and the final JSON. Historical multi-contact imports
  // exhausted 16k before emitting a complete object at xhigh.
  maxOutputTokens: 32_000,
  emptyWindowSeconds: 7 * 24 * 60 * 60,
  emptyWindowLimit: 5,
  entitlementId: 'Supporter',
  activeImportCap: 2,
  activeImportCapSupporter: 5,
  resultRetentionSeconds: 3_600,
  subscribeTokenTtlSeconds: 3_600,
  // Higher effort repeatedly exhausted the output budget on historical notes.
  // Low still reasons, and leaves room for the complete structured result.
  reasoningEffort: 'low' as ReasoningEffort,
  transcribeMaxBytes: 4 * 1024 * 1024,
  transcribeMaxOutputTokens: 8_000,
  // A full paper backlog is 10 pages per batch; leave room for a few batches.
  transcribePagesPerDay: 40,
  transcribePagesPerDaySupporter: 200,
} as const

export interface NotesImportLimits {
  importsFree: number
  importsSupporter: number
  refinementsFree: number
  refinementsSupporter: number
  windowDays: number
}

export interface EffectiveAllowances {
  imports: number
  refinements: number
}

/** Minimal KV interface for the runtime limits document. */
export interface LimitsKv {
  get(key: string, options?: { cacheTtl?: number }): Promise<string | null>
}

const LIMITS_DEFAULTS: NotesImportLimits = {
  importsFree: 3,
  importsSupporter: -1,
  refinementsFree: 5,
  refinementsSupporter: -1,
  windowDays: 30,
}

const LIMITS_KEY = 'notes-import:limits'
const LIMITS_CACHE_TTL_SECONDS = 60
const DAY_MS = 24 * 60 * 60 * 1000
/** Last timestamp whose UTC ISO representation has a client-supported 4-digit year. */
const MAX_FOUR_DIGIT_UTC_MS = 253_402_300_799_999

const REASONING_EFFORTS = new Set([
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
])

/**
 * Parse the reasoning-effort env override; empty / `off` / `none` disables.
 * V4.1 Flash's catalog exposes low/high/max, not the older model's xhigh.
 * Preserve legacy xhigh overrides as max, and reject other unsupported levels.
 */
const reasoningOr = (
  raw: string | undefined,
  fallback: ReasoningEffort,
  model: string
): ReasoningEffort => {
  if (raw == null) return fallback
  const v = raw.trim().toLowerCase()
  if (v === '' || v === 'off' || v === 'none') return null
  if (model.startsWith('deepseek/deepseek-v4.1-flash')) {
    if (v === 'xhigh') return 'max'
    return ['low', 'high', 'max'].includes(v) ? v as ReasoningEffort : fallback
  }
  return REASONING_EFFORTS.has(v) ? v as ReasoningEffort : fallback
}

const intOr = (raw: string | undefined, fallback: number): number => {
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

const validAllowance = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= -1

const windowDurationMs = (
  value: unknown,
  now = Date.now()
): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null
  }
  const duration = value * DAY_MS
  if (!Number.isFinite(duration) || duration <= 0) return null

  // JavaScript's ISO formatter supports extended years such as +010240, but the
  // client contract accepts only 0000-9999. Every active anchor is at or before
  // now, so bounding the newest possible anchor also bounds every reset emitted
  // from an older one. Subtraction avoids overflowing `now + duration`.
  if (
    !Number.isFinite(now) ||
    now > MAX_FOUR_DIGIT_UTC_MS ||
    duration > MAX_FOUR_DIGIT_UTC_MS - now
  ) {
    return null
  }
  return duration
}

const validWindowDays = (value: unknown, now = Date.now()): value is number =>
  windowDurationMs(value, now) != null

const envAllowanceOr = (raw: string | undefined, fallback: number): number => {
  if (raw == null || raw.trim() === '') return fallback
  const value = Number(raw)
  return validAllowance(value) ? value : fallback
}

const envWindowDaysOr = (
  raw: string | undefined,
  fallback: number,
  now: number
): number => {
  if (raw != null && raw.trim() !== '') {
    const value = Number(raw)
    if (validWindowDays(value, now)) return value
  }
  if (validWindowDays(fallback, now)) return fallback
  throw new RangeError('Invalid default Notes Import windowDays')
}

const listOr = (raw: string | undefined, fallback: readonly string[]): string[] => {
  if (!raw) return [...fallback]
  const items = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return items.length ? items : [...fallback]
}

/**
 * Resolve allowance policy independently per field: KV, then environment, then
 * code default. KV is edge-cached for 60 seconds. Bad runtime configuration is
 * observable but never blocks Notes Import.
 */
export const resolveNotesImportLimits = async (
  env: Environment,
  kv: LimitsKv
): Promise<NotesImportLimits> => {
  const now = Date.now()
  let document: Record<string, unknown> = {}
  try {
    const raw = await kv.get(LIMITS_KEY, {
      cacheTtl: LIMITS_CACHE_TTL_SECONDS,
    })
    if (raw != null) {
      const parsed: unknown = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        document = parsed as Record<string, unknown>
      } else {
        console.warn('notes-import limits KV document must be a JSON object')
      }
    }
  } catch (error) {
    console.warn('notes-import limits KV read/parse failed', error)
  }

  const envLimits: NotesImportLimits = {
    importsFree: envAllowanceOr(
      env.NOTES_IMPORT_FREE_CREDITS,
      LIMITS_DEFAULTS.importsFree
    ),
    importsSupporter: envAllowanceOr(
      env.NOTES_IMPORT_FREE_CREDITS_SUPPORTER,
      LIMITS_DEFAULTS.importsSupporter
    ),
    refinementsFree: envAllowanceOr(
      env.NOTES_IMPORT_MAX_REFINEMENTS,
      LIMITS_DEFAULTS.refinementsFree
    ),
    refinementsSupporter: envAllowanceOr(
      env.NOTES_IMPORT_MAX_REFINEMENTS_SUPPORTER,
      LIMITS_DEFAULTS.refinementsSupporter
    ),
    windowDays: envWindowDaysOr(
      env.NOTES_IMPORT_WINDOW_DAYS,
      LIMITS_DEFAULTS.windowDays,
      now
    ),
  }

  const allowanceField = (
    key: keyof Omit<NotesImportLimits, 'windowDays'>
  ): number => {
    if (!(key in document)) return envLimits[key]
    const value = document[key]
    if (validAllowance(value)) return value
    console.warn(`notes-import limits KV field ${key} is invalid`)
    return envLimits[key]
  }

  let windowDays = envLimits.windowDays
  if ('windowDays' in document) {
    if (validWindowDays(document.windowDays, now)) windowDays = document.windowDays
    else console.warn('notes-import limits KV field windowDays is invalid')
  }

  return {
    importsFree: allowanceField('importsFree'),
    importsSupporter: allowanceField('importsSupporter'),
    refinementsFree: allowanceField('refinementsFree'),
    refinementsSupporter: allowanceField('refinementsSupporter'),
    windowDays,
  }
}

const MIN_APP_VERSION_KEY = 'notes-import:min-version'
const MIN_APP_VERSION_CACHE_TTL_SECONDS = 60
/** Strict `major.minor.patch` — matches the app's `app.config.ts` version. */
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/

/** A trimmed `major.minor.patch` string. Shared by the KV and env schemas. */
const appVersionSchema = z.string().trim().regex(SEMVER_PATTERN)

/**
 * KV `notes-import:min-version` document: `{ "minVersion": "1.42.0" }` or a bare
 * `"1.42.0"` string. Normalised to the version string.
 */
const kvMinAppVersionSchema = z
  .union([z.object({ minVersion: appVersionSchema }), appVersionSchema])
  .transform((value) => (typeof value === 'string' ? value : value.minVersion))

/** JSON when it parses, otherwise the raw text (an unquoted `1.42.0`). */
const parseJsonOrRaw = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

/**
 * Parse a raw KV `notes-import:min-version` value into a `major.minor.patch`
 * string, or null when it isn't one. Pure — never throws, never logs.
 */
export const parseMinAppVersion = (raw: string): string | null => {
  const result = kvMinAppVersionSchema.safeParse(parseJsonOrRaw(raw))
  return result.success ? result.data : null
}

const isBlank = (value: string | null | undefined): boolean =>
  value == null || value.trim() === ''

const readMinAppVersionFromKv = async (
  kv: LimitsKv
): Promise<string | null> => {
  let raw: string | null
  try {
    raw = await kv.get(MIN_APP_VERSION_KEY, {
      cacheTtl: MIN_APP_VERSION_CACHE_TTL_SECONDS,
    })
  } catch (error) {
    console.warn('notes-import min-version KV read failed', error)
    return null
  }
  if (raw == null || isBlank(raw)) return null

  const version = parseMinAppVersion(raw)
  if (version == null) {
    console.warn('notes-import min-version KV value is invalid')
  }
  return version
}

const readMinAppVersionFromEnv = (env: Environment): string | null => {
  const raw = env.NOTES_IMPORT_MIN_APP_VERSION
  if (raw == null || isBlank(raw)) return null

  const result = appVersionSchema.safeParse(raw)
  if (result.success) return result.data
  console.warn('NOTES_IMPORT_MIN_APP_VERSION is invalid')
  return null
}

/**
 * Resolve the minimum app version allowed to use Notes Import, or null when
 * unset. Resolution: KV `notes-import:min-version` → `NOTES_IMPORT_MIN_APP_VERSION`
 * env var → null. KV accepts `{"minVersion":"1.42.0"}`, a bare JSON string, or
 * an unquoted `1.42.0`. Invalid values are warned about and ignored — never
 * throws, never blocks.
 *
 * Bump this when a deploy changes the request/response contract in a way older
 * app builds can't handle. The app compares it against its own
 * `Constants.expoConfig.version` and disables the composer when below.
 */
export const resolveNotesImportMinAppVersion = async (
  env: Environment,
  kv: LimitsKv
): Promise<string | null> =>
  (await readMinAppVersionFromKv(kv)) ?? readMinAppVersionFromEnv(env)

/** Select tier policy; dev bypass changes allowances only, never entitlement. */
export const selectEffectiveAllowances = (
  limits: NotesImportLimits,
  isSupporter: boolean,
  devBypass: boolean
): EffectiveAllowances => {
  if (devBypass) return { imports: -1, refinements: -1 }
  return isSupporter
    ? {
        imports: limits.importsSupporter,
        refinements: limits.refinementsSupporter,
      }
    : { imports: limits.importsFree, refinements: limits.refinementsFree }
}

export const limitsWindowDurationMs = (limits: NotesImportLimits): number => {
  const duration = windowDurationMs(limits.windowDays)
  if (duration == null) throw new RangeError('Invalid Notes Import windowDays')
  return duration
}

const appAttestConfig = (
  env: Environment
): Pick<NotesImportConfig, 'devBypassToken' | 'requireProduction'> => ({
  devBypassToken: resolveDevBypassToken(env),
  requireProduction: env.APP_ATTEST_ENVIRONMENT === 'production',
})

/** Read alone by the public status probe, which has no App Attest config. */
export const resolveTranscribeMaxBytes = (env: Environment): number =>
  intOr(env.NOTES_IMPORT_TRANSCRIBE_MAX_BYTES, DEFAULTS.transcribeMaxBytes)

export const getNotesImportConfig = (env: Environment): NotesImportConfig => ({
  model: env.NOTES_IMPORT_MODEL?.trim() || DEFAULTS.model,
  providers: listOr(env.NOTES_IMPORT_PROVIDERS, DEFAULTS.providers),
  maxChars: intOr(env.NOTES_IMPORT_MAX_CHARS, DEFAULTS.maxChars),
  maxOutputTokens: intOr(
    env.NOTES_IMPORT_MAX_OUTPUT_TOKENS,
    DEFAULTS.maxOutputTokens
  ),
  emptyWindowSeconds: intOr(
    env.NOTES_IMPORT_EMPTY_WINDOW_SECONDS,
    DEFAULTS.emptyWindowSeconds
  ),
  emptyWindowLimit: intOr(
    env.NOTES_IMPORT_EMPTY_WINDOW_LIMIT,
    DEFAULTS.emptyWindowLimit
  ),
  entitlementId:
    env.REVENUECAT_ENTITLEMENT_ID?.trim() || DEFAULTS.entitlementId,
  ...appAttestConfig(env),
  activeImportCap: intOr(env.NOTES_IMPORT_ACTIVE_CAP, DEFAULTS.activeImportCap),
  activeImportCapSupporter: intOr(
    env.NOTES_IMPORT_ACTIVE_CAP_SUPPORTER,
    DEFAULTS.activeImportCapSupporter
  ),
  resultRetentionSeconds: intOr(
    env.NOTES_IMPORT_RESULT_RETENTION_SECONDS,
    DEFAULTS.resultRetentionSeconds
  ),
  subscribeTokenTtlSeconds: intOr(
    env.NOTES_IMPORT_SUBSCRIBE_TOKEN_TTL_SECONDS,
    DEFAULTS.subscribeTokenTtlSeconds
  ),
  reasoningEffort: reasoningOr(
    env.NOTES_IMPORT_REASONING_EFFORT,
    DEFAULTS.reasoningEffort,
    env.NOTES_IMPORT_MODEL?.trim() || DEFAULTS.model
  ),
  transcribeModel:
    env.NOTES_IMPORT_TRANSCRIBE_MODEL?.trim() ||
    env.NOTES_IMPORT_MODEL?.trim() ||
    DEFAULTS.model,
  transcribeMaxBytes: resolveTranscribeMaxBytes(env),
  transcribeMaxOutputTokens: intOr(
    env.NOTES_IMPORT_TRANSCRIBE_MAX_OUTPUT_TOKENS,
    DEFAULTS.transcribeMaxOutputTokens
  ),
  transcribePagesPerDay: intOr(
    env.NOTES_IMPORT_TRANSCRIBE_PAGES_PER_DAY,
    DEFAULTS.transcribePagesPerDay
  ),
  transcribePagesPerDaySupporter: intOr(
    env.NOTES_IMPORT_TRANSCRIBE_PAGES_PER_DAY_SUPPORTER,
    DEFAULTS.transcribePagesPerDaySupporter
  ),
})
