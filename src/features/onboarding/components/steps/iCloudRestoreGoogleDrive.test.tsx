import React, { type ReactNode } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Android's onboarding restore: connect Google Drive first, then the same
// restore as iCloud, with Google Drive copy and analytics.

const runtime = vi.hoisted(() => ({
  remoteChangeListeners: [] as Array<() => void>,
  preferencesSet: vi.fn(),
  isSupporter: false,
  connected: false,
  connectResult: true,
}))

vi.mock('react-native', async () => {
  const ReactModule = await import('react')
  const host =
    (name: string) =>
    ({ children, ...props }: { children?: ReactNode }) =>
      ReactModule.createElement(name, props, children)
  return {
    Alert: { alert: vi.fn() },
    Animated: {
      Value: class {
        interpolate() {
          return 0
        }
        stopAnimation() {}
        setValue() {}
      },
      View: host('AnimatedView'),
      loop: () => ({ start: () => {}, stop: () => {} }),
      sequence: () => ({}),
      timing: () => ({}),
    },
    Easing: { inOut: () => () => 0, ease: () => 0 },
    Platform: { OS: 'android' },
    View: host('View'),
  }
})
vi.mock('lucide-react-native', () => ({
  CircleAlert: 'CircleAlert',
  CircleCheck: 'CircleCheck',
  Cloud: 'Cloud',
  RotateCw: 'RotateCw',
  Save: 'Save',
}))
vi.mock('tamagui', () => ({ Spinner: () => null }))
vi.mock('@/components/ui/LucideIcon', () => ({ default: () => null }))
vi.mock('@/components/ui/MyText', async () => {
  const ReactModule = await import('react')
  return {
    default: ({ children }: { children?: ReactNode }) =>
      ReactModule.createElement('Text', null, children),
  }
})
vi.mock('@/components/ui/layout/Wrapper', async () => {
  const ReactModule = await import('react')
  return {
    default: ({ children }: { children?: ReactNode }) =>
      ReactModule.createElement('Wrapper', null, children),
  }
})
vi.mock('@/components/ui/Card', async () => {
  const ReactModule = await import('react')
  return {
    default: ({ children }: { children?: ReactNode }) =>
      ReactModule.createElement('Card', null, children),
  }
})
vi.mock('@/components/ui/Button', async () => {
  const ReactModule = await import('react')
  return {
    default: ({
      children,
      onPress,
    }: {
      children?: ReactNode
      onPress?: () => void
    }) => ReactModule.createElement('Button', { onPress }, children),
  }
})
vi.mock('@/components/ui/ActionButton', async () => {
  const ReactModule = await import('react')
  return {
    default: ({
      children,
      onPress,
    }: {
      children?: ReactNode
      onPress?: () => void
    }) => ReactModule.createElement('ActionButton', { onPress }, children),
  }
})
vi.mock('@/features/onboarding/components/Onboarding.styles', () => ({
  styles: {},
}))
vi.mock('@/features/onboarding/components/OnboardingNav', () => ({
  default: () => null,
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({ colors: {}, fonts: {}, fontSize: () => 12 }),
}))
vi.mock('@/lib/dates', () => ({ formatRelative: () => 'just now' }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/app/sync/payload', () => ({}))
vi.mock('@/app/sync/iCloudSync', () => ({
  iCloudSync: {
    peekRemotePayload: vi.fn(),
    replaceLocalWithRemote: vi.fn(),
    hasMeaningfulLocalData: vi.fn(() => false),
    confirmICloudAccount: vi.fn(() => true),
    backfillUpdatedAtIfNeeded: vi.fn(),
    joinRemoteResetEpoch: vi.fn(),
    pullAndMerge: vi.fn(async () => true),
    push: vi.fn(async () => true),
    pullImagesIfEnabled: vi.fn(),
  },
}))
vi.mock('@/lib/syncTransport', () => ({
  hasSyncTransport: () => true,
  usesGoogleDriveSync: () => true,
  syncTransport: () => ({
    isAvailable: () => runtime.connected,
    addRemoteChangeListener: (listener: () => void) => {
      runtime.remoteChangeListeners.push(listener)
      return { remove: () => {} }
    },
  }),
}))
vi.mock('@/lib/syncTransport/registry', () => ({
  usesGoogleDriveSync: () => true,
}))
vi.mock('@/app/sync/googleDriveConnect', () => ({
  connectGoogleDriveFromUser: vi.fn(async () => {
    runtime.connected = runtime.connectResult
    return runtime.connectResult
  }),
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: Object.assign(() => ({ set: runtime.preferencesSet }), {
    getState: () => ({ iCloudSyncEnabled: true }),
  }),
}))
vi.mock('@/stores/profile', () => ({ useProfile: () => ({ set: vi.fn() }) }))
vi.mock('@/hooks/useFeatureAccess', () => ({
  default: () => ({ hasAccess: runtime.isSupporter }),
}))

let renderer: ReactTestRenderer | null = null

const ACCOUNT = { token: 'account-a', changedAt: null }

const texts = () =>
  renderer!.root
    .findAll((node) => (node.type as unknown) === 'Text')
    .flatMap((node) => node.children)
const actions = () =>
  renderer!.root.findAll((node) => (node.type as unknown) === 'ActionButton')

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => callback())
  runtime.remoteChangeListeners = []
  runtime.isSupporter = false
  runtime.connected = false
  runtime.connectResult = true
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
  vi.unstubAllGlobals()
})

