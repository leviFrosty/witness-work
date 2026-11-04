import { beforeEach, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  platform: 'ios',
  reloadPolicy: vi.fn(),
  check: vi.fn(),
  state: vi
    .fn()
    .mockResolvedValue({ activeSelection: { bundleId: 'running' } }),
}))
vi.hoisted(() => {
  vi.stubGlobal('__DEV__', false)
})
vi.mock('@hot-updater/react-native', () => ({
  insights: () => ({}),
  HotUpdater: {
    init: () => ({
      checkForUpdate: runtime.check,
      getActiveUpdateState: runtime.state,
      setReloadBehavior: runtime.reloadPolicy,
    }),
  },
}))
vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {
        hotUpdater: { baseURL: 'https://updates.test', apiKey: 'test-client' },
      },
    },
  },
}))
vi.mock('react-native', () => ({
  DevSettings: { reload: vi.fn() },
  Platform: {
    get OS() {
      return runtime.platform
    },
    select(specifics: Record<string, unknown>) {
      return this.OS in specifics ? specifics[this.OS] : specifics.default
    },
  },
}))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: vi.fn() },
}))

import {
  checkHotUpdate,
  hasPreparedUpdate,
  preparedUpdateId,
} from './hotUpdater'

beforeEach(() => {
  runtime.platform = 'ios'
  runtime.check.mockReset()
  runtime.state.mockResolvedValue({ activeSelection: { bundleId: 'running' } })
})

it('uses a process restart on Android so native launch verification can finish', async () => {
  for (const [platform, policy] of [
    ['android', 'processRestart'],
    ['ios', 'reload'],
  ]) {
    runtime.platform = platform
    vi.resetModules()
    await import('./hotUpdater')
    expect(runtime.reloadPolicy).toHaveBeenLastCalledWith(policy)
  }
})

it('keeps SDK check failures distinct from an empty catalog', async () => {
  const error = new Error('catalog check failed')
  runtime.check.mockImplementation(async ({ onError }) => {
    onError(error)
    return null
  })
  await expect(checkHotUpdate()).rejects.toBe(error)
  runtime.check.mockResolvedValue(null)
  await expect(checkHotUpdate()).resolves.toBeNull()
})

it('compares artifact identities for staged updates and builtin rollback', async () => {
  expect(await hasPreparedUpdate()).toBe(false)
  runtime.state.mockResolvedValue({ activeSelection: { bundleId: 'staged' } })
  expect(await hasPreparedUpdate()).toBe(true)
  runtime.state.mockResolvedValue({
    activeSelection: { bundleId: 'running', releaseId: 'metadata-adoption' },
  })
  expect(await hasPreparedUpdate()).toBe(false)
  runtime.state.mockResolvedValue({
    activeSelection: { kind: 'BUILTIN', bundleId: null },
  })
  expect(await hasPreparedUpdate()).toBe(true)
})

it('names the staged artifact the tray offers to restart into', async () => {
  expect(await preparedUpdateId()).toBeNull()
  runtime.state.mockResolvedValue({ activeSelection: { bundleId: 'staged' } })
  expect(await preparedUpdateId()).toBe('staged')
  runtime.state.mockResolvedValue({
    activeSelection: { kind: 'BUILTIN', bundleId: null },
  })
  expect(await preparedUpdateId()).toBe('builtin')
})
