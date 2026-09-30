import React, { type ReactNode } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  remoteChangeListeners: [] as Array<() => void>,
  preferencesSet: vi.fn(),
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
    Platform: { OS: 'ios' },
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
  iCloudSync: { peekRemotePayload: vi.fn(), replaceLocalWithRemote: vi.fn() },
}))
vi.mock('../../../../../modules/icloud-bridge', () => ({
  isAvailable: () => true,
  addRemoteChangeListener: (listener: () => void) => {
    runtime.remoteChangeListeners.push(listener)
    return { remove: () => {} }
  },
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: Object.assign(() => ({ set: runtime.preferencesSet }), {
    getState: () => ({ iCloudSyncEnabled: true }),
  }),
}))
vi.mock('@/stores/profile', () => ({ useProfile: () => ({ set: vi.fn() }) }))
vi.mock('@/hooks/useFeatureAccess', () => ({
  default: () => ({ hasAccess: false }),
}))

let renderer: ReactTestRenderer | null = null

const texts = () =>
  renderer!.root
    .findAll((node) => (node.type as unknown) === 'Text')
    .flatMap((node) => node.children)

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => callback())
  runtime.remoteChangeListeners = []
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
  vi.unstubAllGlobals()
})

describe('onboarding iCloud restore', () => {
  it('remembers the alternate fresh-start choice', async () => {
    const { default: ICloudRestore } = await import('./iCloudRestore')
    const { iCloudSync } = await import('@/app/sync/iCloudSync')
    vi.mocked(iCloudSync.peekRemotePayload).mockResolvedValue({
      status: 'none',
    })
    const next = vi.fn()
    await act(async () => {
      renderer = create(<ICloudRestore goBack={() => {}} goNext={next} />)
    })
    const skip = renderer!.root
      .findAll((node) => (node.type as unknown) === 'Button')
      .at(-1)!
    await act(async () => {
      skip.props.onPress()
    })
    expect(runtime.preferencesSet).toHaveBeenCalledWith(
      expect.objectContaining({
        iCloudSyncEnabled: false,
        iCloudSyncSetByUser: true,
        iCloudFreshSetup: true,
      })
    )
    expect(next).toHaveBeenCalledOnce()
  })
  it('prompts for a modern profile-only photo restore', async () => {
    const { default: ICloudRestore } = await import('./iCloudRestore')
    const { iCloudSync } = await import('@/app/sync/iCloudSync')
    const { Alert } = await import('react-native')
    vi.mocked(iCloudSync.peekRemotePayload).mockResolvedValue({
      status: 'found',
      remote: {
        version: 1,
        deviceId: 'peer',
        writtenAt: 1,
        contactStore: { contacts: [], deletedContacts: [] },
        conversationStore: { conversations: [] },
        serviceReportStore: {
          serviceReports: {},
          dayPlans: [],
          recurringPlans: [],
        },
        preferencesStore: { values: {}, updatedAt: {} },
        profileStore: {
          values: { avatar: { type: 'image', value: 'icloud://profile' } },
          updatedAt: {},
        },
      },
    })
    await act(async () => {
      renderer = create(<ICloudRestore goBack={() => {}} goNext={() => {}} />)
    })
    const restore = renderer!.root.find(
      (node) => (node.type as unknown) === 'ActionButton'
    )
    await act(async () => {
      await restore.props.onPress()
    })
    expect(Alert.alert).toHaveBeenCalledWith(
      'iCloudImagesRestorePrompt_title',
      'iCloudImagesRestorePrompt_description',
      expect.any(Array)
    )
  })
  it("doesn't call a backup that's still downloading 'nothing to restore'", async () => {
    const { default: ICloudRestore } = await import('./iCloudRestore')
    const { iCloudSync } = await import('@/app/sync/iCloudSync')
    vi.mocked(iCloudSync.peekRemotePayload)
      .mockResolvedValueOnce({ status: 'incomplete', reason: 'downloading' })
      .mockResolvedValueOnce({
        status: 'found',
        remote: { deviceName: 'iPhone', writtenAt: 1 } as never,
      })

    await act(async () => {
      renderer = create(<ICloudRestore goBack={() => {}} goNext={() => {}} />)
    })

    expect(texts()).toContain('iCloudRemoteNotReady_description')
    expect(texts()).toContain('iCloudRestoreRetry')
    expect(texts()).not.toContain('iCloudRestoreNoBackup')

    // The download lands and the metadata query reports it.
    await act(async () => {
      runtime.remoteChangeListeners.forEach((listener) => listener())
    })

    expect(texts()).toContain('iCloudRestoreFoundTitle')
  })
})
