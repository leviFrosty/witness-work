import { useEffect, useRef, useState } from 'react'
import { Alert, AppState, Platform } from 'react-native'
import * as Application from 'expo-application'
import Purchases, {
  PURCHASES_ERROR_CODE,
  type PurchasesError,
  type PurchasesStoreProduct,
} from 'react-native-purchases'
import useCustomer from '@/hooks/useCustomer'
import { usePreferences } from '@/stores/preferences'
import { analytics } from '@/lib/analytics'
import { errorTracking } from '@/lib/errorTracking'
import { isOfflineError } from '@/lib/offlineError'
import { openURL } from '@/lib/links'
import i18n from '@/lib/locales'
import { formatDate } from '@/lib/dates'
import {
  baseProductId,
  billingKind,
  manageableSubscription,
  manageSubscriptionState,
  matchStoreProduct,
  pauseResumeDate,
  playSubscriptionsUrl,
  type ManageSubscriptionState,
  type PauseOffer,
  type StorePlatform,
} from '@/features/supporter/lib/supporterPause'

export type ManageSubscriptionSource = 'paywall' | 'settings'
export type StoreIntent = 'cancel' | 'pause'

export const storePlatform: StorePlatform =
  Platform.OS === 'android' ? 'android' : 'ios'

const APP_STORE_SUBSCRIPTIONS_URL =
  'https://apps.apple.com/account/subscriptions'
const PLAY_SUBSCRIPTIONS_URL =
  'https://play.google.com/store/account/subscriptions'
const PRODUCTION_PACKAGE = 'com.leviwilkerson.jwtime'

class PauseOfferUnavailableError extends Error {
  code = 'offer_unavailable'
}

/** Errors a user can hit without anything being broken on our side. */
const EXPECTED_PAUSE_ERRORS = new Set<string>([
  'offer_unavailable',
  PURCHASES_ERROR_CODE.INELIGIBLE_ERROR,
  PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR,
  PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR,
])

const usePauseRecord = () => ({
  startedAt: usePreferences((s) => s.supporterPauseStartedAt),
  resumesAt: usePreferences((s) => s.supporterPauseResumesAt),
})

const statusLabel = (state: ManageSubscriptionState): string | null => {
  switch (state.kind) {
    case 'renewing':
      return state.renewsAt
        ? i18n.t('manageSupport_renews', { date: formatDate(state.renewsAt) })
        : null
    case 'ending':
      return state.endsAt
        ? i18n.t('manageSupport_ends', { date: formatDate(state.endsAt) })
        : null
    case 'paused':
      return i18n.t('manageSupport_pausedUntil', {
        date: formatDate(state.resumesAt),
      })
    case 'none':
      return null
  }
}

/**
 * Subscription status for rows and cards. Skips the store-product lookup, so
 * pause options always read as unavailable here.
 */
export const useSubscriptionStatus = () => {
  const { customer } = useCustomer()
  const pause = usePauseRecord()
  const state = manageSubscriptionState({
    customer,
    platform: storePlatform,
    product: null,
    pause,
    now: Date.now(),
  })
  return { state, label: statusLabel(state) }
}

