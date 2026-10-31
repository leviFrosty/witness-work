import { MMKV } from 'react-native-mmkv'
import type { PurchasesPackage } from 'react-native-purchases'
import type { AppVariant } from '@/lib/appVariant'
import { returnKeyFor, type PurchaseTier } from '@/lib/purchaseReturn'
import {
  toWebCheckoutRecord,
  type WebCheckoutRecord,
} from '@/features/supporter/lib/webPurchaseConfirmation'
import { checkoutUrl } from '@/features/supporter/lib/webPurchaseLinks'

/**
 * Buy on the web (docs/web-purchases.md "Links"): which prices can open
 * checkout, the checkout URL, and the device-local record the return page
 * reads.
 */

/** The offering a package came from, which its link is keyed by. */
const offeringOf = (pkg: PurchasesPackage): string =>
  pkg.presentedOfferingContext?.offeringIdentifier ?? pkg.offeringIdentifier

/**
 * The checkout URL for `pkg`, or null when Buy isn't available for it: its
 * offering has no link, or the customer isn't one checkout can take (none
 * settled yet, or RevenueCat's anonymous id). Build it only when Buy is
 * pressed, and never write it into the page.
 */
export const webCheckoutUrl = ({
  pkg,
  links,
  appUserId,
  origin,
  variant,
}: {
  pkg: PurchasesPackage
  links: ReadonlyMap<string, string>
  appUserId: string | null
  origin: string
  variant: AppVariant
}): string | null => {
  const link = links.get(offeringOf(pkg))
  if (!link) return null
  return checkoutUrl({
    link,
    appUserId,
    packageId: pkg.identifier,
    returnKey: returnKeyFor({ origin, variant }),
  })
}

let _store: MMKV | null = null
// Device-local (IndexedDB on the web), never synced.
const store = (): MMKV => (_store ??= new MMKV({ id: 'web-checkout' }))
const RECORD_KEY = 'record'

/** Notes that checkout for `tier` opened at `startedAt`. Never an id. */
export const saveWebCheckoutRecord = (
  tier: PurchaseTier,
  startedAt: number
) => {
  const record: WebCheckoutRecord = { tier, startedAt }
  store().set(RECORD_KEY, JSON.stringify(record))
}

/** The last checkout this device opened, or null. */
export const readWebCheckoutRecord = (): WebCheckoutRecord | null => {
  const raw = store().getString(RECORD_KEY)
  if (!raw) return null
  try {
    return toWebCheckoutRecord(JSON.parse(raw))
  } catch {
    return null
  }
}

/** Forgets it, once the return page confirmed the purchase. */
export const clearWebCheckoutRecord = () => store().delete(RECORD_KEY)

/** What the web paywall needs to sell; null on phones (`useWebCheckout`). */
export type WebCheckout = {
  /** Whether this visitor's country gets web prices (`webSalesAllowed`). */
  region: 'loading' | 'allowed' | 'blocked'
  /**
   * Whether an offering has a Web Purchase Link. The web shows no price from an
   * offering without one.
   */
  sells: (offeringIdentifier: string) => boolean
  /**
   * What Buy waits for before it can open checkout for any price: an account
   * session on this browser, then the account's settled RevenueCat id. Null
   * once neither is missing.
   */
  waitingFor: 'session' | 'settled_id' | null
  /** Whether Buy can open checkout for `pkg` now. */
  canBuy: (pkg: PurchasesPackage) => boolean
  /**
   * Notes the checkout on the device and leaves for it in this tab. False when
   * Buy isn't available for `pkg`.
   */
  open: (pkg: PurchasesPackage, tier: PurchaseTier) => Promise<boolean>
}