describe('onboarding Google Drive restore', () => {
  it('connects Google Drive, then finds and restores the backup', async () => {
    const { default: ICloudRestore } = await import('./iCloudRestore')
    const { iCloudSync } = await import('@/app/sync/iCloudSync')
    const { connectGoogleDriveFromUser } = await import(
      '@/app/sync/googleDriveConnect'
    )
    const { analytics } = await import('@/lib/analytics')
    vi.mocked(iCloudSync.peekRemotePayload).mockResolvedValue({
      status: 'found',
      remote: {
        version: 1,
        deviceId: 'pixel',
        deviceName: 'Pixel 9',
        writtenAt: 1,
        contactStore: { contacts: [], deletedContacts: [] },
        conversationStore: { conversations: [] },
        serviceReportStore: {
          serviceReports: {},
          dayPlans: [],
          recurringPlans: [],
        },
        preferencesStore: { values: {}, updatedAt: {} },
        profileStore: { values: {}, updatedAt: {} },
      },
      account: ACCOUNT,
    })
    await act(async () => {
      renderer = create(<ICloudRestore goBack={() => {}} goNext={() => {}} />)
    })
    // Nothing is read before the user connects.
    expect(iCloudSync.peekRemotePayload).not.toHaveBeenCalled()
    expect(texts()).toContain('googleDriveRestoreConnectDescription')
    expect(texts()).toContain('iCloudRestoreDescriptionAndroid')

    await act(async () => {
      await actions()[0].props.onPress()
    })
    expect(connectGoogleDriveFromUser).toHaveBeenCalledWith({
      source: 'onboarding',
    })
    expect(iCloudSync.peekRemotePayload).toHaveBeenCalledOnce()
    expect(texts()).toContain('iCloudRestoreFoundTitle')
    expect(actions()[0].props.children).toBe('iCloudRestoreActionAndroid')

    await act(async () => {
      await actions()[0].props.onPress()
    })
    expect(iCloudSync.replaceLocalWithRemote).toHaveBeenCalledOnce()
    expect(analytics.capture).toHaveBeenCalledWith(
      'import_completed',
      expect.objectContaining({ import_type: 'google_drive' })
    )
  })

  it('stays on the connect step when the user cancels Google', async () => {
    runtime.connectResult = false
    const { default: ICloudRestore } = await import('./iCloudRestore')
    const { iCloudSync } = await import('@/app/sync/iCloudSync')
    await act(async () => {
      renderer = create(<ICloudRestore goBack={() => {}} goNext={() => {}} />)
    })
    await act(async () => {
      await actions()[0].props.onPress()
    })
    expect(iCloudSync.peekRemotePayload).not.toHaveBeenCalled()
    expect(texts()).toContain('googleDriveRestoreConnectDescription')
  })
})
