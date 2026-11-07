import {
  CustomerInfo,
  PurchasesEntitlementInfo,
  PurchasesSubscriptionInfo,
} from 'react-native-purchases'
import { appVariant, type AppVariant } from '@/lib/appVariant'

export const LIFETIME_SUPPORTER_ENTITLEMENT = 'Lifetime Supporter'

const subscriptionKeys = (entitlement: PurchasesEntitlementInfo): string[] =>
  entitlement.productPlanIdentifier
    ? [
        entitlement.productIdentifier,
        `${entitlement.productIdentifier}:${entitlement.productPlanIdentifier}`,
      ]
    : [entitlement.productIdentifier]

const isWebSandbox = (
  purchase: PurchasesEntitlementInfo | PurchasesSubscriptionInfo
): boolean => purchase.isSandbox === true && purchase.store === 'RC_BILLING'

const toTime = (date: string | null | undefined): number | null => {
  const t = date ? new Date(date).getTime() : NaN
  return isNaN(t) ? null : t
}

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
