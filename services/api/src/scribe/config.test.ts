import { describe, expect, it } from 'vitest'
import type { Environment } from '../types'
import type { AccountAuth } from '../accounts/auth'
import {
  DEFAULT_SCRIBE_LIMITS,
  DEFAULT_SCRIBE_MODEL,
  isDevSession,
  limitEnvName,
  parseDevSession,
  parseDisabledTools,
  parseEnabled,
  parseLegacyNotesImport,
  parseProtocolMin,
  readKv,
  resolveLimits,
  resolveMinAppVersion,
  resolveModelConfig,
  resolveScribeConfig,
  withDevBypass,
  windowLengthsMs,
} from './config'

const env = (vars: Record<string, string> = {}) => vars as unknown as Environment

const kvOf = (entries: Record<string, string>) => ({
  get: async (key: string) => entries[key] ?? null,
})

describe('limitEnvName', () => {
  it('snake-cases the field path under SCRIBE_', () => {
    expect(limitEnvName(['free', 'weekly'])).toBe('SCRIBE_FREE_WEEKLY')
    expect(limitEnvName(['windowLengths', 'sessionHours'])).toBe(
      'SCRIBE_WINDOW_LENGTHS_SESSION_HOURS'
    )
    expect(limitEnvName(['maxToolSchemaBytes'])).toBe('SCRIBE_MAX_TOOL_SCHEMA_BYTES')
    expect(limitEnvName(['transcribePagesPerDay', 'free'])).toBe(
      'SCRIBE_TRANSCRIBE_PAGES_PER_DAY_FREE'
    )
  })
})

describe('resolveLimits', () => {
  it('uses the protocol defaults when nothing is set', () => {
    expect(resolveLimits(env(), null)).toEqual(DEFAULT_SCRIBE_LIMITS)
  })

  it('takes each field from KV, then the env var, then the default', () => {
    const limits = resolveLimits(
      env({ SCRIBE_FREE_MONTHLY: '1000', SCRIBE_SUPPORTER_SESSION: '2000' }),
      JSON.stringify({ free: { weekly: 500 } })
    )
    expect(limits.free.weekly).toBe(500)
    expect(limits.supporter.session).toBe(2000)
    expect(limits.supporter.weekly).toBe(DEFAULT_SCRIBE_LIMITS.supporter.weekly)
  })

  it('lets a malformed KV field fall through without taking the others', () => {
    const limits = resolveLimits(
      env({ SCRIBE_GRACE_UNITS: '10' }),
      JSON.stringify({
        graceUnits: 'lots',
        activeStepCap: 0,
        free: { weekly: -2 },
        weights: { output: 4, cacheWrite: -1 },
        windowLengths: { sessionHours: 0.01 },
      })
    )
    expect(limits.graceUnits).toBe(10)
    expect(limits.activeStepCap).toBe(DEFAULT_SCRIBE_LIMITS.activeStepCap)
    expect(limits.free.weekly).toBe(DEFAULT_SCRIBE_LIMITS.free.weekly)
    expect(limits.weights).toEqual({ input: 1, cachedInput: 0.1, cacheWrite: 1.25, output: 4 })
    // Fractional window lengths are allowed, for short dev windows.
    expect(limits.windowLengths.sessionHours).toBe(0.01)
  })

  it('accepts -1 (unlimited) for allowances only', () => {
    const limits = resolveLimits(
      env(),
      JSON.stringify({ free: { weekly: -1 }, maxTools: -1, graceUnits: -1 })
    )
    expect(limits.free.weekly).toBe(-1)
    expect(limits.maxTools).toBe(DEFAULT_SCRIBE_LIMITS.maxTools)
    expect(limits.graceUnits).toBe(DEFAULT_SCRIBE_LIMITS.graceUnits)
  })

  it('ignores KV that is not a JSON object', () => {
    expect(resolveLimits(env(), 'not json')).toEqual(DEFAULT_SCRIBE_LIMITS)
    expect(resolveLimits(env(), '[1,2]')).toEqual(DEFAULT_SCRIBE_LIMITS)
  })

  it('never mutates the defaults', () => {
    resolveLimits(env(), JSON.stringify({ free: { weekly: 1 } }))
    expect(DEFAULT_SCRIBE_LIMITS.free.weekly).toBe(25_000)
  })
})

