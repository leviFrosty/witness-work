import { MMKV } from 'react-native-mmkv'
import type { PurchasesPackage } from 'react-native-purchases'
import type { AppVariant } from '@/lib/appVariant'
import { returnKeyFor, type PurchaseTier } from '@/lib/purchaseReturn'
import {
  toWebCheckoutRecord,
  type WebCheckoutRecord,
} from '@/features/supporter/lib/webPurchaseConfirmation'
import { checkoutUrl } from '@/features/supporter/lib/webPurchaseLinks'

const offeringOf = (pkg: PurchasesPackage): string =>
  pkg.presentedOfferingContext?.offeringIdentifier ?? pkg.offeringIdentifier

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

const store = (): MMKV => (_store ??= new MMKV({ id: 'web-checkout' }))
const RECORD_KEY = 'record'

export const saveWebCheckoutRecord = (
  tier: PurchaseTier,
  startedAt: number
) => {
  const record: WebCheckoutRecord = { tier, startedAt }
  store().set(RECORD_KEY, JSON.stringify(record))
}

export const readWebCheckoutRecord = (): WebCheckoutRecord | null => {
  const raw = store().getString(RECORD_KEY)
  if (!raw) return null
  try {
    return toWebCheckoutRecord(JSON.parse(raw))
  } catch {
    return null
  }
}

export const clearWebCheckoutRecord = () => store().delete(RECORD_KEY)

export type WebCheckout = {
  region: 'loading' | 'allowed' | 'blocked'

  sells: (offeringIdentifier: string) => boolean

  waitingFor: 'session' | 'settled_id' | null

  canBuy: (pkg: PurchasesPackage) => boolean

  open: (pkg: PurchasesPackage, tier: PurchaseTier) => Promise<boolean>

  signIn: () => void
}
