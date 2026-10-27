import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ reloadDue: false }))
const downloadUpdateOnLaunch = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('@/app/launch/layoutDirection', () => ({
  isLayoutDirectionReloadDue: () => state.reloadDue,
}))
vi.mock('@/features/updates/lib/updates', () => ({ downloadUpdateOnLaunch }))
vi.mock('@/lib/perf', () => ({ perf: { mark: vi.fn() } }))
vi.mock('@/lib/perfProbe', () => ({ installPerfProbe: vi.fn() }))
vi.mock('expo-notifications', () => ({ setNotificationHandler: vi.fn() }))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { setContext: vi.fn() },
}))
vi.mock('@/lib/hotUpdater', () => ({
  hotUpdater: { getChannel: () => 'test', getBundleId: () => 'bundle' },
}))
vi.mock('expo-constants', () => ({ default: { sessionId: 'session' } }))
vi.mock('react-native', () => ({
  LogBox: { ignoreLogs: vi.fn() },
  Platform: { OS: 'ios' },
}))
vi.mock('@/lib/audio', () => ({ isAudioEnabled: () => true }))
vi.mock('@/lib/logger', () => ({ configureLogger: vi.fn() }))
vi.mock('@/app/notifications/foregroundPresentation', () => ({
  foregroundPresentation: vi.fn(),
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: { getState: () => ({ developerTools: false }) },
}))
vi.mock('@/lib/syncTransport', () => ({
  registerAndroidSyncTransport: vi.fn(),
}))
vi.mock('@/lib/syncTransport/googleDrive/googleDriveTransport', () => ({
  googleDriveTransport: {},
}))
vi.mock('@/app/sync/cloudSync', () => ({ registerCloudSync: vi.fn() }))
const promptUnlockAtLaunch = vi.hoisted(() => vi.fn())
vi.mock('@/app/app-lock/unlock', () => ({ promptUnlockAtLaunch }))
vi.mock('../../modules/buddies-keychain', () => ({ isAvailable: () => false }))
vi.mock('@/app/dev-harness/installDevHarness', () => ({
  installDevHarness: vi.fn(),
}))

import { initializeApp } from './initializeApp'

beforeEach(() => {
  vi.stubGlobal('__DEV__', false)
  state.reloadDue = false
  downloadUpdateOnLaunch.mockClear()
  promptUnlockAtLaunch.mockClear()
})

describe('initializeApp', () => {
  it('asks to unlock App Lock straight away', () => {
    initializeApp()
    expect(promptUnlockAtLaunch).toHaveBeenCalledTimes(1)
  })

  it('downloads an update at launch', () => {
    initializeApp()
    expect(downloadUpdateOnLaunch).toHaveBeenCalledTimes(1)
  })

  it('leaves the download to the launch after a layout-direction reload', () => {
    state.reloadDue = true
    initializeApp()
    expect(downloadUpdateOnLaunch).not.toHaveBeenCalled()
  })
})
