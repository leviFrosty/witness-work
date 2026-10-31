import type { CustomerInfo } from 'react-native-purchases'
import type { PurchaseTier } from '@/lib/purchaseReturn'
import type { RevenueCatLinkOutcome } from '@/lib/serverAccount/revenueCatLink'
import { confirmWebPurchase } from '@/features/supporter/lib/webPurchaseConfirmation'

/**
 * What the return page found (docs/web-purchases.md "The return page" steps 3
 * and 4).
 */
export type WebPurchaseReturnOutcome =
  /** Customer info shows the purchase. */
  | 'confirmed'
  /** Not yet, after a few tries. Never suggest buying again. */
  | 'pending'
  /** Checkout came back with another customer than this browser's. */
  | 'other_customer'
  /** No account session (or no customer) on this browser. */
  | 'signed_out'
  /**
   * The address named no tier, and customer info shows no purchase. Never
   * claims one.
   */
  | 'not_found'

export type WebPurchaseReturnResult =
  | { outcome: 'confirmed'; tier: PurchaseTier }
  | { outcome: Exclude<WebPurchaseReturnOutcome, 'confirmed'> }

/**
 * How the visitor reached the return page, for analytics: with checkout's id,
 * forwarded from another origin (which drops the id), or neither.
 */
export type WebReturnKind = 'returned' | 'forwarded' | 'direct'

export const webReturnKind = ({
  returnedAppUserId,
  forwarded,
}: {
  returnedAppUserId: string | null
  forwarded: boolean
}): WebReturnKind =>
  returnedAppUserId !== null ? 'returned' : forwarded ? 'forwarded' : 'direct'

/** Waits between tries after the first: about 15 s in all. */
export const RETURN_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000]

export type WebPurchaseReturnDeps = {
  /** The address's `tier`, or null when it named none (or not a real one). */
  tier: PurchaseTier | null
  /**
   * The `app_user_id` the web entry took out of the address, only to compare
   * with this browser's customer. Null for a forwarded return.
   */
  returnedAppUserId: string | null
  /** False when RevenueCat isn't set up in this build. */
  available: boolean
  /** The customer this browser is logged in to RevenueCat as. */
  appUserId: () => Promise<string | null>
  /** Customer info fresh from RevenueCat, never a cached copy. */
  fetchCustomer: () => Promise<CustomerInfo>
  /** Forces the account link (ADR 0029). */
  link: () => Promise<RevenueCatLinkOutcome>
  isSupporter: (customer: CustomerInfo) => boolean
  /** When this device opened checkout, from its record, or null. */
  checkoutStartedAt: number | null
  /** Forgets this device's checkout record, once the purchase is confirmed. */
  clearRecord: () => void
  sleep: (ms: number) => Promise<void>
  delaysMs?: readonly number[]
}

/**
 * Checks a checkout return. It never logs in to RevenueCat, and never with the
 * returned id: it only compares it.
 *
 * A purchase the first check confirms, for this browser's customer (or with no
 * id to compare), is confirmed whatever the account link says. Signed out and
 * another customer apply only otherwise. Without a tier, it confirms only what
 * customer info shows (a Supporter, or a web Tip since checkout opened), and
 * never says a purchase is complete.
 */
export async function checkWebPurchaseReturn({
  tier,
  returnedAppUserId,
  available,
  appUserId,
  fetchCustomer,
  link,
  isSupporter,
  checkoutStartedAt,
  clearRecord,
  sleep,
  delaysMs = RETURN_RETRY_DELAYS_MS,
}: WebPurchaseReturnDeps): Promise<WebPurchaseReturnResult> {
  // Unnamed purchases are never claimed.
  const claim = (
    outcome: 'pending' | 'other_customer' | 'signed_out'
  ): WebPurchaseReturnResult => ({
    outcome: tier === null ? 'not_found' : outcome,
  })
  const confirm = (found: PurchaseTier): WebPurchaseReturnResult => {
    clearRecord()
    return { outcome: 'confirmed', tier: found }
  }

  if (!available) return claim('signed_out')

  /** The tier customer info shows, or null. */
  const found = async (): Promise<PurchaseTier | null> => {
    let customer: CustomerInfo
    try {
      customer = await fetchCustomer()
    } catch {
      // Offline or RevenueCat down: the next try asks again.
      return null
    }
    const supporter = isSupporter(customer)
    const shows = (candidate: PurchaseTier) =>
      confirmWebPurchase({
        tier: candidate,
        customer,
        checkoutStartedAt,
        isSupporter: supporter,
      }) === 'confirmed'
    if (tier !== null) return shows(tier) ? tier : null
    if (shows('supporter')) return 'supporter'
    return shows('tip') ? 'tip' : null
  }

  const first = await found()
  const linked = await link()
  const current = await appUserId().catch(() => null)
  const sameCustomer =
    returnedAppUserId === null || returnedAppUserId === current
  if (first && sameCustomer) return confirm(first)
  if (linked.result === 'no_session' || linked.result === 'no_customer')
    return claim('signed_out')
  if (!sameCustomer) return claim('other_customer')
  for (const delay of delaysMs) {
    await sleep(delay)
    const later = await found()
    if (later) return confirm(later)
  }
  return claim('pending')
}
