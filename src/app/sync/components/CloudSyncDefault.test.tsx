import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  isSupporter: true,
  cloudSyncEntitled: null as boolean | null,
  entitlement: 'supporter' as 'supporter' | 'everyone',
  installedBeforeFreeSync: true,
  os: 'ios' as 'ios' | 'web',
  onboardingComplete: true,
  setState: vi.fn(),
  appStateListeners: [] as Array<(state: string) => void>,
  accountListeners: [] as Array<(change: string) => void>,
  /** The store as it is now, past what the render read. */
  live: {} as {
    iCloudSyncEnabled?: boolean
    cloudSyncAccountToken?: string | null
  },
}))

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return runtime.os
    },
  },
  AppState: {
    addEventListener: (_: string, listener: (state: string) => void) => {
      runtime.appStateListeners.push(listener)
      return {
        remove: () => {
          runtime.appStateListeners = runtime.appStateListeners.filter(
            (l) => l !== listener
          )
        },
      }
    },
  },
}))
vi.mock('@/hooks/useIsSupporter', () => ({
  default: () => ({ isSupporter: runtime.isSupporter }),
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: Object.assign(
    () => ({
      iCloudSyncEnabled: false,
      iCloudSyncSetByUser: false,
      syncProvider: null,
      cloudSyncConfig: { enabled: true, entitlement: runtime.entitlement },
      cloudSyncEntitled: runtime.cloudSyncEntitled,
      onboardingComplete: runtime.onboardingComplete,
      installedBeforeFreeSync: runtime.installedBeforeFreeSync,
    }),
    {
      setState: runtime.setState,
      getState: () => ({ set: vi.fn(), ...runtime.live }),
    }
  ),
}))
vi.mock('@/app/sync/iCloudSync', () => ({
  iCloudSync: {
    resolveInitialEnable: vi.fn(async () => ({ outcome: 'seed' })),
    applySeedEnable: vi.fn(async () => {}),
    applyPullEnable: vi.fn(),
    applyMergeEnable: vi.fn(async () => {}),
    pullAndMerge: vi.fn(async () => false),
  },
}))
vi.mock('@/features/settings/lib/completeOnboardingFromRestore', () => ({
  completeOnboardingFromRestore: vi.fn(),
}))
vi.mock('@/app/sync/cloudSync', () => ({ prepareCloudSync: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/serverAccount', () => ({
  onAccountChange: (listener: (change: string) => void) => {
    runtime.accountListeners.push(listener)
    return () => {
      runtime.accountListeners = runtime.accountListeners.filter(
        (l) => l !== listener
      )
    }
  },
}))
vi.mock('@/lib/appUpdate', () => ({ checkAppConfig: vi.fn(async () => {}) }))
vi.mock('@/lib/syncTransport', () => ({ hasSyncTransport: () => true }))
vi.mock('@/lib/syncTransport/provider', () => ({
  addActiveRemoteChangeListener: () => ({ remove: () => {} }),
  cloudSyncOffered: () => true,
}))

let renderer: ReactTestRenderer | null = null

beforeEach(() => {
  vi.clearAllMocks()
  runtime.isSupporter = true
  runtime.cloudSyncEntitled = null
  runtime.entitlement = 'supporter'
  runtime.installedBeforeFreeSync = true
  runtime.os = 'ios'
  runtime.onboardingComplete = true
  runtime.appStateListeners = []
  runtime.accountListeners = []
  runtime.live = {}
})

afterEach(async () => {
  act(() => renderer?.unmount())
  renderer = null
  ;(await import('@/app/sync/webFirstSync')).resetFirstSync()
})

const notEntitled = {
  outcome: 'not_entitled',
  status: {
    enabled: true,
    entitled: false,
    entitlement: 'supporter',
    supporter: false,
    supporterCheckFailed: true,
    photos: true,
    requestedAt: null,
  },
} as const

