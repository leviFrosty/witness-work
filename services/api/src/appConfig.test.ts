import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Environment } from './types'
import { makeMemoryKv } from './test/memoryKv'
import {
  TEST_CHALLENGE_SECRET,
  TEST_PASSKEY_VARS,
  TEST_TICKET_SECRET,
  TEST_TOKEN_SECRET,
} from './test/buddies'
import { resolveAppMinVersion } from './appConfig'

vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }))

import { app } from './app'

const env = async (kv?: string, APP_MIN_VERSION?: string) => {
  const NOTES_KV = makeMemoryKv()
  if (kv != null) await NOTES_KV.put('app:min-version', kv)
  return {
    NOTES_KV,
    APP_MIN_VERSION,
    RATE_LIMITER: { limit: async () => ({ success: true }) },
  } as unknown as Environment
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /app/v1/config', () => {
  it('serves the minimum version uncached, without authentication', async () => {
    const response = await app.fetch(
      new Request('https://ww-proxy.leviwilkerson.com/app/v1/config?capabilities=sync-everyone'),
      await env('{"minVersion":"1.42.0"}')
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({
      ok: true,
      minAppVersion: '1.42.0',
      sync: { enabled: false, changes: false, entitlement: 'everyone' },
      webSignup: { enabled: false, turnstileSiteKey: null },
      country: null,
      regionCode: null,
    })
  })

  it('leaves minAppVersion out without a floor', async () => {
    const response = await app.fetch(
      new Request('https://ww-proxy.leviwilkerson.com/app/v1/config?capabilities=sync-everyone'),
      await env()
    )
    expect(await response.json()).toEqual({
      ok: true,
      sync: { enabled: false, changes: false, entitlement: 'everyone' },
      webSignup: { enabled: false, turnstileSiteKey: null },
      country: null,
      regionCode: null,
    })
  })

  it('says whether Cloud Sync is on and who gets it', async () => {
    const config = async (
      overrides: Record<string, unknown>,
      kv: Record<string, string> = {}
    ) => {
      const base = await env()
      for (const [key, value] of Object.entries(kv))
        await base.NOTES_KV.put(key, value)
      const response = await app.fetch(
        new Request('https://ww-proxy.leviwilkerson.com/app/v1/config?capabilities=sync-everyone'),
        { ...base, ...overrides } as unknown as Environment
      )
      return ((await response.json()) as { sync: unknown }).sync
    }
    const bound = { ACCOUNT_SYNC: {}, ACCOUNTS_DB: {} }
    // Free for everyone unless something says otherwise (ADR 0040).
    expect(await config({ ...bound, SYNC_ENABLED: 'true' })).toEqual({
      enabled: true,
      changes: false,
      entitlement: 'everyone',
    })
    expect(
      await config(
        { ...bound, SYNC_ENABLED: 'true', SYNC_ENTITLEMENT: 'everyone' },
        { 'sync:entitlement': 'supporter' }
      )
    ).toEqual({ enabled: true, changes: false, entitlement: 'supporter' })
    // KV wins over the vars, both ways.
    expect(
      await config(
        { ...bound, SYNC_ENABLED: 'true', SYNC_ENTITLEMENT: 'supporter' },
        { 'sync:enabled': 'false', 'sync:entitlement': 'everyone' }
      )
    ).toEqual({ enabled: false, changes: false, entitlement: 'everyone' })
    expect(
      await config({ ...bound, SYNC_ENTITLEMENT: 'everyone' }, { 'sync:enabled': 'on' })
    ).toEqual({ enabled: true, changes: false, entitlement: 'everyone' })
    // Without the bucket there's no Cloud Sync to offer.
    expect(await config({ SYNC_ENABLED: 'true' })).toEqual({
      enabled: false,
      changes: false,
      entitlement: 'everyone',
    })
  })

  it("keeps everyone from apps that don't send the capability", async () => {
    const base = { ...(await env()), ACCOUNT_SYNC: {}, ACCOUNTS_DB: {}, SYNC_ENABLED: 'true' }
    const sync = async (query: string) =>
      (
        (await (
          await app.fetch(
            new Request(`https://ww-proxy.leviwilkerson.com/app/v1/config${query}`),
            base as unknown as Environment
          )
        ).json()) as { sync: unknown }
      ).sync
    // An app that never sends `sync-everyone` must not turn Cloud Sync on by
    // itself for a device that never chose (ADR 0040 §2), at any version.
    expect(await sync('')).toEqual({ enabled: true, changes: false, entitlement: 'supporter' })
    expect(await sync('?appVersion=1.47.0')).toEqual({ enabled: true, changes: false, entitlement: 'supporter' })
    expect(await sync('?capabilities=sync-later')).toEqual({ enabled: true, changes: false, entitlement: 'supporter' })
    expect(await sync('?capabilities=sync-everyone')).toEqual({ enabled: true, changes: false, entitlement: 'everyone' })
    expect(await sync('?capabilities=sync-later&capabilities=sync-everyone')).toEqual({
      enabled: true,
      changes: false,
      entitlement: 'everyone',
    })
    expect(await sync('?capabilities=sync-later,sync-everyone')).toEqual({
      enabled: true,
      changes: false,
      entitlement: 'everyone',
    })
  })

  it('says whether web sign-up is open, with the Turnstile site key', async () => {
    const webSignup = async (
      overrides: Record<string, unknown>,
      kv: Record<string, string> = {}
    ) => {
      const base = await env()
      for (const [key, value] of Object.entries(kv))
        await base.NOTES_KV.put(key, value)
      const response = await app.fetch(
        new Request('https://ww-proxy.leviwilkerson.com/app/v1/config?capabilities=sync-everyone'),
        { ...base, ...overrides } as unknown as Environment
      )
      return ((await response.json()) as { webSignup: unknown }).webSignup
    }
    const ready = {
      ACCOUNTS_DB: {},
      ACCOUNT_TOKEN_SECRET: TEST_TOKEN_SECRET,
      PASSKEY_CHALLENGE_SECRET: TEST_CHALLENGE_SECRET,
      ACCOUNT_TICKET_SECRET: TEST_TICKET_SECRET,
      ...TEST_PASSKEY_VARS,
    }
    const devKey = '1x00000000000000000000AA'
    // A development worker falls back to Cloudflare's test keys.
    expect(await webSignup({ ...ready, APP_ATTEST_ENVIRONMENT: 'development' })).toEqual({
      enabled: true,
      turnstileSiteKey: devKey,
    })
    const production = { ...ready, APP_ATTEST_ENVIRONMENT: 'production' }
    expect(await webSignup(production)).toEqual({ enabled: false, turnstileSiteKey: null })
    // A site key and secret without the frame's hostname would fail every
    // token, so sign-up stays off.
    expect(
      await webSignup({ ...production, TURNSTILE_SITE_KEY: '0x4AAAAAAAexample', TURNSTILE_SECRET_KEY: 'secret' })
    ).toEqual({ enabled: false, turnstileSiteKey: '0x4AAAAAAAexample' })
    const configured = {
      ...production,
      TURNSTILE_SITE_KEY: '0x4AAAAAAAexample',
      TURNSTILE_SECRET_KEY: 'secret',
      TURNSTILE_HOSTNAMES: 'verify.witnesswork.app',
    }
    expect(await webSignup(configured)).toEqual({
      enabled: true,
      turnstileSiteKey: '0x4AAAAAAAexample',
    })
    // Paused: the site key stays, since web recovery uses it too.
    expect(await webSignup(configured, { 'accounts:web-signup': 'off' })).toEqual({
      enabled: false,
      turnstileSiteKey: '0x4AAAAAAAexample',
    })
    expect(await webSignup({ ...configured, WEB_SIGNUP: 'off' })).toEqual({
      enabled: false,
      turnstileSiteKey: '0x4AAAAAAAexample',
    })
    // Without the passkey secrets there's no sign-up to offer.
    expect(
      await webSignup({ ...configured, PASSKEY_CHALLENGE_SECRET: undefined })
    ).toEqual({ enabled: false, turnstileSiteKey: '0x4AAAAAAAexample' })
  })

  it("says the caller's country and region from request.cf", async () => {
    const location = async (cf?: unknown) => {
      const request = new Request('https://ww-proxy.leviwilkerson.com/app/v1/config')
      if (cf !== undefined) Object.defineProperty(request, 'cf', { value: cf })
      const response = await app.fetch(request, await env())
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')
      const body = (await response.json()) as Record<string, unknown>
      return { country: body.country, regionCode: body.regionCode }
    }
    expect(await location({ country: 'CA', regionCode: 'MB', city: 'Winnipeg' })).toEqual({
      country: 'CA',
      regionCode: 'MB',
    })
    expect(await location({ country: 'us', regionCode: 'tx' })).toEqual({
      country: 'US',
      regionCode: 'TX',
    })
    expect(await location({ country: 'FR', regionCode: '75' })).toEqual({
      country: 'FR',
      regionCode: '75',
    })
    // Unknown, Tor, malformed or missing: nothing to go on.
    const none = { country: null, regionCode: null }
    expect(await location({ country: 'XX', regionCode: 'MB' })).toEqual(none)
    expect(await location({ country: 'T1', regionCode: 'MB' })).toEqual(none)
    expect(await location({ country: 'CAN', regionCode: 'MB' })).toEqual(none)
    expect(await location({ country: 'C1', regionCode: 'MB' })).toEqual(none)
    expect(await location({ country: 42, regionCode: 'MB' })).toEqual(none)
    expect(await location({ regionCode: 'MB' })).toEqual(none)
    expect(await location({})).toEqual(none)
    expect(await location(null)).toEqual(none)
    expect(await location()).toEqual(none)
    // A malformed region keeps the country.
    for (const regionCode of ['', 'ABCD', 'CA-MB', 'M B', 7, null])
      expect(await location({ country: 'CA', regionCode })).toEqual({
        country: 'CA',
        regionCode: null,
      })
    expect(await location({ country: 'CA' })).toEqual({ country: 'CA', regionCode: null })
  })

  it('counts against its own per-IP bucket', async () => {
    const limiter = { keys: [] as string[] }
    const environment = {
      ...(await env()),
      RATE_LIMITER: {
        limit: async ({ key }: { key: string }) => {
          limiter.keys.push(key)
          return { success: false }
        },
      },
    } as unknown as Environment
    const response = await app.fetch(
      new Request('https://ww-proxy.leviwilkerson.com/app/v1/config?capabilities=sync-everyone', {
        headers: { 'cf-connecting-ip': '198.51.100.9' },
      }),
      environment
    )
    expect(response.status).toBe(429)
    expect(limiter.keys).toEqual(['app:198.51.100.9'])
  })
})

describe('resolveAppMinVersion', () => {
  it('reads KV, then APP_MIN_VERSION, ignoring invalid values', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(await resolveAppMinVersion(await env('{"minVersion":"2.0.1"}', '1.0.0'))).toBe('2.0.1')
    expect(await resolveAppMinVersion(await env(undefined, ' 1.5.0 '))).toBe('1.5.0')
    expect(await resolveAppMinVersion(await env('{"minVersion":"v2"}', '1.5.0'))).toBe('1.5.0')
    expect(await resolveAppMinVersion(await env('', '1.5.0'))).toBe('1.5.0')
    expect(await resolveAppMinVersion(await env(undefined, 'latest'))).toBeNull()
    expect(await resolveAppMinVersion(await env())).toBeNull()
    expect(warn).toHaveBeenCalledWith('app: min-version KV value is invalid')
    expect(warn).toHaveBeenCalledWith('APP_MIN_VERSION is invalid')
  })

  it('falls back to the var when KV fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const failing = {
      NOTES_KV: {
        get: async () => {
          throw new Error('kv down')
        },
      },
      APP_MIN_VERSION: '1.2.3',
    }
    expect(await resolveAppMinVersion(failing)).toBe('1.2.3')
  })
})
