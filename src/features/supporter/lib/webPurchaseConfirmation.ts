import type { CustomerInfo } from 'react-native-purchases'
import type { PurchaseTier } from '@/lib/purchaseReturn'

/**
 * What Buy keeps on the device while checkout is open, so the return page can
 * tell a new Tip from an old one. Only the tier and the time; never an id.
 */
export type WebCheckoutRecord = { tier: PurchaseTier; startedAt: number }

/** A stored record, or null; anything but the tier and the time is dropped. */
export const toWebCheckoutRecord = (
  value: unknown
): WebCheckoutRecord | null => {
  if (!value || typeof value !== 'object') return null
  const { tier, startedAt } = value as Record<string, unknown>
  if (tier !== 'supporter' && tier !== 'tip') return null
  if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) return null
  if (startedAt < 0) return null
  return { tier, startedAt }
}

/** Clock skew between this device and RevenueCat that a Tip may carry. */
const TIP_SKEW_MS = 5 * 60_000

const WEB_PRODUCT_PREFIX = 'web_'

/**
 * Whether customer info shows the purchase the return page came back for
 * (docs/web-purchases.md "The return page" step 3):
 *
 * - `supporter` once the User is a Supporter under ADR 0014;
 * - `tip` once a web Tip was bought after checkout opened.
 */
export const confirmWebPurchase = ({
  tier,
  customer,
  checkoutStartedAt,
  isSupporter,
}: {
  tier: PurchaseTier
  customer: CustomerInfo | null
  checkoutStartedAt: number | null
  isSupporter: boolean
}): 'confirmed' | 'pending' => {
  if (tier === 'supporter') return isSupporter ? 'confirmed' : 'pending'
  if (checkoutStartedAt === null) return 'pending'
  const since = checkoutStartedAt - TIP_SKEW_MS
  const tipped = (customer?.nonSubscriptionTransactions ?? []).some(
    (transaction) =>
      transaction.productIdentifier.startsWith(WEB_PRODUCT_PREFIX) &&
      new Date(transaction.purchaseDate).getTime() >= since
  )
  return tipped ? 'confirmed' : 'pending'
}
