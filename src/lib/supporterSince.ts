import {
  CustomerInfo,
  PurchasesEntitlementInfo,
  PurchasesSubscriptionInfo,
} from 'react-native-purchases'
import { appVariant, type AppVariant } from '@/lib/appVariant'

/**
 * RevenueCat entitlement identifier for a manually-gifted "lifetime" supporter.
 * Granted via promotional entitlement from the RC dashboard — there is no store
 * product behind it. The dashboard entitlement must be created with this exact
 * identifier. ww-api's `isSupporter` mirrors this constant.
 */
export const LIFETIME_SUPPORTER_ENTITLEMENT = 'Lifetime Supporter'

/**
 * Keys under which `activeSubscriptions` may list the entitlement's product.
 * Google Play reports active subscriptions as `productId:basePlanId`, while the
 * entitlement carries the bare product id plus `productPlanIdentifier`.
 */
const subscriptionKeys = (entitlement: PurchasesEntitlementInfo): string[] =>
  entitlement.productPlanIdentifier
    ? [
        entitlement.productIdentifier,
        `${entitlement.productIdentifier}:${entitlement.productPlanIdentifier}`,
      ]
    : [entitlement.productIdentifier]

/**
 * A test purchase on the web (RevenueCat Billing with a Stripe sandbox). Only
 * development builds carry the sandbox config, so only they count one.
 */
const isWebSandbox = (
  purchase: PurchasesEntitlementInfo | PurchasesSubscriptionInfo
): boolean => purchase.isSandbox === true && purchase.store === 'RC_BILLING'

const toTime = (date: string | null | undefined): number | null => {
  const t = date ? new Date(date).getTime() : NaN
  return isNaN(t) ? null : t
}

/**
 * When the earliest active subscription that no entitlement names first
 * started, or null. RevenueCat names one product per entitlement, the one
 * ending last, so an ignored web sandbox subscription can hide a real one that
 * unlocks the same entitlement (monthly and annual both unlock `Monthly
 * Donator`). Mirrors `hiddenEnd` in ww-api's `fetchSupporterStatus`, and like
 * it assumes every subscription product unlocks some entitlement.
 */
const hiddenSubscriptionStart = (
  customer: CustomerInfo,
  activeSubscriptionProducts: ReadonlySet<string>
): number | null => {
  const entitlements = Object.values({
    ...customer.entitlements?.all,
    ...customer.entitlements?.active,
  })
  const named = new Set(entitlements.flatMap(subscriptionKeys))
  const subscriptions = customer.subscriptionsByProductIdentifier ?? {}
  let earliest: number | null = null
  for (const key of activeSubscriptionProducts) {
    if (named.has(key)) continue
    // Google Play lists `productId:basePlanId`; RevenueCat keys the bare id.
    const id = Object.hasOwn(subscriptions, key) ? key : key.split(':')[0]
    if (!Object.hasOwn(subscriptions, id)) continue
    const subscription = subscriptions[id]
    if (subscription.isActive !== true || isWebSandbox(subscription)) continue
    const t = toTime(
      subscription.originalPurchaseDate ?? subscription.purchaseDate
    )
    if (t !== null && (earliest === null || t < earliest)) earliest = t
  }
  return earliest
}

/**
 * Earliest qualifying purchase date that makes the user a supporter, or null.
 * Implements the rule in ADR 0014, which ww-api's `isSupporter` also follows.
 * Two paths grant supporter status:
 *
 * - An active subscription (monthly/annual, or a promotional grant from the RC
 *   dashboard) — verified by checking that the entitlement's product is in
 *   `activeSubscriptions`. This filter is what prevents one-time tip products
 *   (which can share an entitlement via RevenueCat) from granting permanent
 *   supporter status.
 * - The `Lifetime Supporter` promotional entitlement — granted manually from the
 *   RC dashboard for one-off gifting, and accepted without the
 *   `activeSubscriptions` check. Revoking it in the dashboard removes it from
 *   `entitlements.active`, which removes supporter status here on the next
 *   customer refresh.
 *
 * A RevenueCat Billing sandbox entitlement never qualifies outside development
 * builds. App Store and Google Play sandbox purchases still do, so TestFlight
 * and Play testing keep working. A skipped sandbox entitlement still qualifies
 * through an active subscription no entitlement names, as on ww-api; its date
 * is when that subscription first started.
 */
export const supporterSinceDate = (
  customer: CustomerInfo | null,
  variant: AppVariant = appVariant
): Date | null => {
  const active = customer?.entitlements?.active
  if (!active) return null
  const activeSubscriptionProducts = new Set(
    customer?.activeSubscriptions ?? []
  )
  let earliest: number | null = null
  for (const entitlement of Object.values(active)) {
    let t: number | null
    if (variant !== 'development' && isWebSandbox(entitlement)) {
      t = hiddenSubscriptionStart(customer, activeSubscriptionProducts)
    } else {
      const isLifetimeGrant =
        entitlement.identifier === LIFETIME_SUPPORTER_ENTITLEMENT
      const isActiveSubscription = subscriptionKeys(entitlement).some((key) =>
        activeSubscriptionProducts.has(key)
      )
      if (!isLifetimeGrant && !isActiveSubscription) continue
      t = toTime(entitlement.originalPurchaseDate)
    }
    if (t !== null && (earliest === null || t < earliest)) earliest = t
  }
  return earliest !== null ? new Date(earliest) : null
}
