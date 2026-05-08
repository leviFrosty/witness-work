import { CustomerInfo } from 'react-native-purchases'

/**
 * Earliest active-subscription purchase date, or null when the user has no
 * active subscription. Only recurring subscriptions (monthly/annual) count;
 * one-time tip purchases never grant supporter status, even if RevenueCat has a
 * lifetime entitlement attached to the tip product.
 */
export const supporterSinceDate = (
  customer: CustomerInfo | null
): Date | null => {
  const active = customer?.entitlements?.active
  if (!active) return null
  const activeSubscriptionProducts = new Set(
    customer?.activeSubscriptions ?? []
  )
  if (activeSubscriptionProducts.size === 0) return null
  let earliest: number | null = null
  for (const entitlement of Object.values(active)) {
    if (!activeSubscriptionProducts.has(entitlement.productIdentifier)) continue
    const t = new Date(entitlement.originalPurchaseDate).getTime()
    if (!isNaN(t) && (earliest === null || t < earliest)) earliest = t
  }
  return earliest ? new Date(earliest) : null
}