describe('withDevBypass', () => {
  it('makes every usage limit unlimited and keeps request caps', () => {
    const limits = withDevBypass(DEFAULT_SCRIBE_LIMITS, true)
    expect(limits.free).toEqual({ weekly: -1, welcome: -1, graceUnits: 15_000 })
    expect(limits.supporter).toEqual({ session: -1, weekly: -1 })
    expect(limits.transcribePagesPerDay).toEqual({ free: -1, supporter: -1 })
    expect(limits.maxStepsPerTurn).toBe(DEFAULT_SCRIBE_LIMITS.maxStepsPerTurn)
    expect(limits.activeStepCap).toBe(DEFAULT_SCRIBE_LIMITS.activeStepCap)
  })

  it('leaves the limits alone without the bypass', () => {
    expect(withDevBypass(DEFAULT_SCRIBE_LIMITS, false)).toBe(DEFAULT_SCRIBE_LIMITS)
  })
})

describe('windowLengthsMs', () => {
  it('converts hours and days', () => {
    expect(windowLengthsMs(DEFAULT_SCRIBE_LIMITS)).toEqual({
      session: 5 * 3_600_000,
      weekly: 7 * 86_400_000,
      monthly: 30 * 86_400_000,
    })
  })
})

describe('resolveModelConfig', () => {
  it('defaults to gpt-6-luna on Azure with medium reasoning', () => {
    expect(resolveModelConfig(env(), null)).toEqual(DEFAULT_SCRIBE_MODEL)
  })

  it('takes each field from KV, then the env var, then the default', () => {
    const config = resolveModelConfig(
      env({
        SCRIBE_MODEL: 'openai/gpt-env',
        SCRIBE_PROVIDERS: 'azure, openai',
        SCRIBE_REASONING_EFFORT: 'medium',
        SCRIBE_MAX_OUTPUT_TOKENS: '2048',
      }),
      JSON.stringify({ model: 'openai/gpt-kv', reasoningEffort: 'off', strictTools: true })
    )
    expect(config.model).toBe('openai/gpt-kv')
    expect(config.providers).toEqual(['azure', 'openai'])
    expect(config.reasoningEffort).toBeNull()
    expect(config.maxOutputTokens).toBe(2048)
    expect(config.strictTools).toBe(true)
    expect(config.transcribeModel).toBe('openai/gpt-kv')
  })

  it('reads strictTools from KV only', () => {
    expect(resolveModelConfig(env({ SCRIBE_STRICT_TOOLS: 'true' }), null).strictTools).toBe(false)
    expect(resolveModelConfig(env(), '{"strictTools":"yes"}').strictTools).toBe(false)
  })

  it('reads cacheKeyBuckets from KV only: an integer 0–1024, else 0', () => {
    expect(resolveModelConfig(env(), null).cacheKeyBuckets).toBe(0)
    expect(resolveModelConfig(env(), '{"cacheKeyBuckets":8}').cacheKeyBuckets).toBe(8)
    expect(resolveModelConfig(env(), '{"cacheKeyBuckets":1024}').cacheKeyBuckets).toBe(1024)
    for (const bad of ['-1', '1.5', '1025', '"8"', 'true'])
      expect(resolveModelConfig(env(), `{"cacheKeyBuckets":${bad}}`).cacheKeyBuckets).toBe(0)
    expect(
      resolveModelConfig(env({ SCRIBE_CACHE_KEY_BUCKETS: '8' }), null).cacheKeyBuckets
    ).toBe(0)
  })

  it('accepts only the efforts GPT-6 Luna supports (no minimal)', () => {
    expect(resolveModelConfig(env(), '{"reasoningEffort":"minimal"}').reasoningEffort).toBe('medium')
    expect(
      resolveModelConfig(env({ SCRIBE_REASONING_EFFORT: 'minimal' }), null).reasoningEffort
    ).toBe('medium')
    for (const effort of ['low', 'medium', 'high', 'xhigh', 'max'])
      expect(
        resolveModelConfig(env(), JSON.stringify({ reasoningEffort: effort })).reasoningEffort
      ).toBe(effort)
    expect(resolveModelConfig(env(), '{"reasoningEffort":"none"}').reasoningEffort).toBeNull()
  })

  it('falls through invalid values', () => {
    const config = resolveModelConfig(
      env({ SCRIBE_REASONING_EFFORT: 'turbo' }),
      JSON.stringify({ model: 'no slash', providers: [], maxOutputTokens: 0, reasoningEffort: 7 })
    )
    expect(config.model).toBe(DEFAULT_SCRIBE_MODEL.model)
    expect(config.providers).toEqual(DEFAULT_SCRIBE_MODEL.providers)
    expect(config.maxOutputTokens).toBe(DEFAULT_SCRIBE_MODEL.maxOutputTokens)
    expect(config.reasoningEffort).toBe('medium')
  })

  it('builds a fallback whose providers default to the primary ones', () => {
    expect(
      resolveModelConfig(env({ SCRIBE_PROVIDERS: 'azure' }), '{"fallback":{"model":"openai/gpt-b"}}')
        .fallback
    ).toEqual({ model: 'openai/gpt-b', providers: ['azure'] })
    expect(
      resolveModelConfig(
        env({ SCRIBE_FALLBACK_MODEL: 'openai/gpt-c', SCRIBE_FALLBACK_PROVIDERS: 'openai' }),
        null
      ).fallback
    ).toEqual({ model: 'openai/gpt-c', providers: ['openai'] })
  })

  it('reads the transcribe model on its own', () => {
    expect(
      resolveModelConfig(env({ SCRIBE_TRANSCRIBE_MODEL: 'openai/vision-1' }), null).transcribeModel
    ).toBe('openai/vision-1')
  })
})

