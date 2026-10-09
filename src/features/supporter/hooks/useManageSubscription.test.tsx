import React from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => {
  vi.stubGlobal('__DEV__', false)
  return {
    platform: 'ios',
    customer: null as unknown,
    prefs: {
      supporterPauseStartedAt: null as number | null,
      supporterPauseResumesAt: null as number | null,
    },
    setPreferences: vi.fn(),
    setCustomer: vi.fn(),
    revalidate: vi.fn(),
    capture: vi.fn(),
    alert: vi.fn(),
    captureException: vi.fn(),
    openURL: vi.fn(),
    getProducts: vi.fn(),
    getPromotionalOffer: vi.fn(),
    purchaseDiscountedProduct: vi.fn(),
    showManageSubscriptions: vi.fn(),
    invalidateCustomerInfoCache: vi.fn(),
    appStateListener: undefined as ((state: string) => void) | undefined,
  }
})
vi.mock('react-native', () => ({
  Alert: { alert: runtime.alert },
  AppState: {
    addEventListener: (_event: string, listener: (state: string) => void) => {
      runtime.appStateListener = listener
      return { remove: vi.fn() }
    },
  },
  Platform: {
    get OS() {
      return runtime.platform
    },
  },
}))
vi.mock('expo-application', () => ({
  applicationId: 'com.leviwilkerson.jwtime',
}))
vi.mock('react-native-purchases', () => ({
  PURCHASES_ERROR_CODE: {
    PURCHASE_CANCELLED_ERROR: '1',
    PURCHASE_NOT_ALLOWED_ERROR: '3',
    INELIGIBLE_ERROR: '18',
    PAYMENT_PENDING_ERROR: '20',
  },
  default: {
    getProducts: runtime.getProducts,
    getPromotionalOffer: runtime.getPromotionalOffer,
    purchaseDiscountedProduct: runtime.purchaseDiscountedProduct,
    showManageSubscriptions: runtime.showManageSubscriptions,
    invalidateCustomerInfoCache: runtime.invalidateCustomerInfoCache,
  },
}))
vi.mock('@/hooks/useCustomer', () => ({
  default: () => ({
    customer: runtime.customer,
    setCustomer: runtime.setCustomer,
    revalidate: runtime.revalidate,
  }),
}))
vi.mock('@/stores/preferences', () => {
  const usePreferences = (selector: (s: typeof runtime.prefs) => unknown) =>
    selector(runtime.prefs)
  usePreferences.getState = () => ({ set: runtime.setPreferences })
  return { usePreferences }
})
vi.mock('@/lib/analytics', () => ({ analytics: { capture: runtime.capture } }))
vi.mock('@/lib/errorTracking', () => ({
  errorTracking: { captureException: runtime.captureException },
}))
vi.mock('@/lib/offlineError', () => ({ isOfflineError: () => false }))
vi.mock('@/lib/links', () => ({ openURL: runtime.openURL }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/dates', () => ({ formatDate: () => 'date' }))

import useManageSubscription from '@/features/supporter/hooks/useManageSubscription'

type Hook = ReturnType<typeof useManageSubscription>
const expiresDate = '2026-11-01T00:00:00.000Z'
const discount = (months: number) => ({
  identifier: `supporter_pause_${months}m_jwtime_499_1mo`,
  price: 0,
  priceString: '$0.00',
  cycles: 1,
  period: `P${months}M`,
  periodUnit: 'MONTH',
  periodNumberOfUnits: months,
})
const product = {
  identifier: 'jwtime_499_1mo',
  subscriptionPeriod: 'P1M',
  discounts: [discount(1), discount(3), discount(6)],
}
const customer = (store = 'APP_STORE', id = 'jwtime_499_1mo') => ({
  managementURL: 'https://apps.apple.com/account/subscriptions',
  subscriptionsByProductIdentifier: {
    [id]: {
      productIdentifier: id,
      isActive: true,
      willRenew: true,
      store,
      expiresDate,
      refundedAt: null,
      billingIssuesDetectedAt: null,
      periodType: 'NORMAL',
      ownershipType: 'PURCHASED',
    },
  },
})

let hook: Hook
const capture = (next: Hook) => {
  hook = next
}
const Harness = () => {
  capture(useManageSubscription(true, 'settings'))
  return null
}
const render = async () => {
  await act(async () => {
    create(<Harness />)
  })
}
const offer = (months: number) => {
  if (hook.state.kind !== 'renewing' || hook.state.pause.kind !== 'offers') {
    throw new Error('pause offers unavailable')
  }
  const match = hook.state.pause.offers.find((o) => o.months === months)
  if (!match) throw new Error(`no ${months}-month offer`)
  return match
}
const events = () => runtime.capture.mock.calls.map(([name]) => name)

describe('useManageSubscription', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: Date.parse('2026-10-05T12:00:00Z') })
    runtime.platform = 'ios'
    runtime.customer = customer()
    runtime.prefs.supporterPauseStartedAt = null
    runtime.prefs.supporterPauseResumesAt = null
    runtime.getProducts.mockResolvedValue([product])
    runtime.getPromotionalOffer.mockResolvedValue({ identifier: 'signed' })
    runtime.purchaseDiscountedProduct.mockResolvedValue({
      customerInfo: { refreshed: true },
    })
    runtime.showManageSubscriptions.mockResolvedValue(undefined)
    runtime.invalidateCustomerInfoCache.mockResolvedValue(undefined)
    runtime.revalidate.mockResolvedValue(undefined)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('reports the sheet once the pause options are known', async () => {
    await render()
    expect(runtime.getProducts).toHaveBeenCalledWith(['jwtime_499_1mo'])
    expect(runtime.capture).toHaveBeenCalledTimes(1)
    expect(runtime.capture).toHaveBeenCalledWith('supporter_manage_viewed', {
      source: 'settings',
      billing: 'monthly',
      store: 'APP_STORE',
      will_renew: true,
      state: 'renewing',
      pause_options: 3,
      pause_unavailable_reason: null,
      product_lookup_failed: false,
    })
  })

  it('reports a failed product lookup and loads it again on retry', async () => {
    runtime.getProducts.mockRejectedValueOnce(new Error('network error'))
    await render()
    expect(hook.productError).toBe('failed')
    expect(runtime.capture).toHaveBeenCalledWith(
      'supporter_manage_viewed',
      expect.objectContaining({ product_lookup_failed: true })
    )
    await act(async () => hook.retryProduct())
    expect(runtime.getProducts).toHaveBeenCalledTimes(2)
    expect(hook.productError).toBeNull()
    expect(offer(3).months).toBe(3)
  })

  it('redeems the free offer and records when payments resume', async () => {
    await render()
    await act(() => hook.pause(offer(3)))
    expect(runtime.purchaseDiscountedProduct).toHaveBeenCalledWith(product, {
      identifier: 'signed',
    })
    expect(runtime.setPreferences).toHaveBeenCalledWith({
      supporterPauseStartedAt: Date.parse('2026-10-05T12:00:00Z'),
      supporterPauseResumesAt: Date.parse('2027-02-01T00:00:00Z'),
    })
    expect(runtime.setCustomer).toHaveBeenCalledWith({ refreshed: true })
    expect(events()).toEqual([
      'supporter_manage_viewed',
      'supporter_pause_started',
      'supporter_pause_completed',
    ])
  })

  it('treats closing the App Store sheet as a change of mind', async () => {
    runtime.purchaseDiscountedProduct.mockRejectedValue({ code: '1' })
    await render()
    await act(() => hook.pause(offer(1)))
    expect(events()).toContain('supporter_pause_cancelled')
    expect(runtime.setPreferences).not.toHaveBeenCalled()
    expect(runtime.alert).not.toHaveBeenCalled()
  })

  it('explains an offer that cannot be signed without reporting a crash', async () => {
    runtime.getPromotionalOffer.mockResolvedValue(undefined)
    await render()
    await act(() => hook.pause(offer(6)))
    expect(runtime.capture).toHaveBeenCalledWith(
      'supporter_pause_failed',
      expect.objectContaining({ months: 6, error_code: 'offer_unavailable' })
    )
    expect(runtime.alert).toHaveBeenCalledWith(
      'manageSupport_pauseErrorTitle',
      'manageSupport_pauseErrorMessage'
    )
    expect(runtime.captureException).not.toHaveBeenCalled()
    expect(runtime.setPreferences).not.toHaveBeenCalled()
  })

  it('opens App Store management and refreshes on return', async () => {
    await render()
    await act(() => hook.openStore('cancel'))
    expect(runtime.capture).toHaveBeenCalledWith(
      'supporter_manage_store_opened',
      expect.objectContaining({ intent: 'cancel', store: 'APP_STORE' })
    )
    expect(runtime.showManageSubscriptions).toHaveBeenCalled()
    expect(runtime.invalidateCustomerInfoCache).toHaveBeenCalled()
    expect(runtime.revalidate).toHaveBeenCalled()
  })

  it('falls back to the management URL when the system sheet fails', async () => {
    runtime.showManageSubscriptions.mockRejectedValue(new Error('no scene'))
    await render()
    await act(() => hook.openStore('cancel'))
    expect(runtime.openURL).toHaveBeenCalledWith(
      'https://apps.apple.com/account/subscriptions'
    )
  })

  it('opens the subscription in Google Play on Android', async () => {
    runtime.platform = 'android'
    vi.resetModules()
    const { default: useAndroidManageSubscription } = await import(
      '@/features/supporter/hooks/useManageSubscription'
    )
    runtime.customer = customer('PLAY_STORE', 'jwtime_499_1mo:monthly')
    runtime.getProducts.mockResolvedValue([
      { ...product, identifier: 'jwtime_499_1mo:monthly', discounts: null },
    ])
    const AndroidHarness = () => {
      capture(useAndroidManageSubscription(true, 'paywall'))
      return null
    }
    await act(async () => {
      create(<AndroidHarness />)
    })
    expect(hook.state).toMatchObject({ pause: { kind: 'play' } })
    await act(() => hook.openStore('pause'))
    expect(runtime.openURL).toHaveBeenCalledWith(
      'https://play.google.com/store/account/subscriptions?sku=jwtime_499_1mo&package=com.leviwilkerson.jwtime'
    )
    expect(runtime.showManageSubscriptions).not.toHaveBeenCalled()
    await act(async () => runtime.appStateListener?.('active'))
    expect(runtime.revalidate).toHaveBeenCalled()
  })
})
