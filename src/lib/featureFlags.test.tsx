import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { UseBoundStore, StoreApi } from 'zustand'

const mocks = vi.hoisted(() => ({
  reload: vi.fn(),
  readFlag: vi.fn(),
  listeners: new Set<() => void>(),
  cached: {} as Record<string, boolean | string>,
  distinctId: 'installation-one',
  failure: undefined as 'request' | 'quota' | 'partial' | undefined,
  exposures: [] as {
    flag: string
    value: boolean | string | undefined
    distinctId: string
  }[],
  preferences: null as UseBoundStore<
    StoreApi<{ analyticsEnabled: boolean }>
  > | null,
}))
vi.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: () => ({ remove() {} }),
  },
}))
vi.mock('expo-network', () => ({
  useNetworkState: () => ({ isConnected: true, isInternetReachable: true }),
}))
vi.mock('@/lib/posthogClient', () => ({
  posthogClient: {
    reloadFeatureFlagsAsync: mocks.reload,
    getFeatureFlag: mocks.readFlag,
    getFeatureFlags: () => mocks.cached,
    getDistinctId: () => mocks.distinctId,
    getPersistedProperty: () => ({
      flags: {},
      requestError: mocks.failure === 'request' ? {} : undefined,
      quotaLimited: mocks.failure === 'quota' ? ['feature_flags'] : undefined,
      errorsWhileComputingFlags: mocks.failure === 'partial',
    }),
    on: (_event: string, callback: () => void) => {
      mocks.listeners.add(callback)
      return () => mocks.listeners.delete(callback)
    },
  },
}))
vi.mock('@/stores/preferences', async () => {
  const { create } = await import('zustand')
  const usePreferences = create(() => ({ analyticsEnabled: true }))
  mocks.preferences = usePreferences
  return { usePreferences }
})

function publish(values: Record<string, boolean | string>) {
  mocks.cached = values
  for (const listener of mocks.listeners) listener()
}
let root: ReactTestRenderer | undefined
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  mocks.cached = {}
  mocks.distinctId = 'installation-one'
  mocks.failure = undefined
  mocks.exposures = []
  mocks.listeners.clear()
  const policy = await import('./analyticsPolicy')
  policy.setAnalyticsEventsAllowed(true)
  policy.setAnalyticsProduction(true)
  mocks.reload.mockImplementation(async () => {
    const values = { 'notes-import': true, buddies: false }
    publish(values)
    return values
  })
  mocks.readFlag.mockImplementation(
    (flag: string, options?: { sendEvent: boolean }) => {
      const value = mocks.cached[flag]
      if (options?.sendEvent !== false)
        mocks.exposures.push({ flag, value, distinctId: mocks.distinctId })
      return value
    }
  )
})
afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  root = undefined
})

async function mountReader() {
  const { useInitializeFeatureFlags, useFeatureFlagValue } = await import(
    './featureFlags'
  )
  function Reader() {
    useInitializeFeatureFlags()
    const value = useFeatureFlagValue('notes-import')
    return <output data-value={value} />
  }
  await act(async () => {
    root = create(<Reader />)
  })
}
const shownValue = () => root!.root.findByType('output').props['data-value']

it('does not report exposure just for loading all flags', async () => {
  const { useInitializeFeatureFlags } = await import('./featureFlags')
  function Loader() {
    useInitializeFeatureFlags()
    return null
  }
  await act(async () => {
    root = create(<Loader />)
  })
  expect(mocks.reload).toHaveBeenCalledOnce()
  expect(mocks.exposures).toEqual([])
})

