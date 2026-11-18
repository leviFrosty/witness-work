import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TURNSTILE_TEST_SECRET,
  TURNSTILE_TEST_SITE_KEY,
  resetTurnstileWarnings,
  turnstileConfigured,
  turnstileHosts,
  verifyTurnstile,
  type TurnstileEnv,
} from './turnstile'

const production = (vars: Partial<TurnstileEnv>): TurnstileEnv => ({
  APP_ATTEST_ENVIRONMENT: 'production',
  ...vars,
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  resetTurnstileWarnings()
})

describe('turnstileHosts', () => {
  it('trims, lowercases and skips empty entries', () => {
    expect(
      [...turnstileHosts(production({ TURNSTILE_HOSTNAMES: ' Verify.WitnessWork.app , ,verify-beta.witnesswork.app,' }))]
    ).toEqual(['verify.witnesswork.app', 'verify-beta.witnesswork.app'])
    expect(turnstileHosts(production({ TURNSTILE_HOSTNAMES: ' , ' })).size).toBe(0)
    expect(turnstileHosts(production({})).size).toBe(0)
  })

  it('drops an entry that is an origin or a path, and says so', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const hosts = turnstileHosts(
      production({
        TURNSTILE_HOSTNAMES:
          'https://verify.witnesswork.app,verify.witnesswork.app:443,verify.witnesswork.app/,verify-beta.witnesswork.app',
      })
    )
    expect([...hosts]).toEqual(['verify-beta.witnesswork.app'])
    expect(error).toHaveBeenCalled()
    expect(String(error.mock.calls[0]?.[0])).toMatch(/TURNSTILE_HOSTNAMES/)
  })
})

describe('turnstileConfigured', () => {
  const real = { TURNSTILE_SITE_KEY: '0x4AAAAAAAsite-key', TURNSTILE_SECRET_KEY: 'real-secret' }

  it('needs a hostname besides the site key and the secret', () => {
    expect(turnstileConfigured(production(real))).toBe(false)
    expect(turnstileConfigured(production({ ...real, TURNSTILE_HOSTNAMES: ' , ' }))).toBe(false)
    expect(
      turnstileConfigured(production({ ...real, TURNSTILE_HOSTNAMES: 'verify.witnesswork.app' }))
    ).toBe(true)
    expect(
      turnstileConfigured(production({ TURNSTILE_SITE_KEY: real.TURNSTILE_SITE_KEY, TURNSTILE_HOSTNAMES: 'verify.witnesswork.app' }))
    ).toBe(false)
  })

  it('needs one on a development worker with a real secret too', () => {
    expect(turnstileConfigured({ APP_ATTEST_ENVIRONMENT: 'development', ...real })).toBe(false)
    expect(
      turnstileConfigured({
        APP_ATTEST_ENVIRONMENT: 'development',
        ...real,
        TURNSTILE_HOSTNAMES: 'verify-beta.witnesswork.app',
      })
    ).toBe(true)
  })

  it('needs none on a development worker with a test secret, which skips the host check', () => {
    expect(turnstileConfigured({ APP_ATTEST_ENVIRONMENT: 'development' })).toBe(true)
    expect(
      turnstileConfigured({
        APP_ATTEST_ENVIRONMENT: 'development',
        TURNSTILE_SITE_KEY: TURNSTILE_TEST_SITE_KEY,
        TURNSTILE_SECRET_KEY: TURNSTILE_TEST_SECRET,
      })
    ).toBe(true)
    // Production never skips it, so a test secret there needs a hostname too.
    expect(
      turnstileConfigured(
        production({ TURNSTILE_SITE_KEY: TURNSTILE_TEST_SITE_KEY, TURNSTILE_SECRET_KEY: TURNSTILE_TEST_SECRET })
      )
    ).toBe(false)
  })
})

describe('the QA bypass', () => {
  const QA = 'wwqa_0123456789abcdefghijklmnopqrstuvwxyzABCDEF'
  const beta = (vars: Partial<TurnstileEnv> = {}) =>
    production({
      TURNSTILE_SECRET_KEY: 'real-secret',
      TURNSTILE_SITE_KEY: '0xBeta',
      TURNSTILE_HOSTNAMES: 'verify-beta.witnesswork.app',
      TURNSTILE_QA_BYPASS: 'on',
      TURNSTILE_QA_BYPASS_TOKEN: QA,
      ...vars,
    })
  const siteverify = () => {
    const fetch = vi.fn(async () =>
      new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }))
    )
    vi.stubGlobal('fetch', fetch)
    return fetch
  }
  const verify = (env: TurnstileEnv, token: string) =>
    verifyTurnstile(env, { token, action: 'web-signup', remoteip: null })

  it('passes the token without asking Siteverify where the switch is on', async () => {
    const fetch = siteverify()
    vi.spyOn(console, 'info').mockImplementation(() => {})
    expect(await verify(beta(), QA)).toEqual({ ok: true })
    expect(await verifyTurnstile(beta(), { token: QA, action: 'web-recovery', remoteip: null })).toEqual({ ok: true })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends any other token to Siteverify as usual', async () => {
    const fetch = siteverify()
    expect(await verify(beta(), `${QA}x`)).toEqual({ ok: false, reason: 'invalid-input-response' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does nothing without the switch, as on production, and says so once', async () => {
    const fetch = siteverify()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const env of [beta({ TURNSTILE_QA_BYPASS: undefined }), beta({ TURNSTILE_QA_BYPASS: 'true' })])
      expect(await verify(env, QA)).toEqual({ ok: false, reason: 'invalid-input-response' })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('ignores a token shorter than 32 characters', async () => {
    siteverify()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const short = 'wwqa_short'
    expect(await verify(beta({ TURNSTILE_QA_BYPASS_TOKEN: short }), short)).toEqual({
      ok: false,
      reason: 'invalid-input-response',
    })
  })
})
