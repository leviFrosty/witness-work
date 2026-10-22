import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  APP_CONFIG_MIN_INTERVAL_MS,
  createAppConfigCheck,
  fetchAppConfig,
  requireUpdateFromServer,
  useUpdateRequired,
} from '@/lib/appUpdate/updateRequired'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/http/online', () => ({ isKnownOffline: () => false }))

beforeEach(() => {
  useUpdateRequired.setState({ required: null })
})

function setup(minAppVersion: string | null = null) {
  const clock = { now: 1_000_000 }
  const config = { minAppVersion, fail: false }
  const fetchConfig = vi.fn(async () => {
    if (config.fail) throw new Error('offline')
    return { minAppVersion: config.minAppVersion }
  })
  const check = createAppConfigCheck({
    fetchConfig,
    currentVersion: () => '1.40.0',
    now: () => clock.now,
  })
  return { clock, config, fetchConfig, check }
}

describe('the app config check', () => {
  it('blocks below the minimum version, and lifts when it comes down', async () => {
    const { clock, config, check } = setup('1.42.0')
    await check()
    expect(useUpdateRequired.getState().required).toEqual({
      source: 'config',
      currentVersion: '1.40.0',
      minVersion: '1.42.0',
    })
    config.minAppVersion = '1.39.0'
    clock.now += APP_CONFIG_MIN_INTERVAL_MS
    await check()
    expect(useUpdateRequired.getState().required).toBeNull()
  })

  it('asks at most once a minute, sharing a request in flight', async () => {
    const { clock, fetchConfig, check } = setup()
    await Promise.all([check(), check()])
    await check()
    expect(fetchConfig).toHaveBeenCalledTimes(1)
    clock.now += APP_CONFIG_MIN_INTERVAL_MS - 1
    await check()
    expect(fetchConfig).toHaveBeenCalledTimes(1)
    await check({ force: true })
    expect(fetchConfig).toHaveBeenCalledTimes(2)
  })

  it('changes nothing when the config can’t be read', async () => {
    const { clock, config, check } = setup('1.42.0')
    await check()
    config.fail = true
    clock.now += APP_CONFIG_MIN_INTERVAL_MS
    await expect(check()).resolves.toBeUndefined()
    expect(useUpdateRequired.getState().required?.source).toBe('config')

    useUpdateRequired.setState({ required: null })
    clock.now += APP_CONFIG_MIN_INTERVAL_MS
    await check()
    expect(useUpdateRequired.getState().required).toBeNull()
  })

  it('asks again right after a read that failed', async () => {
    const { config, fetchConfig, check } = setup('1.42.0')
    config.fail = true
    await check()
    expect(useUpdateRequired.getState().required).toBeNull()
    // The connection came back within the minute.
    config.fail = false
    await check()
    expect(fetchConfig).toHaveBeenCalledTimes(2)
    expect(useUpdateRequired.getState().required?.source).toBe('config')
  })

  it('never lifts a block from a 426', async () => {
    const { check } = setup(null)
    requireUpdateFromServer('1.40.0')
    await check()
    expect(useUpdateRequired.getState().required).toEqual({
      source: 'server',
      currentVersion: '1.40.0',
      minVersion: null,
    })
  })

  it('keeps the minimum version the config named when a 426 follows', async () => {
    const { check } = setup('1.42.0')
    await check()
    requireUpdateFromServer('1.40.0')
    expect(useUpdateRequired.getState().required).toEqual({
      source: 'server',
      currentVersion: '1.40.0',
      minVersion: '1.42.0',
    })
  })
})

describe('fetchAppConfig', () => {
  const answer = (body: unknown, status = 200) =>
    vi.fn(async () => Response.json(body, { status }))

  it('reads minAppVersion, or none', async () => {
    await expect(
      fetchAppConfig(
        'https://api.test/app/v1/config',
        answer({ ok: true, minAppVersion: '1.42.0' }) as unknown as typeof fetch
      )
    ).resolves.toEqual({ minAppVersion: '1.42.0', sync: null })
    await expect(
      fetchAppConfig(
        'https://api.test/app/v1/config',
        answer({ ok: true }) as unknown as typeof fetch
      )
    ).resolves.toEqual({ minAppVersion: null, sync: null })
  })

  it("reads Cloud Sync's switches", async () => {
    await expect(
      fetchAppConfig(
        'https://api.test/app/v1/config',
        answer({
          ok: true,
          sync: { enabled: true, entitlement: 'everyone' },
        }) as unknown as typeof fetch
      )
    ).resolves.toEqual({
      minAppVersion: null,
      sync: { enabled: true, entitlement: 'everyone' },
    })
    await expect(
      fetchAppConfig(
        'https://api.test/app/v1/config',
        answer({
          ok: true,
          sync: { enabled: false, entitlement: 'odd' },
        }) as unknown as typeof fetch
      )
    ).resolves.toEqual({
      minAppVersion: null,
      sync: { enabled: false, entitlement: 'supporter' },
    })
  })

  it('throws on an answer that isn’t the config', async () => {
    await expect(
      fetchAppConfig(
        'https://api.test/app/v1/config',
        answer({ minAppVersion: '9.0.0' }) as unknown as typeof fetch
      )
    ).rejects.toThrow()
  })
})
