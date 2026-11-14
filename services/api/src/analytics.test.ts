import { describe, expect, it, vi } from 'vitest'
import {
  analyticsDistinctId,
  analyticsEnabled,
  captureAnalyticsEvent,
  type AnalyticsEnv,
} from './analytics'

const ENV: AnalyticsEnv = {
  POSTHOG_PROJECT_TOKEN: 'phc_test',
  APP_ATTEST_ENVIRONMENT: 'production',
}
const EVENT = {
  event: 'api_test_event',
  distinctId: 'ww_abc',
  properties: { platform: 'ios', count: 2, flag: true, missing: null },
}
const NOW = Date.parse('2026-10-08T12:00:00.000Z')

const deps = (respond: () => Promise<Response>) => {
  const fetch = vi.fn((_url: string, _init: RequestInit) => respond())
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls: fetch, now: () => NOW }
}

describe('captureAnalyticsEvent', () => {
  it('posts an anonymous event to PostHog', async () => {
    const d = deps(async () => new Response('{"status":"Ok"}'))
    await captureAnalyticsEvent(ENV, EVENT, d)

    expect(d.calls).toHaveBeenCalledOnce()
    const [url, init] = d.calls.mock.calls[0]
    expect(url).toBe('https://us.i.posthog.com/i/v0/e/')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({
      api_key: 'phc_test',
      event: 'api_test_event',
      distinct_id: 'ww_abc',
      timestamp: '2026-10-08T12:00:00.000Z',
      properties: {
        platform: 'ios',
        count: 2,
        flag: true,
        missing: null,
        environment: 'production',
        $lib: 'ww-api',
        $process_person_profile: false,
        $geoip_disable: true,
      },
    })
  })

  it('honors a custom host', async () => {
    const d = deps(async () => new Response(''))
    await captureAnalyticsEvent(
      { ...ENV, POSTHOG_HOST: 'https://eu.i.posthog.com/' },
      EVENT,
      d
    )
    expect(d.calls.mock.calls[0][0]).toBe('https://eu.i.posthog.com/i/v0/e/')
  })

  it('does nothing without a project token', async () => {
    const d = deps(async () => new Response(''))
    const env = { ...ENV, POSTHOG_PROJECT_TOKEN: ' ' }
    expect(analyticsEnabled(env)).toBe(false)
    await captureAnalyticsEvent(env, EVENT, d)
    expect(d.calls).not.toHaveBeenCalled()
  })

  it('never throws on network failures or rejections', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await expect(
      captureAnalyticsEvent(ENV, EVENT, deps(async () => {
        throw new TypeError('network down')
      }))
    ).resolves.toBeUndefined()
    await expect(
      captureAnalyticsEvent(ENV, EVENT, deps(async () => new Response('', { status: 503 })))
    ).resolves.toBeUndefined()
    // Logs carry no payload or identity.
    expect(warn.mock.calls).toEqual([
      ['analytics: capture failed', 'TypeError'],
      ['analytics: capture rejected', 503],
    ])
    warn.mockRestore()
  })
})

describe('analyticsDistinctId', () => {
  it('is stable, prefixed, and does not reveal the identity', async () => {
    const id = await analyticsDistinctId('account-id-1')
    expect(id).toMatch(/^ww_[0-9a-f]{32}$/)
    expect(id).not.toContain('account-id-1')
    await expect(analyticsDistinctId('account-id-1')).resolves.toBe(id)
    await expect(analyticsDistinctId('account-id-2')).resolves.not.toBe(id)
  })
})
