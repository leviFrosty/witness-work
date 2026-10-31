import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotificationItem } from '@/types/notifications'

const runtime = vi.hoisted(() => ({
  isSupporter: false,
  customer: {} as object | null,
  server: {
    account: null as string | null | undefined,
    entry: null as { account: string } | null,
  },
  option: 'off' as 'off' | 'platform' | 'cloud',
  prefs: {
    installedBeforeFreeSync: true,
    onboardingComplete: true,
    cloudSyncTrayOffer: null as 'shown' | 'answered' | null,
    cloudSyncConfig: { enabled: true, entitlement: 'everyone' },
  },
}))

vi.mock('lucide-react-native', () => ({ Cloud: () => null }))
vi.mock('@/hooks/useCustomer', () => ({
  default: () => ({ customer: runtime.customer, unavailable: false }),
}))
vi.mock('@/hooks/useIsSupporter', () => ({
  default: () => ({ isSupporter: runtime.isSupporter }),
}))
vi.mock('@/stores/serverSupporter', () => ({
  useServerSupporter: (select: (state: typeof runtime.server) => unknown) =>
    select(runtime.server),
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/syncTransport/platform', () => ({
  hasSyncTransport: () => true,
}))
vi.mock('@/lib/syncTransport/provider', () => ({
  cloudSyncOffered: () => true,
}))
vi.mock('@/stores/preferences', () => ({
  usePreferences: Object.assign(
    (select: (state: typeof runtime.prefs) => unknown) => select(runtime.prefs),
    {
      getState: () => runtime.prefs,
      setState: (partial: object) => Object.assign(runtime.prefs, partial),
    }
  ),
}))
vi.mock('@/app/sync/syncOption', () => ({
  currentSyncOption: () => runtime.option,
  switchSyncOption: vi.fn(async () => ({
    outcome: 'switched',
    pending: false,
  })),
}))
vi.mock('@/app/sync/switchFailureMessage', () => ({
  switchFailureMessage: () => 'message',
}))
vi.mock('@/stores/toasts', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))

import { useCloudSyncTrayOffer } from '@/app/sync/useCloudSyncTrayOffer'
import { switchSyncOption } from '@/app/sync/syncOption'
import { analytics } from '@/lib/analytics'

const seen: (NotificationItem | null)[] = []
let renderer: ReactTestRenderer | null = null
const Probe = () => {
  seen.push(useCloudSyncTrayOffer())
  return null
}
/** What the hook returned last. */
const latest = () => seen.at(-1) ?? null
const render = async () => {
  await act(async () => {
    renderer = create(<Probe />)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  runtime.isSupporter = false
  runtime.customer = {}
  runtime.server = { account: null, entry: null }
  runtime.option = 'off'
  runtime.prefs.cloudSyncTrayOffer = null
  seen.length = 0
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

describe('useCloudSyncTrayOffer', () => {
  it('tells someone who isn’t a Supporter Cloud Sync is now free', async () => {
    await render()
    expect(latest()).toMatchObject({
      id: 'cloud_sync_offer',
      kind: 'cloud_sync',
      tone: 'accent',
      title: 'cloudSyncTrayOffer_freeTitle',
      description: 'cloudSyncTrayOffer_freeDescription',
    })
    expect(latest()!.actions![0]).toMatchObject({
      label: 'cloudSyncTrayOffer_freeAction',
      inPlace: true,
    })
  })

  it('thanks a Supporter, never saying free', async () => {
    runtime.isSupporter = true
    await render()
    expect(latest()).toMatchObject({
      tone: 'supporter',
      title: 'cloudSyncTrayOffer_thanksTitle',
      description: 'cloudSyncTrayOffer_thanksDescription',
    })
    expect(latest()!.actions![0].label).toBe('cloudSyncTrayOffer_thanksAction')
  })

  it('turns Cloud Sync on in place, reports views and dismissals', async () => {
    runtime.isSupporter = true
    await render()
    latest()!.onView!()
    expect(runtime.prefs.cloudSyncTrayOffer).toBe('shown')
    await act(async () => latest()!.actions![0].onPress())
    expect(switchSyncOption).toHaveBeenCalledWith('cloud', 'tray')
    expect(runtime.prefs.cloudSyncTrayOffer).toBe('answered')
    expect(analytics.capture).toHaveBeenCalledWith(
      'cloud_sync_tray_offer_answered',
      { choice: 'turn_on', supporter: true }
    )
  })

  it('answers it for good when dismissed', async () => {
    await render()
    latest()!.onDismiss!()
    expect(runtime.prefs.cloudSyncTrayOffer).toBe('answered')
  })

  it('retires the offer once the device is on Cloud Sync another way', async () => {
    runtime.option = 'cloud'
    await render()
    expect(latest()).toBeNull()
    expect(runtime.prefs.cloudSyncTrayOffer).toBe('answered')
  })

  it('waits for RevenueCat before choosing an offer', async () => {
    runtime.customer = null
    await render()
    expect(latest()).toBeNull()
  })

  it('waits for the account session before choosing an offer', async () => {
    runtime.server = { account: undefined, entry: null }
    await render()
    expect(latest()).toBeNull()
  })

  it('waits for ww-api’s Supporter answer for this account', async () => {
    // A Supporter whose purchase is under another of the account's RevenueCat
    // customers is one only ww-api knows; the old account's answer doesn't
    // count.
    runtime.server = { account: 'acct', entry: { account: 'old' } }
    await render()
    expect(latest()).toBeNull()
  })

  it('offers it once ww-api has answered for this account', async () => {
    runtime.server = { account: 'acct', entry: { account: 'acct' } }
    await render()
    expect(latest()?.title).toBe('cloudSyncTrayOffer_freeTitle')
  })

  it('stays gone once answered', async () => {
    runtime.prefs.cloudSyncTrayOffer = 'answered'
    await render()
    expect(latest()).toBeNull()
  })
})
