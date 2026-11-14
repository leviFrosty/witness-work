import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TURNSTILE_TEST_SECRET,
  TURNSTILE_TEST_SITE_KEY,
  turnstileConfigured,
  turnstileHosts,
  type TurnstileEnv,
} from './turnstile'

const production = (vars: Partial<TurnstileEnv>): TurnstileEnv => ({
  APP_ATTEST_ENVIRONMENT: 'production',
  ...vars,
})

afterEach(() => vi.restoreAllMocks())

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
