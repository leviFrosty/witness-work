import { describe, expect, it, vi } from 'vitest'
import {
  getNotesImportConfig,
  limitsWindowDurationMs,
  resolveNotesImportLimits,
  selectEffectiveAllowances,
  type LimitsKv,
} from './config'
import type { Environment } from '../types'

const baseEnv = { APP_ATTEST_ENVIRONMENT: 'production' } as Environment

const limitsKv = (value: string | null): LimitsKv => ({
  get: vi.fn(async () => value) as LimitsKv['get'],
})

describe('getNotesImportConfig — environment-only knobs', () => {
  it('falls back to provider, model, concurrency, and Empty Import defaults', () => {
    const cfg = getNotesImportConfig(baseEnv)
    expect(cfg.model).toBe('openai/gpt-6-luna')
    expect(cfg.providers).toEqual(['azure'])
    expect(cfg.maxChars).toBe(100_000)
    expect(cfg.maxOutputTokens).toBe(32_000)
    expect(cfg.reasoningEffort).toBe('low')
    expect(cfg.emptyWindowSeconds).toBe(604_800)
    expect(cfg.emptyWindowLimit).toBe(5)
    expect(cfg.entitlementId).toBe('Supporter')
    expect(cfg.devBypassToken).toBeNull()
    expect(cfg.requireProduction).toBe(true)
  })

  it('uses the model catalog efforts and preserves legacy maximum overrides', () => {
    for (const effort of ['low', 'high', 'max']) {
      expect(getNotesImportConfig({ ...baseEnv, NOTES_IMPORT_REASONING_EFFORT: effort } as Environment).reasoningEffort).toBe(effort)
    }
    expect(getNotesImportConfig({ ...baseEnv, NOTES_IMPORT_MODEL: 'deepseek/deepseek-v4.1-flash', NOTES_IMPORT_REASONING_EFFORT: 'xhigh' } as Environment).reasoningEffort).toBe('max')
    expect(getNotesImportConfig({ ...baseEnv, NOTES_IMPORT_REASONING_EFFORT: 'off' } as Environment).reasoningEffort).toBeNull()
    expect(getNotesImportConfig({ ...baseEnv, NOTES_IMPORT_MODEL: 'deepseek/deepseek-v4.1-flash', NOTES_IMPORT_REASONING_EFFORT: 'medium' } as Environment).reasoningEffort).toBe('low')
    expect(getNotesImportConfig({ ...baseEnv, NOTES_IMPORT_MODEL: 'other/model', NOTES_IMPORT_REASONING_EFFORT: 'xhigh' } as Environment).reasoningEffort).toBe('xhigh')
  })

  it('uses the explicit environment and rejects a production bypass', () => {
    expect(getNotesImportConfig(baseEnv).requireProduction).toBe(true)
    expect(
      getNotesImportConfig({
        ...baseEnv,
        APP_ATTEST_ENVIRONMENT: 'development',
        NOTES_IMPORT_DEV_BYPASS_TOKEN: 'tok',
      } as Environment).requireProduction
    ).toBe(false)
    expect(
      getNotesImportConfig({
        ...baseEnv,
        APP_ATTEST_ENVIRONMENT: 'development',
        NOTES_IMPORT_DEV_BYPASS_TOKEN: '   ',
      } as Environment).requireProduction
    ).toBe(false)
    expect(() =>
      getNotesImportConfig({
        ...baseEnv,
        NOTES_IMPORT_DEV_BYPASS_TOKEN: 'tok',
      } as Environment)
    ).toThrow('cannot be set in production')
    expect(() =>
      getNotesImportConfig({} as Environment)
    ).toThrow('must be explicitly configured')
  })

  it('honors environment-only overrides without moving unrelated controls to KV', () => {
    const cfg = getNotesImportConfig({
      ...baseEnv,
      NOTES_IMPORT_MODEL: 'fireworks/some-model',
      NOTES_IMPORT_PROVIDERS: 'fireworks, deepinfra ,, baseten',
      NOTES_IMPORT_MAX_CHARS: '250000',
      NOTES_IMPORT_EMPTY_WINDOW_SECONDS: '86400',
      NOTES_IMPORT_EMPTY_WINDOW_LIMIT: '3',
      APP_ATTEST_ENVIRONMENT: 'development',
      NOTES_IMPORT_DEV_BYPASS_TOKEN: 'tok',
    } as Environment)
    expect(cfg.model).toBe('fireworks/some-model')
    expect(cfg.providers).toEqual(['fireworks', 'deepinfra', 'baseten'])
    expect(cfg.maxChars).toBe(250_000)
    expect(cfg.emptyWindowSeconds).toBe(86_400)
    expect(cfg.emptyWindowLimit).toBe(3)
    expect(cfg.devBypassToken).toBe('tok')
  })
})