/** Store data and actions behind the Manage Subscription sheet. */
const useManageSubscription = (
  open: boolean,
  source: ManageSubscriptionSource
) => {
  const { customer, setCustomer, revalidate } = useCustomer()
  const pauseRecord = usePauseRecord()
  const productIdentifier =
    manageableSubscription(customer, storePlatform)?.productIdentifier ?? null
  const [lookup, setLookup] = useState<{
    identifier: string
    product: PurchasesStoreProduct | null
  } | null>(null)
  const [pausingMonths, setPausingMonths] = useState<number | null>(null)
  const viewed = useRef(false)

  const productLoaded =
    !productIdentifier || lookup?.identifier === productIdentifier
  const product =
    productIdentifier && lookup?.identifier === productIdentifier
      ? lookup.product
      : null

  useEffect(() => {
    if (!open || !productIdentifier) return
    let current = true
    Purchases.getProducts([baseProductId(productIdentifier)])
      .then((products) => matchStoreProduct(products, productIdentifier))
      .catch((error: unknown) => {
        if (!isOfflineError(error)) errorTracking.captureException(error)
        return undefined
      })
      .then((match) => {
        if (current) {
          setLookup({ identifier: productIdentifier, product: match ?? null })
        }
      })
    return () => {
      current = false
    }
  }, [open, productIdentifier])

  const state = manageSubscriptionState({
    customer,
    platform: storePlatform,
    product,
    pause: pauseRecord,
    now: Date.now(),
  })
  const sub = state.kind === 'none' ? null : state.sub
  const billing = billingKind(product?.subscriptionPeriod)
  const eventProperties = {
    source,
    billing,
    store: sub?.store ?? 'none',
  }

  // Once per open, after the product lookup settles so pause availability is
  // final.
  useEffect(() => {
    if (!open) {
      viewed.current = false
      return
    }
    if (viewed.current || !productLoaded) return
    viewed.current = true
    analytics.capture('supporter_manage_viewed', {
      ...eventProperties,
      will_renew: sub?.willRenew ?? false,
      state: state.kind,
      pause_options:
        state.kind === 'renewing' && state.pause.kind === 'offers'
          ? state.pause.offers.length
          : state.kind === 'renewing' && state.pause.kind === 'play'
            ? 1
            : 0,
      pause_unavailable_reason:
        state.kind === 'renewing' && state.pause.kind === 'unavailable'
          ? state.pause.reason
          : null,
    })
  })

  const refresh = async () => {
    try {
      await Purchases.invalidateCustomerInfoCache()
    } catch {
      // Revalidating still fetches; a stale cache only delays the update.
    }
    await revalidate()
  }

  const pause = async (offer: PauseOffer) => {
    if (!product || !sub || pausingMonths !== null) return
    const properties = { ...eventProperties, months: offer.months }
    setPausingMonths(offer.months)
    analytics.capture('supporter_pause_started', properties)
    try {
      const promotionalOffer = await Purchases.getPromotionalOffer(
        product,
        offer.discount
      )
      if (!promotionalOffer) throw new PauseOfferUnavailableError()
      const { customerInfo } = await Purchases.purchaseDiscountedProduct(
        product,
        promotionalOffer
      )
      usePreferences.getState().set({
        supporterPauseStartedAt: Date.now(),
        supporterPauseResumesAt: pauseResumeDate(
          sub.expiresDate,
          offer.months
        ).getTime(),
      })
      setCustomer(customerInfo)
      analytics.capture('supporter_pause_completed', properties)
    } catch (error: unknown) {
      const code = (error as PurchasesError)?.code ?? 'unknown'
      if (code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
        analytics.capture('supporter_pause_cancelled', properties)
        return
      }
      const offline = isOfflineError(error)
      analytics.capture('supporter_pause_failed', {
        ...properties,
        error_code: code,
        offline,
      })
      Alert.alert(
        i18n.t('manageSupport_pauseErrorTitle'),
        i18n.t('manageSupport_pauseErrorMessage')
      )
      if (!offline && !EXPECTED_PAUSE_ERRORS.has(code)) {
        errorTracking.captureException(error)
      }
    } finally {
      setPausingMonths(null)
    }
  }

  /**
   * Opens the store's own subscription management, where cancelling, changing
   * the amount, and Google Play pauses happen.
   */
  const openStore = async (intent: StoreIntent) => {
    analytics.capture('supporter_manage_store_opened', {
      ...eventProperties,
      intent,
    })
    if (storePlatform === 'android') {
      // Play opens outside the app; refresh once the user comes back.
      const listener = AppState.addEventListener('change', (next) => {
        if (next !== 'active') return
        listener.remove()
        void refresh()
      })
      await openURL(
        productIdentifier
          ? playSubscriptionsUrl(
              productIdentifier,
              Application.applicationId ?? PRODUCTION_PACKAGE
            )
          : PLAY_SUBSCRIPTIONS_URL
      )
      return
    }
    try {
      await Purchases.showManageSubscriptions()
    } catch {
      await openURL(customer?.managementURL ?? APP_STORE_SUBSCRIPTIONS_URL)
    }
    await refresh()
  }

  return {
    state,
    product,
    productLoaded,
    pausingMonths,
    pause,
    openStore,
  }
}

export default useManageSubscription
