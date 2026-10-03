import React from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { SyncDeviceFile } from '@/lib/syncDevices'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.now()

const mocks = vi.hoisted(() => ({
  state: {
    iCloudDeviceId: 'ipad' as string | null,
    iCloudSyncDevices: {} as Record<string, unknown>,
  },
  alert: vi.fn(),
  toast: vi.fn(),
  capture: vi.fn(),
  removeSyncDevice: vi.fn(),
}))
vi.mock('react-native', () => ({
  View: 'View',
  ActivityIndicator: 'ActivityIndicator',
  Alert: { alert: mocks.alert },
}))
vi.mock('react-native-keyboard-aware-scroll-view', () => ({
  KeyboardAwareScrollView: 'ScrollView',
}))
vi.mock('@tamagui/toast', () => ({
  useToastController: () => ({ show: mocks.toast }),
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({ colors: {}, fonts: {}, fontSize: () => 12 }),
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: Object.assign(
    (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
    { getState: () => mocks.state }
  ),
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: mocks.capture } }))
vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, options?: { name?: string; relative?: string }) =>
      [key, options?.name ?? options?.relative].filter(Boolean).join(':'),
  },
}))
vi.mock('@/lib/dates', () => ({ formatRelative: () => 'recently' }))
vi.mock('@/app/sync/iCloudSync', () => ({
  iCloudSync: { removeSyncDevice: mocks.removeSyncDevice },
}))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/components/ui/Button', () => ({ default: 'Button' }))
vi.mock('@/components/ui/InfoPopover', () => ({ default: 'InfoPopover' }))
vi.mock('@/components/ui/layout/Wrapper', () => ({ default: 'Wrapper' }))
vi.mock('@/components/ui/inputs/Section', () => ({ default: 'Section' }))
vi.mock('@/components/ui/inputs/InputLayout', () => ({
  inputLayout: { horizontalPadding: 12 },
}))
vi.mock('@/components/ui/inputs/InputRowContainer', () => ({
  default: 'InputRowContainer',
}))
vi.mock('@/components/IsSupporter', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@/features/settings/components/shared/SettingsInputLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}))

import PreferencesiCloudDevicesScreen from './PreferencesiCloudDevicesScreen'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'

const entry = (overrides: Partial<SyncDeviceFile> = {}): SyncDeviceFile => ({
  deviceId: 'phone',
  deviceName: 'iPhone',
  writtenAt: NOW - DAY,
  modifiedAt: NOW - DAY,
  status: 'ok',
  seenAt: NOW,
  ...overrides,
})

let root: ReturnType<typeof create>
const rows = () => root.root.findAllByType(InputRowContainer)
const row = (label: string) =>
  rows().find((node) => node.props.label === label)!
type AlertButton = { text: string; onPress?: () => void }
const alertButton = (text: string) =>
  (mocks.alert.mock.lastCall![2] as AlertButton[]).find(
    (button) => button.text === text
  )!

