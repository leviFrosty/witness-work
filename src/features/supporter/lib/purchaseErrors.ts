import { PURCHASES_ERROR_CODE } from 'react-native-purchases'
import { isConnectivityError } from '@/lib/http/networkError'
import type { TranslationKey } from '@/lib/locales'

export type StoreAction = 'purchase' | 'restore'

export type StoreErrorOutcome = {
  /** The user backed out; say nothing. */
  silent: boolean
  /** A bug or an outage worth reporting, not a state the user is in. */
  report: boolean
  title: TranslationKey
  message: TranslationKey
  /** Offer Restore Purchases from the alert. */
  offerRestore: boolean
}

const outcome = (
  title: TranslationKey,
  message: TranslationKey,
  { report = false, offerRestore = false } = {}
): StoreErrorOutcome => ({
  silent: false,
  report,
  title,
  message,
  offerRestore,
})

/**
 * What to tell the user after RevenueCat rejects a purchase or restore. Being
 * offline, Ask to Buy, purchase restrictions and owning it already are states
 * the user is in, not failures, so they aren't reported to error tracking.
 */
export function storeErrorOutcome(
  error: unknown,
  action: StoreAction,
  platform: 'ios' | 'android'
): StoreErrorOutcome {
  const code = (error as { code?: unknown } | null)?.code
  const storeProblem: TranslationKey =
    platform === 'android'
      ? 'storeError_storeProblemAndroid'
      : 'storeError_storeProblem'

  if (code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
    return { ...outcome('error', 'error'), silent: true }
  }
  if (isConnectivityError(error)) {
    return outcome('common_offlineTitle', 'storeError_offline')
  }
  switch (code) {
    case PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR:
      return outcome('storeError_pendingTitle', 'storeError_pending')
    case PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR:
      return outcome('storeError_notAllowedTitle', 'storeError_notAllowed')
    case PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR:
      return action === 'purchase'
        ? outcome(
            'storeError_alreadyPurchasedTitle',
            'storeError_alreadyPurchased',
            {
              offerRestore: true,
            }
          )
        : outcome('error_restoring_account', 'storeError_restoreFailed', {
            report: true,
          })
    case PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR:
      return outcome(
        action === 'purchase'
          ? 'storeError_purchaseFailedTitle'
          : 'error_restoring_account',
        storeProblem,
        { report: true }
      )
  }
  return action === 'purchase'
    ? outcome('storeError_purchaseFailedTitle', 'errorCheckingOut', {
        report: true,
      })
    : outcome('error_restoring_account', 'storeError_restoreFailed', {
        report: true,
      })
}
