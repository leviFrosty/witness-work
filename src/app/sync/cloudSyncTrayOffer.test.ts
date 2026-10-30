import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  prefs: { cloudSyncTrayOffer: null as 'shown' | 'answered' | null },
}))

vi.mock('@/stores/preferences', () => ({
  usePreferences: {
    getState: () => runtime.prefs,
    setState: (partial: object) => Object.assign(runtime.prefs, partial),
  },
}))
vi.mock('@/app/sync/syncOption', () => ({ switchSyncOption: vi.fn() }))
vi.mock('@/app/sync/switchFailureMessage', () => ({
  switchFailureMessage: (reason: string) => `message:${reason}`,
}))
vi.mock('@/stores/toasts', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

import {
  cloudSyncTrayOfferVariant,
  dismissCloudSyncTrayOffer,
  recordCloudSyncTrayOfferShown,
  retireCloudSyncTrayOffer,
  turnOnCloudSyncFromTray,
  type CloudSyncTrayOfferInput,
} from '@/app/sync/cloudSyncTrayOffer'
import { switchSyncOption } from '@/app/sync/syncOption'
import { toast } from '@/stores/toasts'
import { analytics } from '@/lib/analytics'

beforeEach(() => {
  vi.clearAllMocks()
  runtime.prefs = { cloudSyncTrayOffer: null }
})

const existing: CloudSyncTrayOfferInput = {
  hasSyncTransport: true,
  cloudSyncOffered: true,
  entitlement: 'everyone',
  installedBeforeFreeSync: true,
  onboardingComplete: true,
  cloudSyncTrayOffer: null,
  option: 'off',
  isSupporter: false,
}
const variant = (overrides: Partial<CloudSyncTrayOfferInput> = {}) =>
  cloudSyncTrayOfferVariant({ ...existing, ...overrides })

describe('who sees the tray offer (ADR 0040 §2, §4)', () => {
  it('tells an existing install that isn’t a Supporter it’s free', () => {
    expect(variant()).toBe('free')
    expect(variant({ cloudSyncTrayOffer: 'shown' })).toBe('free')
  })

  it('thanks a Supporter, whatever the entitlement', () => {
    expect(variant({ isSupporter: true })).toBe('thanks')
    expect(variant({ isSupporter: true, entitlement: 'supporter' })).toBe(
      'thanks'
    )
  })

  it('says nothing to someone who isn’t a Supporter until it’s free', () => {
    expect(variant({ entitlement: 'supporter' })).toBeNull()
    expect(variant({ entitlement: undefined })).toBeNull()
  })

  it.each(['off', 'platform'] as const)(
    'offers it to a device whose sync is %s',
    (option) => {
      expect(variant({ option })).toBe('free')
      expect(variant({ option, isSupporter: true })).toBe('thanks')
    }
  )

  it('leaves a device on Cloud Sync alone', () => {
    expect(variant({ option: 'cloud' })).toBeNull()
    expect(variant({ option: 'cloud', isSupporter: true })).toBeNull()
  })

  it('never comes back once answered', () => {
    expect(variant({ cloudSyncTrayOffer: 'answered' })).toBeNull()
    expect(
      variant({ cloudSyncTrayOffer: 'answered', isSupporter: true })
    ).toBeNull()
  })

  it('isn’t for a new install, which got Cloud Sync as its default', () => {
    expect(variant({ installedBeforeFreeSync: false })).toBeNull()
    expect(
      variant({ installedBeforeFreeSync: false, isSupporter: true })
    ).toBeNull()
  })

  it('waits for onboarding, a sync transport and the server’s switch', () => {
    expect(variant({ onboardingComplete: false })).toBeNull()
    expect(variant({ hasSyncTransport: false })).toBeNull()
    expect(variant({ cloudSyncOffered: false })).toBeNull()
  })
})

describe('answering it', () => {
  it('reports it shown once per device', () => {
    recordCloudSyncTrayOfferShown(true)
    recordCloudSyncTrayOfferShown(true)
    expect(analytics.capture).toHaveBeenCalledOnce()
    expect(analytics.capture).toHaveBeenCalledWith(
      'cloud_sync_tray_offer_shown',
      { supporter: true }
    )
    expect(runtime.prefs.cloudSyncTrayOffer).toBe('shown')
  })

  it('retires it when dismissed', () => {
    runtime.prefs.cloudSyncTrayOffer = 'shown'
    dismissCloudSyncTrayOffer(false)
    expect(runtime.prefs.cloudSyncTrayOffer).toBe('answered')
    expect(analytics.capture).toHaveBeenCalledWith(
      'cloud_sync_tray_offer_answered',
      { choice: 'dismiss', supporter: false }
    )
    // Already answered: nothing more to report.
    dismissCloudSyncTrayOffer(false)
    expect(analytics.capture).toHaveBeenCalledOnce()
  })

  it('stays retired once the device moved to Cloud Sync another way', () => {
    retireCloudSyncTrayOffer()
    expect(runtime.prefs.cloudSyncTrayOffer).toBe('answered')
    recordCloudSyncTrayOfferShown(false)
    expect(runtime.prefs.cloudSyncTrayOffer).toBe('answered')
  })
})

describe('Turn On', () => {
  it('switches to Cloud Sync, says so, and retires the offer', async () => {
    vi.mocked(switchSyncOption).mockResolvedValueOnce({
      outcome: 'switched',
      pending: false,
    })
    await turnOnCloudSyncFromTray(false)
    expect(switchSyncOption).toHaveBeenCalledWith('cloud', 'tray')
    expect(analytics.capture).toHaveBeenCalledWith(
      'cloud_sync_tray_offer_answered',
      { choice: 'turn_on', supporter: false }
    )
    expect(toast.success).toHaveBeenCalledWith('syncOption_switchedCloud')
    expect(toast.error).not.toHaveBeenCalled()
    expect(runtime.prefs.cloudSyncTrayOffer).toBe('answered')
  })

  it.each([
    'offline',
    'no_session',
    'not_entitled',
    'disabled',
    'incomplete',
    'unavailable',
  ] as const)(
    'keeps the offer and says what to do when it fails (%s)',
    async (reason) => {
      runtime.prefs.cloudSyncTrayOffer = 'shown'
      vi.mocked(switchSyncOption).mockResolvedValueOnce({
        outcome: 'failed',
        reason,
      })
      await turnOnCloudSyncFromTray(true)
      expect(toast.error).toHaveBeenCalledWith('cloudSyncTrayOffer_failed', {
        message: `message:${reason}`,
      })
      expect(toast.success).not.toHaveBeenCalled()
      expect(runtime.prefs.cloudSyncTrayOffer).toBe('shown')
    }
  )
})