it('records a loaded flag at its reader, preserving multivariate values and boolean gating', async () => {
  mocks.reload.mockImplementation(async () => {
    const values = { 'notes-import': 'variant-b', buddies: false }
    publish(values)
    return values
  })
  const { useInitializeFeatureFlags, useFeatureFlagValue, useFeatureFlag } =
    await import('./featureFlags')
  function Reader() {
    useInitializeFeatureFlags()
    const value = useFeatureFlagValue('notes-import')
    const enabled = useFeatureFlag('buddies')
    return <output data-value={value} data-enabled={enabled} />
  }
  await act(async () => {
    root = create(<Reader />)
  })
  expect(shownValue()).toBe('variant-b')
  expect(root!.root.findByType('output').props['data-enabled']).toBe(false)
  expect(mocks.exposures).toEqual([
    {
      flag: 'notes-import',
      value: 'variant-b',
      distinctId: 'installation-one',
    },
    { flag: 'buddies', value: false, distinctId: 'installation-one' },
  ])
})

it('waits for a successful load instead of reporting an undefined exposure', async () => {
  mocks.reload.mockRejectedValue(new Error('offline'))
  await mountReader()
  expect(shownValue()).toBeUndefined()
  expect(mocks.exposures).toEqual([])
})

it('records exposure when analytics are re-enabled without changing visibility', async () => {
  const policy = await import('./analyticsPolicy')
  policy.setAnalyticsEventsAllowed(false)
  await import('./featureFlags')
  mocks.preferences!.setState({ analyticsEnabled: false })
  await mountReader()
  expect(shownValue()).toBe(true)
  expect(mocks.exposures).toEqual([])
  policy.setAnalyticsEventsAllowed(true)
  await act(async () => mocks.preferences!.setState({ analyticsEnabled: true }))
  expect(mocks.exposures).toEqual([
    { flag: 'notes-import', value: true, distinctId: 'installation-one' },
  ])
})

it('waits for reset reload, then exposes the new identity and variant after rapid off/on', async () => {
  await mountReader()
  expect(shownValue()).toBe(true)
  mocks.exposures = []
  const policy = await import('./analyticsPolicy')
  await act(async () => {
    policy.setAnalyticsEventsAllowed(false)
    // The real SDK reset clears its cache without a featureflags notification,
    // rotates identity, and starts an asynchronous flags reload.
    mocks.cached = {}
    mocks.distinctId = 'installation-two'
    mocks.preferences!.setState({ analyticsEnabled: false })
    policy.setAnalyticsEventsAllowed(true)
    mocks.preferences!.setState({ analyticsEnabled: true })
  })
  expect(shownValue()).toBeUndefined()
  expect(mocks.exposures).toEqual([])
  await act(async () => publish({ 'notes-import': 'variant-new' }))
  expect(shownValue()).toBe('variant-new')
  expect(mocks.exposures).toEqual([
    {
      flag: 'notes-import',
      value: 'variant-new',
      distinctId: 'installation-two',
    },
  ])
  expect(mocks.reload).toHaveBeenCalledOnce() // The SDK owns the reset reload.
})

it.each(['request', 'quota', 'partial'] as const)(
  'closes cached flags on a %s failure',
  async (failure) => {
    await mountReader()
    mocks.exposures = []
    mocks.failure = failure
    await act(async () => publish({ 'notes-import': true }))
    expect(shownValue()).toBeUndefined()
    expect(mocks.exposures).toEqual([])
  }
)

it('does not record a cached variant that differs from the rendered value', async () => {
  await mountReader()
  mocks.exposures = []
  const policy = await import('./analyticsPolicy')
  await act(async () =>
    mocks.preferences!.setState({ analyticsEnabled: false })
  )
  // Reload and render A with analytics disabled.
  await act(async () => publish({ 'notes-import': 'variant-a' }))
  // SDK B arrives just before the rendered A's opt-in effect gets to run.
  mocks.cached = { 'notes-import': 'variant-b' }
  policy.setAnalyticsEventsAllowed(true)
  await act(async () => mocks.preferences!.setState({ analyticsEnabled: true }))
  expect(shownValue()).toBe('variant-a')
  expect(mocks.exposures).toEqual([])
  await act(async () => publish(mocks.cached))
  expect(shownValue()).toBe('variant-b')
  expect(mocks.exposures).toEqual([
    {
      flag: 'notes-import',
      value: 'variant-b',
      distinctId: 'installation-one',
    },
  ])
})
