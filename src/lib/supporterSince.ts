import { CustomerInfo, PurchasesEntitlementInfo } from 'react-native-purchases'

export const LIFETIME_SUPPORTER_ENTITLEMENT = 'Lifetime Supporter'

const subscriptionKeys = (entitlement: PurchasesEntitlementInfo): string[] =>
  entitlement.productPlanIdentifier
    ? [
        entitlement.productIdentifier,
        `${entitlement.productIdentifier}:${entitlement.productPlanIdentifier}`,
      ]
    : [entitlement.productIdentifier]

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