describe('switches', () => {
  it.each([
    [null, true],
    ['true', true],
    ['on', true],
    ['false', false],
    ['OFF', false],
    ['0', false],
    ['no', false],
    ['disabled', false],
    ['{"available":false,"reason":"maintenance"}', false],
    ['{"available":true}', true],
    ['garbage', true],
  ])('scribe:enabled %s → %s', (raw, enabled) => {
    expect(parseEnabled(raw)).toBe(enabled)
  })

  it('reads disabled tools as a JSON array or a comma list', () => {
    expect(parseDisabledTools('["visits_delete","plans_update"]')).toEqual([
      'visits_delete',
      'plans_update',
    ])
    expect(parseDisabledTools('visits_delete, plans_update,visits_delete')).toEqual([
      'visits_delete',
      'plans_update',
    ])
    expect(parseDisabledTools('["Bad Name", 3, "ok_name"]')).toEqual(['ok_name'])
    expect(parseDisabledTools(null)).toEqual([])
  })

  it('reads the protocol minimum as an integer ≥ 1', () => {
    expect(parseProtocolMin('2')).toBe(2)
    expect(parseProtocolMin('0')).toBe(1)
    expect(parseProtocolMin('x')).toBe(1)
    expect(parseProtocolMin(null)).toBe(1)
  })

  it('reads the min app version from KV, then the env var', () => {
    expect(resolveMinAppVersion(env(), '{"minVersion":"1.40.0"}')).toBe('1.40.0')
    expect(resolveMinAppVersion(env(), '1.41.2')).toBe('1.41.2')
    expect(resolveMinAppVersion(env(), '"1.42.0"')).toBe('1.42.0')
    expect(resolveMinAppVersion(env({ SCRIBE_MIN_APP_VERSION: '1.39.0' }), 'nope')).toBe('1.39.0')
    expect(resolveMinAppVersion(env(), null)).toBeNull()
  })

  it('re-allows the legacy routes only for on/true', () => {
    expect(parseLegacyNotesImport('on')).toBe(true)
    expect(parseLegacyNotesImport(' TRUE ')).toBe(true)
    expect(parseLegacyNotesImport('off')).toBe(false)
    expect(parseLegacyNotesImport(null)).toBe(false)
  })
})

