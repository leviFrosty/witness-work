import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SyncStatus } from '@/lib/syncTransport/server/syncClient'
import type { SwitchOutcome, SyncOption } from '@/app/sync/syncOption'

// A phone answering the account's Cloud Sync request (ADR 0040 §5;
// docs/cloud-sync-photos.md, "The Cloud Sync request" → "The app"). The switch
// itself is `switchSyncOption`'s, covered end to end in cloudSync.test.ts.

const runtime = vi.hoisted(() => ({
  option: 'platform' as SyncOption,
  session: true as boolean,
  switchOutcome: null as SwitchOutcome | null,
  statusListeners: [] as Array<(status: SyncStatus) => void>,
}))

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('expo-device', () => ({
  DeviceType: { PHONE: 1, TABLET: 2 },
  deviceType: 1,
  modelName: 'iPhone',
  osName: 'iOS',
}))
vi.mock('expo-crypto', () => ({ getRandomBytes: vi.fn() }))
vi.mock('@/lib/installId', () => ({
  getOrCreateInstallId: () => 'install-phone',
  androidDeviceInstallId: () => 'install-phone',
}))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: {
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    addBreadcrumb: vi.fn(),
  },
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock('@/stores/toasts', () => ({ toast: { success: vi.fn() } }))
vi.mock('@/lib/serverAccount', () => ({
  accountSessions: {
    snapshot: () => (runtime.session ? { accountId: 'acct-family' } : null),
  },
}))
vi.mock('@/app/sync/cloudSync', () => ({
  onCloudSyncStatus: (listener: (status: SyncStatus) => void) => {
    runtime.statusListeners.push(listener)
    return () => {
      runtime.statusListeners = runtime.statusListeners.filter(
        (l) => l !== listener
      )
    }
  },
}))
vi.mock('@/app/sync/syncOption', () => ({
  currentSyncOption: () => runtime.option,
  switchSyncOption: vi.fn(async (to: SyncOption) => {
    const outcome = runtime.switchOutcome ?? {
      outcome: 'switched',
      pending: false,
    }
    if (outcome.outcome === 'switched') runtime.option = to
    return outcome
  }),
}))

const REQUESTED_AT = 1_700_000_000_000

const status = (overrides: Partial<SyncStatus> = {}): SyncStatus => ({
  enabled: true,
  entitled: true,
  entitlement: 'everyone',
  supporter: false,
  supporterCheckFailed: false,
  photos: true,
  requestedAt: REQUESTED_AT,
  ...overrides,
})

async function load() {
  vi.resetModules()
  const request = await import('@/app/sync/cloudSyncRequest')
  const { usePreferences } = await import('@/stores/preferences')
  const { useUpdateRequired } = await import('@/lib/appUpdate/updateRequired')
  const { switchSyncOption } = await import('@/app/sync/syncOption')
  const { toast } = await import('@/stores/toasts')
  const { analytics } = await import('@/lib/analytics')
  const { useSupporter } = await import('@/features/supporter/stores/supporter')
  usePreferences.setState({ onboardingComplete: true })
  return {
    ...request,
    usePreferences,
    useUpdateRequired,
    useSupporter,
    switchSyncOption: vi.mocked(switchSyncOption),
    toastSuccess: vi.mocked(toast.success),
    capture: vi.mocked(analytics.capture),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('__DEV__', true)
  runtime.option = 'platform'
  runtime.session = true
  runtime.switchOutcome = null
  runtime.statusListeners = []
})