describe('resolveNotesImportLimits — KV > env > defaults per field', () => {
  it('uses the five code defaults', async () => {
    await expect(resolveNotesImportLimits(baseEnv, limitsKv(null))).resolves.toEqual({
      importsFree: 3,
      importsSupporter: -1,
      refinementsFree: 5,
      refinementsSupporter: -1,
      windowDays: 30,
    })
  })

  it('accepts every environment override including -1, zero, and fractional days', async () => {
    const env = {
      ...baseEnv,
      NOTES_IMPORT_FREE_CREDITS: '0',
      NOTES_IMPORT_FREE_CREDITS_SUPPORTER: '12',
      NOTES_IMPORT_MAX_REFINEMENTS: '-1',
      NOTES_IMPORT_MAX_REFINEMENTS_SUPPORTER: '0',
      NOTES_IMPORT_WINDOW_DAYS: '0.0007',
    } as Environment
    await expect(resolveNotesImportLimits(env, limitsKv(null))).resolves.toEqual({
      importsFree: 0,
      importsSupporter: 12,
      refinementsFree: -1,
      refinementsSupporter: 0,
      windowDays: 0.0007,
    })
  })

  it('uses each valid KV field over env and independently falls through missing fields', async () => {
    const env = {
      ...baseEnv,
      NOTES_IMPORT_FREE_CREDITS: '4',
      NOTES_IMPORT_FREE_CREDITS_SUPPORTER: '8',
      NOTES_IMPORT_MAX_REFINEMENTS: '6',
      NOTES_IMPORT_MAX_REFINEMENTS_SUPPORTER: '9',
      NOTES_IMPORT_WINDOW_DAYS: '20',
    } as Environment
    const kv = limitsKv(
      JSON.stringify({
        importsFree: 0,
        refinementsFree: -1,
        windowDays: 14.5,
      })
    )
    await expect(resolveNotesImportLimits(env, kv)).resolves.toEqual({
      importsFree: 0,
      importsSupporter: 8,
      refinementsFree: -1,
      refinementsSupporter: 9,
      windowDays: 14.5,
    })
    expect(kv.get).toHaveBeenCalledWith('notes-import:limits', { cacheTtl: 60 })
  })

  it('falls through independently invalid KV fields and rejects sentinels below -1', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const env = {
      ...baseEnv,
      NOTES_IMPORT_FREE_CREDITS: '3',
      NOTES_IMPORT_FREE_CREDITS_SUPPORTER: '-2',
      NOTES_IMPORT_MAX_REFINEMENTS: '4.5',
      NOTES_IMPORT_MAX_REFINEMENTS_SUPPORTER: '7',
      NOTES_IMPORT_WINDOW_DAYS: '0',
    } as Environment
    const kv = limitsKv(
      JSON.stringify({
        importsFree: -2,
        importsSupporter: 6,
        refinementsFree: 2.5,
        refinementsSupporter: 'bad',
        windowDays: -4,
      })
    )
    await expect(resolveNotesImportLimits(env, kv)).resolves.toEqual({
      importsFree: 3,
      importsSupporter: 6,
      refinementsFree: 5,
      refinementsSupporter: 7,
      windowDays: 30,
    })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('rejects reset years outside 0000-9999 and falls through each source', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const now = Date.UTC(2026, 6, 1)
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now)
    const extendedIsoDays = 3_000_000
    expect(new Date(now + extendedIsoDays * 24 * 60 * 60 * 1000).toISOString()).toMatch(
      /^\+/
    )

    const fromEnv = await resolveNotesImportLimits(
      {
        ...baseEnv,
        NOTES_IMPORT_WINDOW_DAYS: '12.5',
      } as Environment,
      limitsKv(
        JSON.stringify({
          importsFree: 2,
          windowDays: extendedIsoDays,
        })
      )
    )
    expect(fromEnv).toMatchObject({ importsFree: 2, windowDays: 12.5 })
    expect(limitsWindowDurationMs(fromEnv)).toBe(12.5 * 24 * 60 * 60 * 1000)

    await expect(
      resolveNotesImportLimits(
        {
          ...baseEnv,
          NOTES_IMPORT_WINDOW_DAYS: String(extendedIsoDays),
        } as Environment,
        limitsKv(null)
      )
    ).resolves.toMatchObject({ windowDays: 30 })
    expect(warn).toHaveBeenCalled()
    nowSpy.mockRestore()
    warn.mockRestore()
  })

  it('falls back on malformed JSON without blocking the request', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await expect(
      resolveNotesImportLimits(
        {
          ...baseEnv,
          NOTES_IMPORT_FREE_CREDITS: '2',
        } as Environment,
        limitsKv('{broken')
      )
    ).resolves.toMatchObject({ importsFree: 2, importsSupporter: -1 })
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('falls back on a KV read failure without blocking the request', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const kv: LimitsKv = {
      get: vi.fn(async () => {
        throw new Error('KV unavailable')
      }) as LimitsKv['get'],
    }
    await expect(resolveNotesImportLimits(baseEnv, kv)).resolves.toMatchObject({
      importsFree: 3,
      windowDays: 30,
    })
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})

describe('selectEffectiveAllowances', () => {
  const limits = {
    importsFree: 2,
    importsSupporter: 8,
    refinementsFree: 3,
    refinementsSupporter: 9,
    windowDays: 30,
  }

  it('selects the real tier without using Supporter as a bypass', () => {
    expect(selectEffectiveAllowances(limits, false, false)).toEqual({
      imports: 2,
      refinements: 3,
    })
    expect(selectEffectiveAllowances(limits, true, false)).toEqual({
      imports: 8,
      refinements: 9,
    })
  })

  it('makes both allowances unlimited for dev bypass without changing entitlement', () => {
    expect(selectEffectiveAllowances(limits, false, true)).toEqual({
      imports: -1,
      refinements: -1,
    })
  })
})