describe('readKv', () => {
  it('reads with the 60 s edge cache', async () => {
    const calls: unknown[] = []
    const kv = {
      get: async (key: string, options?: unknown) => {
        calls.push(options)
        return key
      },
    }
    expect(await readKv(kv, 'scribe:enabled')).toEqual({ value: 'scribe:enabled', failed: false })
    expect(calls).toEqual([{ cacheTtl: 60 }])
  })

  it('reports a failed read, including a missing binding', async () => {
    const throwing = { get: async () => Promise.reject(new Error('kv down')) }
    expect(await readKv(throwing, 'k')).toEqual({ value: null, failed: true })
    expect(await readKv(undefined as never, 'k')).toEqual({ value: null, failed: true })
  })
})

describe('resolveScribeConfig', () => {
  it('resolves every switch from KV', async () => {
    const config = await resolveScribeConfig(
      env(),
      kvOf({
        'scribe:enabled': 'off',
        'scribe:disabled-tools': 'visits_delete',
        'scribe:protocol-min': '1',
        'scribe:min-version': '1.40.0',
        'scribe:limits': '{"free":{"weekly":10}}',
        'scribe:model': '{"reasoningEffort":"medium"}',
      })
    )
    expect(config.enabled).toBe(false)
    expect(config.disabledTools).toEqual(['visits_delete'])
    expect(config.minAppVersion).toBe('1.40.0')
    expect(config.limits.free.weekly).toBe(10)
    expect(config.model.reasoningEffort).toBe('medium')
  })

  it('fails open when KV is down', async () => {
    const config = await resolveScribeConfig(env(), {
      get: async () => Promise.reject(new Error('kv down')),
    })
    expect(config.enabled).toBe(true)
    expect(config.limits).toEqual(DEFAULT_SCRIBE_LIMITS)
    expect(config.model).toEqual(DEFAULT_SCRIBE_MODEL)
  })
})

describe('isDevSession', () => {
  const account = (platform: string) => ({ platform }) as unknown as AccountAuth

  it('needs a dev session on a worker with the bypass token', () => {
    const withBypass = env({
      APP_ATTEST_ENVIRONMENT: 'development',
      NOTES_IMPORT_DEV_BYPASS_TOKEN: 'secret',
    })
    expect(isDevSession(withBypass, account('dev'))).toBe(true)
    expect(isDevSession(withBypass, account('ios'))).toBe(false)
    expect(isDevSession(env({ APP_ATTEST_ENVIRONMENT: 'production' }), account('dev'))).toBe(
      false
    )
  })
})

describe('parseDevSession', () => {
  it('keeps the dev bypass (unlimited, free) unless told otherwise', () => {
    expect(parseDevSession(null)).toEqual({ realLimits: false, plan: 'free' })
    expect(parseDevSession('not json')).toEqual({ realLimits: false, plan: 'free' })
    expect(parseDevSession('{"limits":"unlimited","plan":"gold"}')).toEqual({
      realLimits: false,
      plan: 'free',
    })
  })

  it('reads real limits and the Supporter plan, each on its own', () => {
    expect(parseDevSession('{"limits":"real"}')).toEqual({ realLimits: true, plan: 'free' })
    expect(parseDevSession(' {"plan":"supporter"} ')).toEqual({
      realLimits: false,
      plan: 'supporter',
    })
  })
})
