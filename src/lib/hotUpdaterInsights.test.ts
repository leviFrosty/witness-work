import { beforeEach, expect, it, vi } from 'vitest'

vi.mock('@hot-updater/react-native', async () => ({
  insights: (await import('@hot-updater/plugin-insights/client')).insights,
}))

import { anonymousInsights } from '@/lib/hotUpdaterInsights'

const fetch = vi.fn()
const stored = new Map<string, string>()

const context = {
  fetch,
  installId: 'install',
  platform: 'ios' as const,
  appVersion: '1.0.0',
  sdkVersion: '1.0.0',
  minBundleId: 'builtin',
  isDebugBuild: false,
  getBundleId: () => 'bundle',
  getChannel: () => 'production',
  getCohort: () => '1',
  getFingerprintHash: () => null,
  storage: {
    get: (key: string) => stored.get(key) ?? null,
    set: (key: string, value: string | null) => {
      if (value === null) stored.delete(key)
      else stored.set(key, value)
    },
  },
  now: () => Date.UTC(2026, 10, 26),
}

const launch = {
  status: 'UNCHANGED',
  channel: 'production',
  bundleId: 'bundle',
  releaseId: null,
} as const

beforeEach(() => {
  stored.clear()
  fetch.mockReset().mockResolvedValue({ status: 204, headers: new Headers() })
})

it('sends nothing while anonymous analytics are off', async () => {
  const hooks = anonymousInsights(() => false).setup(context)!.hooks!
  await hooks.onAppReady?.(launch as never)
  await hooks.onUpdateError?.({
    stage: 'download',
    reason: 'http',
    channel: 'production',
    bundleId: 'bundle',
    releaseId: null,
    updateStrategy: 'fingerprint',
  } as never)
  expect(fetch).not.toHaveBeenCalled()
})

it('reports a launch when they are on, and follows the switch as it changes', async () => {
  let allowed = false
  const hooks = anonymousInsights(() => allowed).setup(context)!.hooks!
  await hooks.onAppReady?.(launch as never)
  expect(fetch).not.toHaveBeenCalled()
  allowed = true
  await hooks.onAppReady?.(launch as never)
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
  const [path, init] = fetch.mock.calls[0]
  expect(path).toBe('events')
  expect(JSON.parse(init.body)).not.toHaveProperty('userId')
})

it('keeps the plugin id and api', () => {
  const plugin = anonymousInsights(() => true)
  expect(plugin.id).toBe('insights')
  expect(plugin.setup(context)?.api).toHaveProperty('setUser')
})
