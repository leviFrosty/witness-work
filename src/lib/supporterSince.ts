import { CustomerInfo } from 'react-native-purchases'

/**
 * RevenueCat entitlement identifier for a manually-gifted "lifetime" supporter.
 * Granted via promotional entitlement from the RC dashboard — there is no App
 * Store product behind it, so it never appears in `activeSubscriptions`. The
 * dashboard entitlement must be created with this exact identifier.
 */
export const LIFETIME_SUPPORTER_ENTITLEMENT = 'Lifetime Supporter'

/**
 * Earliest qualifying purchase date that makes the user a supporter, or null.
 * Two paths grant supporter status:
 *
 * - An active recurring subscription (monthly/annual) — verified by checking that
 *   the entitlement's product is in `activeSubscriptions`. This filter is what
 *   prevents one-time tip products (which can share an entitlement via
 *   RevenueCat) from granting permanent supporter status.
 * - The `Lifetime Supporter` promotional entitlement — granted manually from the
 *   RC dashboard for one-off gifting. It has no App Store product, so it
 *   bypasses the `activeSubscriptions` check. Revoking it in the dashboard
 *   removes it from `entitlements.active`, which removes supporter status here
 *   on the next customer refresh.
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
    const isActiveSubscription = activeSubscriptionProducts.has(
      entitlement.productIdentifier
    )
    if (!isLifetimeGrant && !isActiveSubscription) continue
    const t = new Date(entitlement.originalPurchaseDate).getTime()
    if (!isNaN(t) && (earliest === null || t < earliest)) earliest = t
  }
  return earliest !== null ? new Date(earliest) : null
}
