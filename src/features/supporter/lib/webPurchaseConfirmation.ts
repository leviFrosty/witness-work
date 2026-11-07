import type { CustomerInfo } from 'react-native-purchases'
import type { PurchaseTier } from '@/lib/purchaseReturn'

export type WebCheckoutRecord = { tier: PurchaseTier; startedAt: number }

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

const TIP_SKEW_MS = 5 * 60_000

const WEB_PRODUCT_PREFIX = 'web_'

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