describe('CloudSyncDefault', () => {
  it('tries a Supporter again when the server couldn’t confirm them', async () => {
    const { default: CloudSyncDefault } = await import('./CloudSyncDefault')
    const { prepareCloudSync } = await import('@/app/sync/cloudSync')
    const { iCloudSync } = await import('@/app/sync/iCloudSync')
    vi.mocked(prepareCloudSync)
      .mockResolvedValueOnce(notEntitled)
      .mockResolvedValueOnce({ outcome: 'ready', status: notEntitled.status })

    await act(async () => {
      renderer = create(<CloudSyncDefault />)
    })
    expect(iCloudSync.applySeedEnable).not.toHaveBeenCalled()
    expect(runtime.appStateListeners).toHaveLength(1)

    // RevenueCat is back by the next foreground.
    await act(async () => {
      runtime.appStateListeners.forEach((listener) => listener('active'))
    })
    expect(runtime.setState).toHaveBeenCalledWith({ syncProvider: 'cloud' })
    expect(iCloudSync.applySeedEnable).toHaveBeenCalledWith('supporter_default')
  })

  it('waits for a running switch, then leaves the option it chose alone', async () => {
    const { default: CloudSyncDefault } = await import('./CloudSyncDefault')
    const { prepareCloudSync } = await import('@/app/sync/cloudSync')
    const { withSyncOptionLock } = await import('@/app/sync/syncOptionLock')
    vi.mocked(prepareCloudSync).mockResolvedValue({
      outcome: 'ready',
      status: notEntitled.status,
    })
    let finishSwitch = () => {}
    // The account's request is switching this device to Cloud Sync.
    const switching = withSyncOptionLock(
      () =>
        new Promise<void>((resolve) => {
          finishSwitch = () => {
            runtime.live = { iCloudSyncEnabled: true }
            resolve()
          }
        })
    )

    await act(async () => {
      renderer = create(<CloudSyncDefault />)
    })
    expect(prepareCloudSync).not.toHaveBeenCalled()

    await act(async () => {
      finishSwitch()
      await switching
    })
    expect(prepareCloudSync).not.toHaveBeenCalled()
    expect(runtime.setState).not.toHaveBeenCalled()
  })

  it('stops asking when a device that isn’t a Supporter isn’t entitled', async () => {
    runtime.isSupporter = false
    // Entitled when last read, so the default tries once.
    runtime.cloudSyncEntitled = true
    const { default: CloudSyncDefault } = await import('./CloudSyncDefault')
    const { prepareCloudSync } = await import('@/app/sync/cloudSync')
    vi.mocked(prepareCloudSync).mockResolvedValueOnce(notEntitled)

    await act(async () => {
      renderer = create(<CloudSyncDefault />)
    })
    expect(prepareCloudSync).toHaveBeenCalledTimes(1)
    expect(runtime.appStateListeners).toHaveLength(0)
  })

  describe('when the account key changes (a recovery key, a QR sign-in)', () => {
    const ready = { outcome: 'ready', status: notEntitled.status } as const
    afterEach(async () => {
      const { iCloudSync } = await import('@/app/sync/iCloudSync')
      vi.mocked(iCloudSync.resolveInitialEnable)
        .mockReset()
        .mockResolvedValue({ outcome: 'seed' })
    })
    const keyChanged = () =>
      runtime.accountListeners.forEach((listener) => listener('key_changed'))

    it('decides again on the new account without waiting for a foreground', async () => {
      const { default: CloudSyncDefault } = await import('./CloudSyncDefault')
      const { prepareCloudSync } = await import('@/app/sync/cloudSync')
      const { iCloudSync } = await import('@/app/sync/iCloudSync')
      vi.mocked(prepareCloudSync).mockResolvedValue(ready)
      // The identity check saw another server account and turned sync off.
      vi.mocked(iCloudSync.resolveInitialEnable)
        .mockResolvedValueOnce({ outcome: 'unavailable' })
        .mockResolvedValueOnce({ outcome: 'seed' })

      await act(async () => {
        renderer = create(<CloudSyncDefault />)
      })
      expect(iCloudSync.applySeedEnable).not.toHaveBeenCalled()

      await act(async () => {
        keyChanged()
      })
      expect(runtime.setState).toHaveBeenCalledWith({ syncProvider: 'cloud' })
      expect(iCloudSync.applySeedEnable).toHaveBeenCalledWith(
        'supporter_default'
      )
    })

    it('decides again at once when the identity check turned sync off for the new account', async () => {
      const { default: CloudSyncDefault } = await import('./CloudSyncDefault')
      const { prepareCloudSync } = await import('@/app/sync/cloudSync')
      const { iCloudSync } = await import('@/app/sync/iCloudSync')
      vi.mocked(prepareCloudSync).mockResolvedValue(ready)
      // `checkICloudIdentity` saw the stored account token differ from the new
      // account's, reset sync and recorded the new one, then said no.
      vi.mocked(iCloudSync.resolveInitialEnable)
        .mockImplementationOnce(async () => {
          runtime.live = { cloudSyncAccountToken: 'account:new' }
          return { outcome: 'unavailable' }
        })
        .mockResolvedValueOnce({ outcome: 'seed' })
      runtime.live = { cloudSyncAccountToken: 'account:old' }

      await act(async () => {
        renderer = create(<CloudSyncDefault />)
      })
      expect(iCloudSync.resolveInitialEnable).toHaveBeenCalledTimes(2)
      expect(iCloudSync.applySeedEnable).toHaveBeenCalledWith(
        'supporter_default'
      )
    })

    it('waits for a foreground when the account is simply unavailable', async () => {
      const { default: CloudSyncDefault } = await import('./CloudSyncDefault')
      const { prepareCloudSync } = await import('@/app/sync/cloudSync')
      const { iCloudSync } = await import('@/app/sync/iCloudSync')
      vi.mocked(prepareCloudSync).mockResolvedValue(ready)
      vi.mocked(iCloudSync.resolveInitialEnable).mockResolvedValueOnce({
        outcome: 'unavailable',
      })
      runtime.live = { cloudSyncAccountToken: 'account:same' }

      await act(async () => {
        renderer = create(<CloudSyncDefault />)
      })
      expect(iCloudSync.resolveInitialEnable).toHaveBeenCalledTimes(1)
      expect(runtime.appStateListeners).toHaveLength(1)
    })

    it('drops a decision that was reading the old account', async () => {
      const { default: CloudSyncDefault } = await import('./CloudSyncDefault')
      const { prepareCloudSync } = await import('@/app/sync/cloudSync')
      const { iCloudSync } = await import('@/app/sync/iCloudSync')
      vi.mocked(prepareCloudSync).mockResolvedValue(ready)
      let finishOldRead: (value: { outcome: 'seed' }) => void = () => {}
      vi.mocked(iCloudSync.resolveInitialEnable)
        .mockReturnValueOnce(
          new Promise((resolve) => {
            finishOldRead = resolve
          })
        )
        .mockResolvedValueOnce({ outcome: 'seed' })

      await act(async () => {
        renderer = create(<CloudSyncDefault />)
      })
      await act(async () => {
        keyChanged()
      })
      await act(async () => {
        finishOldRead({ outcome: 'seed' })
      })
      // Only the decision on the new account applies.
      expect(iCloudSync.applySeedEnable).toHaveBeenCalledTimes(1)
      expect(iCloudSync.resolveInitialEnable).toHaveBeenCalledTimes(2)
    })
  })

  describe('while the account key is being replaced', () => {
    const ready = { outcome: 'ready', status: notEntitled.status } as const
    afterEach(async () => {
      const { iCloudSync } = await import('@/app/sync/iCloudSync')
      vi.mocked(iCloudSync.resolveInitialEnable)
        .mockReset()
        .mockResolvedValue({ outcome: 'seed' })
    })

    it('does not decide on the old account, then decides when the replace ends', async () => {
      const { default: CloudSyncDefault } = await import('./CloudSyncDefault')
      const { holdCloudSyncDefault } = await import(
        '@/app/sync/cloudSyncDefaultHold'
      )
      const { prepareCloudSync } = await import('@/app/sync/cloudSync')
      const { iCloudSync } = await import('@/app/sync/iCloudSync')
      vi.mocked(prepareCloudSync).mockResolvedValue(ready)
      let endReplace = () => {}
      let replacing: Promise<void> = Promise.resolve()

      // `leave` turned sync off, so the effect mounts mid-replace.
      await act(async () => {
        replacing = holdCloudSyncDefault(
          () => new Promise<void>((resolve) => (endReplace = resolve))
        )
      })
      await act(async () => {
        renderer = create(<CloudSyncDefault />)
      })
      expect(prepareCloudSync).not.toHaveBeenCalled()
      expect(iCloudSync.applySeedEnable).not.toHaveBeenCalled()

      await act(async () => {
        endReplace()
        await replacing
      })
      expect(iCloudSync.resolveInitialEnable).toHaveBeenCalledTimes(1)
      expect(iCloudSync.applySeedEnable).toHaveBeenCalledTimes(1)
    })

    it('drops a decision on the old account that finishes before key_changed', async () => {
      const { default: CloudSyncDefault } = await import('./CloudSyncDefault')
      const { holdCloudSyncDefault } = await import(
        '@/app/sync/cloudSyncDefaultHold'
      )
      const { prepareCloudSync } = await import('@/app/sync/cloudSync')
      const { iCloudSync } = await import('@/app/sync/iCloudSync')
      vi.mocked(prepareCloudSync).mockResolvedValue(ready)
      let finishOldRead: (value: { outcome: 'seed' }) => void = () => {}
      vi.mocked(iCloudSync.resolveInitialEnable)
        .mockReturnValueOnce(
          new Promise((resolve) => {
            finishOldRead = resolve
          })
        )
        .mockResolvedValueOnce({ outcome: 'seed' })

      await act(async () => {
        renderer = create(<CloudSyncDefault />)
      })
      let endReplace = () => {}
      let replacing: Promise<void> = Promise.resolve()
      await act(async () => {
        replacing = holdCloudSyncDefault(
          () => new Promise<void>((resolve) => (endReplace = resolve))
        )
      })
      // The old account's read ends before the key changes.
      await act(async () => {
        finishOldRead({ outcome: 'seed' })
      })
      expect(iCloudSync.applySeedEnable).not.toHaveBeenCalled()

      await act(async () => {
        endReplace()
        await replacing
      })
      expect(iCloudSync.resolveInitialEnable).toHaveBeenCalledTimes(2)
      expect(iCloudSync.applySeedEnable).toHaveBeenCalledTimes(1)
    })

    it('drops a decision when a whole replace came and went while it read', async () => {
      const { default: CloudSyncDefault } = await import('./CloudSyncDefault')
      const { holdCloudSyncDefault } = await import(
        '@/app/sync/cloudSyncDefaultHold'
      )
      const { prepareCloudSync } = await import('@/app/sync/cloudSync')
      const { iCloudSync } = await import('@/app/sync/iCloudSync')
      vi.mocked(prepareCloudSync).mockResolvedValue(ready)
      let finishOldRead: (value: { outcome: 'seed' }) => void = () => {}
      vi.mocked(iCloudSync.resolveInitialEnable)
        .mockReturnValueOnce(
          new Promise((resolve) => {
            finishOldRead = resolve
          })
        )
        .mockResolvedValueOnce({ outcome: 'seed' })

      await act(async () => {
        renderer = create(<CloudSyncDefault />)
      })
      await act(async () => {
        await holdCloudSyncDefault(async () => {})
      })
      await act(async () => {
        finishOldRead({ outcome: 'seed' })
      })
      expect(iCloudSync.resolveInitialEnable).toHaveBeenCalledTimes(2)
      expect(iCloudSync.applySeedEnable).toHaveBeenCalledTimes(1)
    })

    it('decides again after a replace that throws', async () => {
      const { default: CloudSyncDefault } = await import('./CloudSyncDefault')
      const { holdCloudSyncDefault, cloudSyncDefaultHeld } = await import(
        '@/app/sync/cloudSyncDefaultHold'
      )
      const { prepareCloudSync } = await import('@/app/sync/cloudSync')
      const { iCloudSync } = await import('@/app/sync/iCloudSync')
      vi.mocked(prepareCloudSync).mockResolvedValue(ready)
      let failReplace: (error: Error) => void = () => {}
      let replacing: Promise<void> = Promise.resolve()
      await act(async () => {
        replacing = holdCloudSyncDefault(
          () => new Promise<void>((_, reject) => (failReplace = reject))
        )
        replacing.catch(() => undefined)
      })
      await act(async () => {
        renderer = create(<CloudSyncDefault />)
      })
      expect(prepareCloudSync).not.toHaveBeenCalled()

      await act(async () => {
        failReplace(new Error('network'))
        await replacing.catch(() => undefined)
      })
      expect(cloudSyncDefaultHeld()).toBe(false)
      expect(iCloudSync.applySeedEnable).toHaveBeenCalledTimes(1)
    })

    it('listens to nothing after it unmounts', async () => {
      const { default: CloudSyncDefault } = await import('./CloudSyncDefault')
      const { holdCloudSyncDefault } = await import(
        '@/app/sync/cloudSyncDefaultHold'
      )
      const { prepareCloudSync } = await import('@/app/sync/cloudSync')
      vi.mocked(prepareCloudSync).mockResolvedValue({
        outcome: 'no_session',
        error: new Error('offline'),
      })

      await act(async () => {
        renderer = create(<CloudSyncDefault />)
      })
      expect(runtime.accountListeners).toHaveLength(1)
      expect(runtime.appStateListeners).toHaveLength(1)
      expect(prepareCloudSync).toHaveBeenCalledTimes(1)

      act(() => renderer?.unmount())
      renderer = null
      expect(runtime.accountListeners).toHaveLength(0)
      expect(runtime.appStateListeners).toHaveLength(0)
      // A replace that ends now has nobody to wake.
      await act(async () => {
        await holdCloudSyncDefault(async () => {})
      })
      expect(prepareCloudSync).toHaveBeenCalledTimes(1)
    })

    it('ignores a session opening', async () => {
      const { default: CloudSyncDefault } = await import('./CloudSyncDefault')
      const { prepareCloudSync } = await import('@/app/sync/cloudSync')
      vi.mocked(prepareCloudSync).mockResolvedValue({
        outcome: 'no_session',
        error: new Error('offline'),
      })

      await act(async () => {
        renderer = create(<CloudSyncDefault />)
      })
      expect(prepareCloudSync).toHaveBeenCalledTimes(1)
      await act(async () => {
        runtime.accountListeners.forEach((listener) =>
          listener('session_opened')
        )
      })
      expect(prepareCloudSync).toHaveBeenCalledTimes(1)
    })
  })

  describe('while Cloud Sync is for everyone (ADR 0040 §2)', () => {
    const ready = {
      outcome: 'ready',
      status: {
        ...notEntitled.status,
        entitled: true,
        entitlement: 'everyone',
      },
    } as const

    it('turns it on for a new install that isn’t a Supporter', async () => {
      runtime.isSupporter = false
      runtime.entitlement = 'everyone'
      runtime.installedBeforeFreeSync = false
      const { default: CloudSyncDefault } = await import('./CloudSyncDefault')
      const { prepareCloudSync } = await import('@/app/sync/cloudSync')
      const { iCloudSync } = await import('@/app/sync/iCloudSync')
      vi.mocked(prepareCloudSync).mockResolvedValueOnce(ready)

      await act(async () => {
        renderer = create(<CloudSyncDefault />)
      })
      expect(runtime.setState).toHaveBeenCalledWith({ syncProvider: 'cloud' })
      expect(iCloudSync.applySeedEnable).toHaveBeenCalledWith(
        'supporter_default'
      )
    })

    it('leaves an existing install that isn’t a Supporter off', async () => {
      runtime.isSupporter = false
      runtime.entitlement = 'everyone'
      runtime.cloudSyncEntitled = true
      const { default: CloudSyncDefault } = await import('./CloudSyncDefault')
      const { prepareCloudSync } = await import('@/app/sync/cloudSync')

      await act(async () => {
        renderer = create(<CloudSyncDefault />)
      })
      expect(prepareCloudSync).not.toHaveBeenCalled()
      expect(runtime.setState).not.toHaveBeenCalled()
    })

    it('still turns it on for an existing Supporter install', async () => {
      runtime.entitlement = 'everyone'
      const { default: CloudSyncDefault } = await import('./CloudSyncDefault')
      const { prepareCloudSync } = await import('@/app/sync/cloudSync')
      const { iCloudSync } = await import('@/app/sync/iCloudSync')
      vi.mocked(prepareCloudSync).mockResolvedValueOnce(ready)

      await act(async () => {
        renderer = create(<CloudSyncDefault />)
      })
      expect(iCloudSync.applySeedEnable).toHaveBeenCalledWith(
        'supporter_default'
      )
    })
  })
})