describe('answering the Cloud Sync request', () => {
  it.each<SyncOption>(['platform', 'off'])(
    'switches a phone on %s to Cloud Sync and says so, once',
    async (option) => {
      runtime.option = option
      const app = await load()
      // The User turned sync off themselves: the request still moves it.
      app.usePreferences.setState({ iCloudSyncSetByUser: true })
      expect(await app.answerCloudSyncRequest(status())).toEqual({
        outcome: 'switched',
      })
      expect(app.switchSyncOption).toHaveBeenCalledWith(
        'cloud',
        'account_request'
      )
      expect(app.toastSuccess).toHaveBeenCalledWith(
        'cloudSyncRequest_switchedTitle',
        { message: 'cloudSyncRequest_switchedMessage' }
      )
      expect(app.capture).toHaveBeenCalledWith('cloud_sync_request_answered', {
        outcome: 'switched',
        from: option,
      })
      expect(app.usePreferences.getState().cloudSyncRequestAnswered).toBe(
        REQUESTED_AT
      )

      // The request stands until the server clears it; the next foreground
      // reads it again and does nothing.
      expect(await app.answerCloudSyncRequest(status())).toEqual({
        outcome: 'skipped',
      })
      expect(app.switchSyncOption).toHaveBeenCalledTimes(1)
      expect(app.toastSuccess).toHaveBeenCalledTimes(1)
    }
  )

  it('doesn’t overrule a User who moves the phone back afterwards', async () => {
    const app = await load()
    await app.answerCloudSyncRequest(status())
    // Back to iCloud in Settings, with the same request still standing.
    runtime.option = 'platform'
    expect(await app.answerCloudSyncRequest(status())).toEqual({
      outcome: 'skipped',
    })
    expect(app.switchSyncOption).toHaveBeenCalledTimes(1)

    // The web asks anew once the request lapsed or was withdrawn.
    expect(
      await app.answerCloudSyncRequest(
        status({ requestedAt: REQUESTED_AT + 1 })
      )
    ).toEqual({ outcome: 'switched' })
  })

  it('does nothing on a phone already on Cloud Sync', async () => {
    runtime.option = 'cloud'
    const app = await load()
    expect(await app.answerCloudSyncRequest(status())).toEqual({
      outcome: 'already_on',
    })
    expect(app.switchSyncOption).not.toHaveBeenCalled()
    expect(app.toastSuccess).not.toHaveBeenCalled()
    expect(app.capture).toHaveBeenCalledWith('cloud_sync_request_answered', {
      outcome: 'already_on',
    })
    // Once: a move to iCloud afterwards isn't overruled either.
    runtime.option = 'platform'
    expect(await app.answerCloudSyncRequest(status())).toEqual({
      outcome: 'skipped',
    })
    expect(app.capture).toHaveBeenCalledTimes(1)
  })

  it('does nothing without a request', async () => {
    const app = await load()
    expect(
      await app.answerCloudSyncRequest(status({ requestedAt: null }))
    ).toEqual({ outcome: 'skipped' })
    expect(app.switchSyncOption).not.toHaveBeenCalled()
  })

  it.each(['no_session', 'offline', 'incomplete', 'unavailable'] as const)(
    'tries again next time after a switch that fails for now (%s)',
    async (reason) => {
      runtime.switchOutcome = { outcome: 'failed', reason }
      const app = await load()
      expect(await app.answerCloudSyncRequest(status())).toEqual({
        outcome: 'failed',
        reason,
        final: false,
      })
      expect(app.toastSuccess).not.toHaveBeenCalled()
      expect(app.usePreferences.getState().cloudSyncRequestAnswered).toBeNull()

      runtime.switchOutcome = null
      expect(await app.answerCloudSyncRequest(status())).toEqual({
        outcome: 'switched',
      })
      expect(app.switchSyncOption).toHaveBeenCalledTimes(2)
    }
  )

  it('tries again after a refusal, once the account can sync', async () => {
    // Cloud Sync for Supporters only, or a purchase not linked yet: either can
    // change before the request lapses.
    runtime.switchOutcome = { outcome: 'failed', reason: 'not_entitled' }
    const app = await load()
    expect(await app.answerCloudSyncRequest(status())).toEqual({
      outcome: 'failed',
      reason: 'not_entitled',
      final: false,
    })
    expect(app.capture).toHaveBeenCalledWith('cloud_sync_request_answered', {
      outcome: 'failed',
      from: 'platform',
      reason: 'not_entitled',
      final: false,
    })
    expect(app.usePreferences.getState().cloudSyncRequestAnswered).toBeNull()

    runtime.switchOutcome = null
    expect(await app.answerCloudSyncRequest(status())).toEqual({
      outcome: 'switched',
    })
  })

  it('waits while the server says the account can’t sync, unless this phone knows it’s a Supporter', async () => {
    const app = await load()
    expect(
      await app.answerCloudSyncRequest(status({ entitled: false }))
    ).toEqual({ outcome: 'skipped' })
    expect(app.switchSyncOption).not.toHaveBeenCalled()
    expect(app.capture).not.toHaveBeenCalled()

    // The switch links a Supporter's purchase first, so it can succeed.
    app.useSupporter.getState().setSupporter(true)
    expect(
      await app.answerCloudSyncRequest(status({ entitled: false }))
    ).toEqual({ outcome: 'switched' })
  })

  it('does nothing when a switch already running turns Cloud Sync on', async () => {
    const app = await load()
    const { withSyncOptionLock } = await import('@/app/sync/syncOptionLock')
    let finish!: () => void
    // Cloud Sync's default deciding for a device that never chose.
    const running = withSyncOptionLock(
      () =>
        new Promise<void>((resolve) => {
          finish = () => {
            runtime.option = 'cloud'
            resolve()
          }
        })
    )
    const answered = app.answerCloudSyncRequest(status())
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    finish()
    await running
    expect(await answered).toEqual({ outcome: 'already_on' })
    expect(app.switchSyncOption).not.toHaveBeenCalled()
    expect(app.toastSuccess).not.toHaveBeenCalled()
  })

  it('waits while ww-api can’t check RevenueCat or Cloud Sync is off', async () => {
    const app = await load()
    for (const answer of [
      status({ entitled: false, supporterCheckFailed: true }),
      status({ enabled: false, entitled: false }),
    ])
      expect(await app.answerCloudSyncRequest(answer)).toEqual({
        outcome: 'skipped',
      })
    expect(app.switchSyncOption).not.toHaveBeenCalled()
    expect(app.usePreferences.getState().cloudSyncRequestAnswered).toBeNull()
  })

  it('leaves alone a phone the User moved elsewhere during the switch', async () => {
    // Settings was switching this phone to Drive; the request joined it.
    runtime.option = 'off'
    const app = await load()
    app.switchSyncOption.mockImplementationOnce(async () => {
      runtime.option = 'platform'
      return { outcome: 'switched', pending: false }
    })
    expect(await app.answerCloudSyncRequest(status())).toEqual({
      outcome: 'failed',
      reason: 'chose_other',
      final: true,
    })
    expect(app.toastSuccess).not.toHaveBeenCalled()
    expect(await app.answerCloudSyncRequest(status())).toEqual({
      outcome: 'skipped',
    })
  })

  it('waits for onboarding, then answers once it’s done', async () => {
    const app = await load()
    app.usePreferences.setState({ onboardingComplete: false })
    const uninstall = app.installCloudSyncRequest()
    runtime.statusListeners.forEach((listener) => listener(status()))
    await Promise.resolve()
    expect(app.switchSyncOption).not.toHaveBeenCalled()

    app.usePreferences.setState({ onboardingComplete: true })
    await vi.waitFor(() =>
      expect(app.switchSyncOption).toHaveBeenCalledTimes(1)
    )
    uninstall()
  })

  it('waits out Update Required', async () => {
    const app = await load()
    app.useUpdateRequired.setState({
      required: { source: 'server', currentVersion: '1.0.0', minVersion: '2' },
    })
    const uninstall = app.installCloudSyncRequest()
    runtime.statusListeners.forEach((listener) => listener(status()))
    await Promise.resolve()
    expect(app.switchSyncOption).not.toHaveBeenCalled()

    app.useUpdateRequired.setState({ required: null })
    await vi.waitFor(() =>
      expect(app.switchSyncOption).toHaveBeenCalledTimes(1)
    )
    uninstall()
  })

  it('doesn’t answer without a session', async () => {
    runtime.session = false
    const app = await load()
    expect(await app.answerCloudSyncRequest(status())).toEqual({
      outcome: 'skipped',
    })
    expect(app.switchSyncOption).not.toHaveBeenCalled()
  })

  it('answers one request at a time, whatever reads the status meanwhile', async () => {
    const app = await load()
    let finish = () => {}
    app.switchSyncOption.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => {
            runtime.option = 'cloud'
            resolve({ outcome: 'switched', pending: false })
          }
        })
    )
    const uninstall = app.installCloudSyncRequest()
    const first = app.answerCloudSyncRequest(status())
    // The switch reads the status again (`prepareCloudSync`), with the
    // request still standing.
    runtime.statusListeners.forEach((listener) => listener(status()))
    expect(await app.answerCloudSyncRequest(status())).toEqual({
      outcome: 'skipped',
    })
    await vi.waitFor(() => expect(app.switchSyncOption).toHaveBeenCalled())
    finish()
    expect(await first).toEqual({ outcome: 'switched' })
    expect(app.switchSyncOption).toHaveBeenCalledTimes(1)
    expect(app.toastSuccess).toHaveBeenCalledTimes(1)
    uninstall()
  })
})
