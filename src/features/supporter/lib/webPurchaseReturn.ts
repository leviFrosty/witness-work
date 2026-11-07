import type { CustomerInfo } from 'react-native-purchases'
import type { PurchaseTier } from '@/lib/purchaseReturn'
import type { RevenueCatLinkOutcome } from '@/lib/serverAccount/revenueCatLink'
import { confirmWebPurchase } from '@/features/supporter/lib/webPurchaseConfirmation'

export type WebPurchaseReturnOutcome =
  | 'confirmed'
  | 'pending'
  | 'other_customer'
  | 'signed_out'
  | 'not_found'

export type WebPurchaseReturnResult =
  | { outcome: 'confirmed'; tier: PurchaseTier }
  | { outcome: Exclude<WebPurchaseReturnOutcome, 'confirmed'> }

export type WebReturnKind = 'returned' | 'forwarded' | 'direct'

export const webReturnKind = ({
  returnedAppUserId,
  forwarded,
}: {
  returnedAppUserId: string | null
  forwarded: boolean
}): WebReturnKind =>
  returnedAppUserId !== null ? 'returned' : forwarded ? 'forwarded' : 'direct'

export const RETURN_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000]

export type WebPurchaseReturnDeps = {
  tier: PurchaseTier | null

  returnedAppUserId: string | null

  available: boolean

  appUserId: () => Promise<string | null>

  fetchCustomer: () => Promise<CustomerInfo>

  link: () => Promise<RevenueCatLinkOutcome>
  isSupporter: (customer: CustomerInfo) => boolean

  checkoutStartedAt: number | null

  clearRecord: () => void
  sleep: (ms: number) => Promise<void>
  delaysMs?: readonly number[]
}

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

  const found = async (): Promise<PurchaseTier | null> => {
    let customer: CustomerInfo
    try {
      customer = await fetchCustomer()
    } catch {
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
