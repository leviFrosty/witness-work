import { CustomerInfo, PurchasesEntitlementInfo } from 'react-native-purchases'

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
 */
export const supporterSinceDate = (
  customer: CustomerInfo | null
): Date | null => {
  const active = customer?.entitlements?.active
  if (!active) return null
  const activeSubscriptionProducts = new Set(
    customer?.activeSubscriptions ?? []
  )
  let earliest: number | null = null
  for (const entitlement of Object.values(active)) {
    const isLifetimeGrant =
      entitlement.identifier === LIFETIME_SUPPORTER_ENTITLEMENT
    const isActiveSubscription = subscriptionKeys(entitlement).some((key) =>
      activeSubscriptionProducts.has(key)
    )
    if (!isLifetimeGrant && !isActiveSubscription) continue
    const t = new Date(entitlement.originalPurchaseDate).getTime()
    if (!isNaN(t) && (earliest === null || t < earliest)) earliest = t
  }
  return earliest !== null ? new Date(earliest) : null
}