const mount = async () => {
  await act(async () => {
    root = create(<PreferencesiCloudDevicesScreen />)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.iCloudDeviceId = 'ipad'
  mocks.state.iCloudSyncDevices = {
    'witness-work-ipad.json': entry({ deviceId: 'ipad', deviceName: 'iPad' }),
    'witness-work-phone.json': entry(),
    'witness-work-old.json': entry({
      deviceId: 'old',
      deviceName: null,
      modifiedAt: NOW - 120 * DAY,
    }),
    'witness-work-reset.json': entry({
      deviceId: 'reset',
      deviceName: 'iPad mini',
      status: 'pre-reset',
      modifiedAt: NOW - 40 * DAY,
    }),
    'witness-work-future.json': entry({
      deviceId: 'future',
      deviceName: 'Mac',
      status: 'newer-version',
    }),
    'witness-work-account.json': entry({ deviceName: 'Account' }),
  }
})

afterEach(async () => {
  await act(async () => root.unmount())
})

it('lists this device first with its label and the others with hints', async () => {
  await mount()
  expect(rows().map((node) => node.props.label)).toEqual([
    'iPad',
    'iPhone',
    'Mac',
    'iPad mini',
    'iCloudDeviceUnknown',
  ])
  expect(row('iPad').findAllByType(Button)).toHaveLength(0)
  expect(row('iPad').findByType(Text).props.children).toBe(
    'iCloudDeviceThisDevice'
  )
  expect(row('iPhone').props.description).toBe(
    'iCloudDeviceLastSynced:recently'
  )
  expect(row('iCloudDeviceUnknown').props.description).toBe(
    'iCloudDeviceLastSynced:recently · iCloudDeviceHint_stale'
  )
  expect(row('iPad mini').props.description).toContain(
    'iCloudDeviceHint_preReset'
  )
  expect(row('Mac').props.description).toContain(
    'iCloudDeviceHint_newerVersion'
  )
  expect(mocks.capture).toHaveBeenCalledExactlyOnceWith(
    'icloud_sync_devices_viewed',
    { device_count: 5, flagged_count: 3 }
  )
})

it('shows an empty state before any pull recorded devices', async () => {
  mocks.state.iCloudSyncDevices = {}
  await mount()
  expect(rows()).toHaveLength(0)
  expect(
    root.root
      .findAllByType(Text)
      .some((node) => node.props.children === 'iCloudDevicesEmpty')
  ).toBe(true)
})

it('removes a device after confirmation and records its age and status', async () => {
  mocks.removeSyncDevice.mockResolvedValue({
    outcome: 'removed',
    entry: mocks.state.iCloudSyncDevices['witness-work-reset.json'],
  })
  await mount()
  await act(async () => row('iPad mini').findByType(Button).props.onPress())
  expect(mocks.alert.mock.lastCall![0]).toBe(
    'iCloudDeviceRemoveConfirm_title:iPad mini'
  )
  expect(mocks.removeSyncDevice).not.toHaveBeenCalled()

  await act(async () => alertButton('remove').onPress!())

  expect(mocks.removeSyncDevice).toHaveBeenCalledWith('witness-work-reset.json')
  expect(mocks.capture).toHaveBeenLastCalledWith('icloud_sync_device_removed', {
    status: 'pre-reset',
    age_bucket: '30-90d',
    legacy: false,
  })
  expect(mocks.toast).toHaveBeenCalledWith('iCloudDeviceRemoved:iPad mini', {
    native: true,
  })
})

it('asks to sync first when this device may not hold the data yet', async () => {
  mocks.removeSyncDevice.mockResolvedValue({
    outcome: 'sync-first',
    entry: mocks.state.iCloudSyncDevices['witness-work-phone.json'],
  })
  await mount()
  await act(async () => row('iPhone').findByType(Button).props.onPress())
  await act(async () => alertButton('remove').onPress!())

  expect(mocks.alert).toHaveBeenLastCalledWith(
    'iCloudDeviceSyncFirst_title',
    'iCloudDeviceSyncFirst_description'
  )
  expect(mocks.capture).toHaveBeenLastCalledWith(
    'icloud_sync_device_remove_failed',
    { status: 'ok', age_bucket: '<30d', legacy: false, reason: 'sync_first' }
  )
  expect(mocks.toast).not.toHaveBeenCalled()
})

it('reports a failed delete', async () => {
  mocks.removeSyncDevice.mockRejectedValue(new Error('delete failed'))
  await mount()
  await act(async () => row('iPhone').findByType(Button).props.onPress())
  await act(async () => alertButton('remove').onPress!())

  expect(mocks.alert).toHaveBeenLastCalledWith(
    'error',
    'iCloudDeviceRemoveFailed'
  )
  expect(mocks.capture).toHaveBeenLastCalledWith(
    'icloud_sync_device_remove_failed',
    { status: 'ok', age_bucket: '<30d', legacy: false, reason: 'error' }
  )
})

it('records a cancelled confirmation', async () => {
  await mount()
  await act(async () => row('iPhone').findByType(Button).props.onPress())
  await act(async () => alertButton('cancel').onPress!())
  expect(mocks.removeSyncDevice).not.toHaveBeenCalled()
  expect(mocks.capture).toHaveBeenLastCalledWith(
    'icloud_sync_device_remove_cancelled',
    { status: 'ok', age_bucket: '<30d', legacy: false }
  )
})

it('asks for an app update instead of confirming a newer-version device', async () => {
  await mount()
  await act(async () => row('Mac').findByType(Button).props.onPress())
  expect(mocks.alert).toHaveBeenCalledExactlyOnceWith(
    'iCloudDeviceUpdateApp_title',
    'iCloudDeviceUpdateApp_description'
  )
  expect(mocks.removeSyncDevice).not.toHaveBeenCalled()
})
