import React, { type ReactNode } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  remoteChangeListeners: [] as Array<() => void>,
  preferencesSet: vi.fn(),
  isSupporter: false,
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
  default: () => ({ hasAccess: runtime.isSupporter }),
}))

let renderer: ReactTestRenderer | null = null

const ACCOUNT = { token: 'account-a', changedAt: null }

const texts = () =>
  renderer!.root
    .findAll((node) => (node.type as unknown) === 'Text')
    .flatMap((node) => node.children)

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => callback())
  runtime.remoteChangeListeners = []
  runtime.isSupporter = false
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
      account: ACCOUNT,
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
        account: ACCOUNT,
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

describe('restoring over data already on this device', () => {
  type AlertButton = {
    text: string
    style?: string
    onPress?: () => void | Promise<void>
  }
  const remote = {
    version: 1,
    deviceId: 'peer',
    deviceName: 'iPhone',
    writtenAt: 1,
    contactStore: { contacts: [], deletedContacts: [] },
    conversationStore: { conversations: [] },
    serviceReportStore: {
      serviceReports: {},
      dayPlans: [],
      recurringPlans: [],
    },
    preferencesStore: { values: {}, updatedAt: {} },
  }

  const renderFound = async ({ meaningful }: { meaningful: boolean }) => {
    const { default: ICloudRestore } = await import('./iCloudRestore')
    const { iCloudSync } = await import('@/app/sync/iCloudSync')
    const { Alert } = await import('react-native')
    const { analytics } = await import('@/lib/analytics')
    vi.mocked(iCloudSync.peekRemotePayload).mockResolvedValue({
      status: 'found',
      remote: remote as never,
      account: ACCOUNT,
    })
    vi.mocked(iCloudSync.hasMeaningfulLocalData).mockReturnValue(meaningful)
    await act(async () => {
      renderer = create(<ICloudRestore goBack={() => {}} goNext={() => {}} />)
    })
    const restore = renderer!.root.find(
      (node) => (node.type as unknown) === 'ActionButton'
    )
    await act(async () => {
      restore.props.onPress()
    })
    const confirm = vi
      .mocked(Alert.alert)
      .mock.calls.find(
        ([title]) => title === 'iCloudRestoreReplaceConfirm_title'
      )
    const press = async (text: string) => {
      const button = (confirm![2] as AlertButton[]).find((b) => b.text === text)
      await act(async () => {
        await button!.onPress?.()
      })
    }
    return { iCloudSync, Alert, analytics, confirm, press }
  }
  const completed = () =>
    runtime.preferencesSet.mock.calls.some(
      ([values]) => values.onboardingComplete === true
    )

  it('keeps the one-tap restore on a fresh install', async () => {
    const { iCloudSync, confirm } = await renderFound({ meaningful: false })
    expect(confirm).toBeUndefined()
    expect(iCloudSync.replaceLocalWithRemote).toHaveBeenCalledOnce()
    expect(completed()).toBe(true)
  })

  it('asks before replacing, and cancelling leaves everything in place', async () => {
    const { iCloudSync, analytics, confirm, press } = await renderFound({
      meaningful: true,
    })
    expect(confirm![1]).toBe('iCloudRestoreReplaceConfirm_description')
    expect((confirm![2] as AlertButton[]).map((b) => b.text)).toEqual([
      'cancel',
      'iCloudRestoreReplaceConfirm_replace',
    ])
    expect(iCloudSync.replaceLocalWithRemote).not.toHaveBeenCalled()
    expect(analytics.capture).toHaveBeenCalledWith(
      'icloud_restore_replace_prompted',
      { source: 'onboarding', merge_offered: false }
    )

    await press('cancel')

    expect(iCloudSync.replaceLocalWithRemote).not.toHaveBeenCalled()
    expect(completed()).toBe(false)
    expect(analytics.capture).toHaveBeenCalledWith(
      'icloud_restore_replace_cancelled',
      { source: 'onboarding', merge_offered: false }
    )
  })

  it('replaces once confirmed', async () => {
    const { iCloudSync, analytics, press } = await renderFound({
      meaningful: true,
    })

    await press('iCloudRestoreReplaceConfirm_replace')

    expect(iCloudSync.replaceLocalWithRemote).toHaveBeenCalledWith(remote)
    expect(completed()).toBe(true)
    expect(analytics.capture).toHaveBeenCalledWith(
      'icloud_restore_replace_confirmed',
      { source: 'onboarding', merge_offered: false, choice: 'replace' }
    )
    // Not a Supporter: ongoing sync stays off.
    expect(runtime.preferencesSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ iCloudSyncEnabled: true })
    )
  })

  it('turns sync on for a Supporter only after replacing', async () => {
    runtime.isSupporter = true
    const { iCloudSync, press } = await renderFound({ meaningful: true })

    await press('iCloudRestoreReplaceConfirm_replace')

    const enable =
      runtime.preferencesSet.mock.invocationCallOrder[
        runtime.preferencesSet.mock.calls.findIndex(
          ([values]) => values.iCloudSyncEnabled === true
        )
      ]
    expect(
      vi.mocked(iCloudSync.replaceLocalWithRemote).mock.invocationCallOrder[0]
    ).toBeLessThan(enable)
    expect(runtime.preferencesSet).toHaveBeenCalledWith(
      expect.objectContaining({
        iCloudSyncEnabled: true,
        iCloudSyncSetByUser: true,
        iCloudSyncNeedsResolution: false,
      })
    )
  })

  it('lets a Supporter merge instead of replacing', async () => {
    runtime.isSupporter = true
    const { iCloudSync, confirm, press } = await renderFound({
      meaningful: true,
    })
    expect(confirm![1]).toBe('iCloudRestoreReplaceConfirm_descriptionWithMerge')

    await press('iCloudRestoreReplaceConfirm_merge')

    expect(iCloudSync.replaceLocalWithRemote).not.toHaveBeenCalled()
    // Joins iCloud's reset generation first, so the pull merges rather than
    // adopting it and replacing this device's data.
    expect(iCloudSync.joinRemoteResetEpoch).toHaveBeenCalledOnce()
    expect(
      vi.mocked(iCloudSync.joinRemoteResetEpoch).mock.invocationCallOrder[0]
    ).toBeLessThan(
      vi.mocked(iCloudSync.pullAndMerge).mock.invocationCallOrder[0]
    )
    expect(iCloudSync.pullAndMerge).toHaveBeenCalledOnce()
    expect(iCloudSync.push).toHaveBeenCalledOnce()
    expect(runtime.preferencesSet).toHaveBeenCalledWith(
      expect.objectContaining({ iCloudSyncEnabled: true })
    )
    expect(completed()).toBe(true)
  })

  describe('after the Apple Account changed since the probe', () => {
    const switched = async (mode: 'replace' | 'merge') => {
      runtime.isSupporter = true
      const found = await renderFound({ meaningful: true })
      vi.mocked(found.iCloudSync.confirmICloudAccount).mockReturnValueOnce(
        false
      )
      vi.mocked(found.iCloudSync.peekRemotePayload).mockClear()
      await found.press(
        mode === 'merge'
          ? 'iCloudRestoreReplaceConfirm_merge'
          : 'iCloudRestoreReplaceConfirm_replace'
      )
      return found
    }

    it.each(['replace', 'merge'] as const)(
      "doesn't %s, turn sync on or finish onboarding, and looks again",
      async (mode) => {
        const { iCloudSync, Alert, analytics } = await switched(mode)

        expect(iCloudSync.confirmICloudAccount).toHaveBeenCalledWith(ACCOUNT)
        expect(iCloudSync.replaceLocalWithRemote).not.toHaveBeenCalled()
        expect(iCloudSync.joinRemoteResetEpoch).not.toHaveBeenCalled()
        expect(iCloudSync.pullAndMerge).not.toHaveBeenCalled()
        expect(runtime.preferencesSet).not.toHaveBeenCalledWith(
          expect.objectContaining({ iCloudSyncEnabled: true })
        )
        expect(completed()).toBe(false)
        expect(Alert.alert).toHaveBeenCalledWith(
          'iCloudAccountChangedNotice_title'
        )
        expect(analytics.capture).toHaveBeenCalledWith(
          'import_failed',
          expect.objectContaining({ mode, error_code: 'account_changed' })
        )
        expect(iCloudSync.peekRemotePayload).toHaveBeenCalledOnce()
      }
    )
  })

  it("doesn't finish onboarding when the merge doesn't finish", async () => {
    runtime.isSupporter = true
    const { iCloudSync, Alert, press } = await renderFound({
      meaningful: true,
    })
    vi.mocked(iCloudSync.push).mockResolvedValueOnce(false)

    await press('iCloudRestoreReplaceConfirm_merge')

    expect(completed()).toBe(false)
    expect(Alert.alert).toHaveBeenCalledWith('error', 'iCloudOperationFailed')
  })
})