describe('CloudSyncDefault on the web', () => {
  const ready = {
    outcome: 'ready',
    status: { ...notEntitled.status, entitled: true, entitlement: 'everyone' },
  } as const
  const remote = { deviceId: 'phone' } as never

  beforeEach(() => {
    runtime.os = 'web'
    runtime.isSupporter = false
    runtime.entitlement = 'everyone'
    runtime.installedBeforeFreeSync = false
    // Just signed in: onboarding hasn't run.
    runtime.onboardingComplete = false
  })

  const render = async () => {
    const { default: CloudSyncDefault } = await import('./CloudSyncDefault')
    const { prepareCloudSync } = await import('@/app/sync/cloudSync')
    vi.mocked(prepareCloudSync).mockResolvedValue(ready)
    await act(async () => {
      renderer = create(<CloudSyncDefault />)
    })
    return {
      iCloudSync: (await import('@/app/sync/iCloudSync')).iCloudSync,
      completeOnboarding: (
        await import('@/features/settings/lib/completeOnboardingFromRestore')
      ).completeOnboardingFromRestore,
    }
  }

  it('brings in the account’s data before onboarding, and skips it', async () => {
    const { iCloudSync } = await import('@/app/sync/iCloudSync')
    vi.mocked(iCloudSync.resolveInitialEnable).mockResolvedValueOnce({
      outcome: 'pull',
      remote,
    })
    const { completeOnboarding } = await render()
    expect(runtime.setState).toHaveBeenCalledWith({ syncProvider: 'cloud' })
    expect(iCloudSync.applyPullEnable).toHaveBeenCalledWith(
      remote,
      'supporter_default'
    )
    expect(completeOnboarding).toHaveBeenCalledWith('cloud_sync')
    // The peers' claims come with a pull, which also settles the id.
    expect(iCloudSync.pullAndMerge).toHaveBeenCalledWith('enabled')
  })

  it('seeds a web-only account and leaves onboarding to run', async () => {
    const { iCloudSync, completeOnboarding } = await render()
    expect(iCloudSync.applySeedEnable).toHaveBeenCalledWith('supporter_default')
    expect(completeOnboarding).not.toHaveBeenCalled()
    expect(iCloudSync.pullAndMerge).toHaveBeenCalledWith('enabled')
  })

  it('merges instead of asking when both sides have records', async () => {
    const { iCloudSync } = await import('@/app/sync/iCloudSync')
    vi.mocked(iCloudSync.resolveInitialEnable).mockResolvedValueOnce({
      outcome: 'conflict',
      remote,
      account: { token: null, changedAt: null },
    })
    const { completeOnboarding } = await render()
    // Only records merge: the account's preferences and profile stay.
    expect(iCloudSync.applyMergeEnable).toHaveBeenCalledWith(
      remote,
      'supporter_default',
      { keepRemoteSettings: true }
    )
    expect(completeOnboarding).toHaveBeenCalledWith('cloud_sync')
  })

  it('finishes onboarding even when the merge didn’t finish, and reports it once', async () => {
    const { iCloudSync } = await import('@/app/sync/iCloudSync')
    const { analytics } = await import('@/lib/analytics')
    vi.mocked(iCloudSync.resolveInitialEnable).mockResolvedValueOnce({
      outcome: 'conflict',
      remote,
      account: { token: null, changedAt: null },
    })
    vi.mocked(iCloudSync.applyMergeEnable).mockRejectedValueOnce(
      new Error('Sync merge incomplete')
    )
    const { completeOnboarding } = await render()
    expect(completeOnboarding).toHaveBeenCalledWith('cloud_sync')
    const outcomes = vi
      .mocked(analytics.capture)
      .mock.calls.filter(([event]) => event === 'cloud_sync_default_outcome')
      .map(([, props]) => (props as { outcome: string }).outcome)
    expect(outcomes).toEqual(['conflict', 'merge_incomplete'])
  })

  describe('holding onboarding', () => {
    const state = async () =>
      (await import('@/app/sync/webFirstSync')).firstSyncState()

    it.each(['incomplete', 'unavailable'] as const)(
      'stalls on %s, and decides again on Retry',
      async (outcome) => {
        const { iCloudSync } = await import('@/app/sync/iCloudSync')
        vi.mocked(iCloudSync.resolveInitialEnable).mockResolvedValueOnce({
          outcome,
        } as never)
        await render()
        expect(await state()).toBe('stalled')
        expect(iCloudSync.applySeedEnable).not.toHaveBeenCalled()

        const { retryFirstSync } = await import('@/app/sync/webFirstSync')
        const { checkAppConfig } = await import('@/lib/appUpdate')
        await act(async () => retryFirstSync())
        expect(checkAppConfig).toHaveBeenCalledWith({ force: true })
        expect(iCloudSync.resolveInitialEnable).toHaveBeenCalledTimes(2)
        expect(iCloudSync.applySeedEnable).toHaveBeenCalled()
      }
    )

    it('stalls without a session', async () => {
      const { default: CloudSyncDefault } = await import('./CloudSyncDefault')
      const { prepareCloudSync } = await import('@/app/sync/cloudSync')
      vi.mocked(prepareCloudSync).mockResolvedValue({
        outcome: 'no_session',
        error: null,
      })
      await act(async () => {
        renderer = create(<CloudSyncDefault />)
      })
      expect(await state()).toBe('stalled')
    })

    it('stalls when deciding threw', async () => {
      const { iCloudSync } = await import('@/app/sync/iCloudSync')
      vi.mocked(iCloudSync.resolveInitialEnable).mockRejectedValueOnce(
        new Error('offline')
      )
      await render()
      expect(await state()).toBe('stalled')
    })

    it('reads the account again on Retry once sync is on', async () => {
      const { iCloudSync } = await import('@/app/sync/iCloudSync')
      await render()
      vi.mocked(iCloudSync.pullAndMerge).mockClear()
      runtime.live = { iCloudSyncEnabled: true }
      const { retryFirstSync } = await import('@/app/sync/webFirstSync')
      await act(async () => retryFirstSync())
      expect(iCloudSync.pullAndMerge).toHaveBeenCalledWith('enabled')
    })

    it('lets onboarding run for an account sync can’t run for', async () => {
      const { default: CloudSyncDefault } = await import('./CloudSyncDefault')
      const { prepareCloudSync } = await import('@/app/sync/cloudSync')
      vi.mocked(prepareCloudSync).mockResolvedValue(notEntitled)
      await act(async () => {
        renderer = create(<CloudSyncDefault />)
      })
      expect(await state()).toBe('released')
    })

    it('lets onboarding run once the server said the account isn’t entitled', async () => {
      runtime.entitlement = 'supporter'
      runtime.cloudSyncEntitled = false
      const { iCloudSync } = await render()
      const { prepareCloudSync } = await import('@/app/sync/cloudSync')
      expect(prepareCloudSync).not.toHaveBeenCalled()
      expect(iCloudSync.resolveInitialEnable).not.toHaveBeenCalled()
      expect(await state()).toBe('released')
    })

    it('asks the server before letting onboarding run while Cloud Sync is for Supporters', async () => {
      runtime.entitlement = 'supporter'
      runtime.cloudSyncEntitled = null
      const { default: CloudSyncDefault } = await import('./CloudSyncDefault')
      const { prepareCloudSync } = await import('@/app/sync/cloudSync')
      let answer: (outcome: typeof notEntitled) => void = () => {}
      vi.mocked(prepareCloudSync).mockReturnValue(
        new Promise((resolve) => (answer = resolve))
      )
      await act(async () => {
        renderer = create(<CloudSyncDefault />)
      })
      expect(prepareCloudSync).toHaveBeenCalled()
      expect(await state()).toBe('checking')
      await act(async () => answer(notEntitled))
      expect(await state()).toBe('released')
    })

    it('decides once the server says a Supporter-only account is entitled', async () => {
      runtime.entitlement = 'supporter'
      runtime.cloudSyncEntitled = null
      const { iCloudSync } = await render()
      expect(iCloudSync.applySeedEnable).toHaveBeenCalledWith(
        'supporter_default'
      )
      expect(await state()).toBe('checking')
    })

    it('says why when the server’s switch is off', async () => {
      const { default: CloudSyncDefault } = await import('./CloudSyncDefault')
      const { prepareCloudSync } = await import('@/app/sync/cloudSync')
      vi.mocked(prepareCloudSync).mockResolvedValue({ outcome: 'disabled' })
      await act(async () => {
        renderer = create(<CloudSyncDefault />)
      })
      const { firstSyncStallReason } = await import('@/app/sync/webFirstSync')
      expect(await state()).toBe('stalled')
      expect(firstSyncStallReason()).toBe('paused')
    })

    describe('when another device’s slot can’t be read', () => {
      it.each(['invalid-file', 'newer-version'] as const)(
        'merges the account’s readable data, keeping its settings, and goes on (%s)',
        async (reason) => {
          const { iCloudSync } = await import('@/app/sync/iCloudSync')
          vi.mocked(iCloudSync.resolveInitialEnable).mockResolvedValueOnce({
            outcome: 'incomplete',
            reason,
            remote,
          })
          // The slot it couldn't read keeps the merge from finishing.
          vi.mocked(iCloudSync.applyMergeEnable).mockRejectedValueOnce(
            new Error('Sync merge incomplete')
          )
          const { completeOnboarding } = await render()
          expect(runtime.setState).toHaveBeenCalledWith({
            syncProvider: 'cloud',
          })
          expect(iCloudSync.applyMergeEnable).toHaveBeenCalledWith(
            remote,
            'supporter_default',
            { keepRemoteSettings: true }
          )
          expect(completeOnboarding).toHaveBeenCalledWith('cloud_sync')
          expect(await state()).not.toBe('stalled')
        }
      )

      it('stalls, and says why, when no other slot can be read', async () => {
        const { iCloudSync } = await import('@/app/sync/iCloudSync')
        vi.mocked(iCloudSync.resolveInitialEnable).mockResolvedValueOnce({
          outcome: 'incomplete',
          reason: 'invalid-file',
        })
        const { completeOnboarding } = await render()
        const { firstSyncStallReason } = await import('@/app/sync/webFirstSync')
        expect(await state()).toBe('stalled')
        expect(firstSyncStallReason()).toBe('unreadable')
        expect(iCloudSync.applySeedEnable).not.toHaveBeenCalled()
        expect(iCloudSync.applyMergeEnable).not.toHaveBeenCalled()
        expect(completeOnboarding).not.toHaveBeenCalled()
      })

      it('waits for a read that’s still going on', async () => {
        const { iCloudSync } = await import('@/app/sync/iCloudSync')
        vi.mocked(iCloudSync.resolveInitialEnable).mockResolvedValueOnce({
          outcome: 'incomplete',
          reason: 'downloading',
          remote,
        } as never)
        await render()
        expect(await state()).toBe('stalled')
        expect(iCloudSync.applyMergeEnable).not.toHaveBeenCalled()
      })
    })

    it('never touches the hold on a phone', async () => {
      runtime.os = 'ios'
      runtime.onboardingComplete = true
      const { iCloudSync } = await import('@/app/sync/iCloudSync')
      vi.mocked(iCloudSync.resolveInitialEnable).mockResolvedValueOnce({
        outcome: 'incomplete',
      } as never)
      await render()
      expect(await state()).toBe('checking')
    })
  })

  it('still waits for onboarding on a phone', async () => {
    runtime.os = 'ios'
    const { iCloudSync } = await render()
    expect(iCloudSync.resolveInitialEnable).not.toHaveBeenCalled()
  })

  it('doesn’t pull again after a phone’s default', async () => {
    runtime.os = 'ios'
    runtime.onboardingComplete = true
    const { iCloudSync } = await render()
    expect(iCloudSync.applySeedEnable).toHaveBeenCalled()
    expect(iCloudSync.pullAndMerge).not.toHaveBeenCalled()
  })
})
