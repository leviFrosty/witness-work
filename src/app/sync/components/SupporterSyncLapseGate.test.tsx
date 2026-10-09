import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const runtime = vi.hoisted(() => ({
  customer: null as object | null,
  supporter: false,
  enabled: true,
  paused: false,
  platform: 'ios',
  set: vi.fn((partial: { iCloudSyncPausedForLapse?: boolean }) => {
    if (partial.iCloudSyncPausedForLapse !== undefined)
      runtime.paused = partial.iCloudSyncPausedForLapse
  }),
}))
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return runtime.platform
    },
  },
}))
vi.mock('@/hooks/useCustomer', () => ({
  default: () => ({ customer: runtime.customer }),
}))
vi.mock('@/hooks/useIsSupporter', () => ({
  default: () => ({ isSupporter: runtime.supporter }),
}))
vi.mock('@/stores/preferences', () => {
  const state = () => ({
    iCloudSyncEnabled: runtime.enabled,
    iCloudSyncPausedForLapse: runtime.paused,
    set: runtime.set,
  })
  const usePreferences = (selector: (s: ReturnType<typeof state>) => unknown) =>
    selector(state())
  usePreferences.getState = state
  return { usePreferences }
})
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
import SupporterSyncLapseGate from './SupporterSyncLapseGate'
let renderer: ReactTestRenderer | undefined
beforeEach(() => {
  vi.clearAllMocks()
  runtime.customer = null
  runtime.supporter = false
  runtime.enabled = true
  runtime.paused = false
  runtime.platform = 'ios'
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})
it('preserves the enable choice across a lapse and clears the pause after resubscribing', async () => {
  await act(async () => {
    renderer = create(<SupporterSyncLapseGate />)
  })
  expect(runtime.set).not.toHaveBeenCalled()
  runtime.customer = {}
  await act(async () => renderer!.update(<SupporterSyncLapseGate />))
  expect(runtime.set).toHaveBeenLastCalledWith({
    iCloudSyncPausedForLapse: true,
  })
  runtime.supporter = true
  await act(async () => renderer!.update(<SupporterSyncLapseGate />))
  expect(runtime.set).toHaveBeenLastCalledWith({
    iCloudSyncPausedForLapse: false,
  })
  expect(
    runtime.set.mock.calls.every(
      ([partial]) =>
        !('iCloudSyncEnabled' in partial) && !('iCloudSyncSetByUser' in partial)
    )
  ).toBe(true)
})
it('pauses Google Drive sync on Android the same way', async () => {
  runtime.platform = 'android'
  runtime.customer = {}
  await act(async () => {
    renderer = create(<SupporterSyncLapseGate />)
  })
  expect(runtime.set).toHaveBeenLastCalledWith({
    iCloudSyncPausedForLapse: true,
  })
})

it('does not change sync settings where there is no cloud sync', async () => {
  runtime.platform = 'web'
  runtime.customer = {}
  await act(async () => {
    renderer = create(<SupporterSyncLapseGate />)
  })
  expect(runtime.set).not.toHaveBeenCalled()
})

it("doesn't write or report again once already paused", async () => {
  runtime.customer = {}
  runtime.paused = true
  await act(async () => {
    renderer = create(<SupporterSyncLapseGate />)
  })
  expect(runtime.set).not.toHaveBeenCalled()
})

it("doesn't write for a supporter who was never paused", async () => {
  runtime.customer = {}
  runtime.supporter = true
  await act(async () => {
    renderer = create(<SupporterSyncLapseGate />)
  })
  expect(runtime.set).not.toHaveBeenCalled()
})
