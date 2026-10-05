import moment from 'moment'
import type {
  CustomerInfo,
  PurchasesStoreProduct,
  PurchasesStoreProductDiscount,
  PurchasesSubscriptionInfo,
} from 'react-native-purchases'

/**
 * Supporter Pause (ADR 0016): before cancelling, a Supporter can stop paying
 * for a while. On iOS this redeems a free App Store promotional offer, so
 * access continues and billing resumes automatically. On Android it hands off
 * to Google Play's native pause, which also pauses access.
 */

export type StorePlatform = 'ios' | 'android'
export type BillingKind = 'monthly' | 'annual' | 'other'
export type PauseMonths = 1 | 3 | 6

export const PAUSE_MONTHS: readonly PauseMonths[] = [1, 3, 6]
/** One App Store pause per this many months, counted from redemption. */
export const PAUSE_COOLDOWN_MONTHS = 12

/**
 * App Store Connect offer identifiers must be unique across the app, so each
 * product carries `supporter_pause_<n>m_<productId>`; the bare form is also
 * accepted.
 */
const PAUSE_OFFER_ID = /^supporter_pause_(\d+)m(?:_.+)?$/

const STORE_FOR_PLATFORM = {
  ios: 'APP_STORE',
  android: 'PLAY_STORE',
} as const

/** The App Store reports `P1M`/`P1Y`; the paywall only sells those two. */
export const billingKind = (
  subscriptionPeriod: string | null | undefined
): BillingKind => {
  switch (subscriptionPeriod) {
    case 'P1M':
      return 'monthly'
    case 'P1Y':
      return 'annual'
    default:
      return 'other'
  }
}

/** Google Play identifies subscriptions as `productId:basePlanId`. */
export const baseProductId = (identifier: string): string =>
  identifier.split(':')[0]

/**
 * The store product behind a subscription. Prefers an exact identifier match,
 * then falls back to the base product id for Play base-plan identifiers.
 */
export const matchStoreProduct = (
  products: readonly PurchasesStoreProduct[],
  productIdentifier: string
): PurchasesStoreProduct | undefined =>
  products.find((p) => p.identifier === productIdentifier) ??
  products.find(
    (p) => baseProductId(p.identifier) === baseProductId(productIdentifier)
  )

const manageableSubscriptions = (
  customer: CustomerInfo | null,
  platform: StorePlatform
): PurchasesSubscriptionInfo[] =>
  Object.values(customer?.subscriptionsByProductIdentifier ?? {})
    .filter(
      (sub) =>
        sub.isActive &&
        sub.store === STORE_FOR_PLATFORM[platform] &&
        !sub.refundedAt &&
        sub.ownershipType !== 'FAMILY_SHARED'
    )
    .sort((a, b) => {
      if (a.willRenew !== b.willRenew) return a.willRenew ? -1 : 1
      return moment(b.expiresDate).diff(a.expiresDate)
    })

/**
 * The subscription this device can manage: active, bought in this platform's
 * store, and owned by the user. Excludes dashboard grants, refunds, Family
 * Sharing, and the other platform's store.
 */
export const manageableSubscription = (
  customer: CustomerInfo | null,
  platform: StorePlatform
): PurchasesSubscriptionInfo | null =>
  manageableSubscriptions(customer, platform)[0] ?? null

export type PauseOffer = {
  months: PauseMonths
  discount: PurchasesStoreProductDiscount
}

const discountMonths = (
  discount: PurchasesStoreProductDiscount
): number | null => {
  const unitMonths =
    discount.periodUnit === 'MONTH'
      ? 1
      : discount.periodUnit === 'YEAR'
        ? 12
        : null
  if (unitMonths === null) return null
  return (
    unitMonths * discount.periodNumberOfUnits * Math.max(1, discount.cycles)
  )
}

const isPauseMonths = (months: number): months is PauseMonths =>
  (PAUSE_MONTHS as readonly number[]).includes(months)

/**
 * Free pause offers configured on a product, shortest first. An offer is kept
 * only when its identifier, free price and duration agree, so the copy never
 * promises a length the App Store won't grant.
 */
export const pauseOffers = (
  product: PurchasesStoreProduct | null | undefined
): PauseOffer[] => {
  const offers = new Map<PauseMonths, PauseOffer>()
  for (const discount of product?.discounts ?? []) {
    const match = PAUSE_OFFER_ID.exec(discount.identifier)
    if (!match) continue
    const months = Number(match[1])
    if (!isPauseMonths(months) || offers.has(months)) continue
    if (discount.price !== 0 || discountMonths(discount) !== months) continue
    offers.set(months, { months, discount })
  }
  return [...offers.values()].sort((a, b) => a.months - b.months)
}

/**
 * When billing resumes. The free period starts at the next renewal, so it runs
 * from the current expiration for `months`. UTC keeps the result independent of
 * the device time zone.
 */
export const pauseResumeDate = (
  expiresDate: string | null,
  months: number,
  now: number = Date.now()
): Date =>
  moment
    .utc(expiresDate ?? now)
    .add(months, 'months')
    .toDate()

/** Google Play's own page for one subscription, where Pause lives. */
export const playSubscriptionsUrl = (
  productIdentifier: string,
  packageName: string
): string =>
  `https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(
    baseProductId(productIdentifier)
  )}&package=${encodeURIComponent(packageName)}`

/** The last App Store pause, synced so every device honors the cooldown. */
export type PauseRecord = {
  startedAt: number | null
  resumesAt: number | null
}

export type PauseUnavailableReason =
  | 'billing_issue'
  | 'not_normal_period'
  | 'cooldown'
  | 'multiple_subscriptions'
  | 'unsupported_plan'
  | 'no_offers'

export type PauseAvailability =
  | { kind: 'offers'; offers: PauseOffer[] }
  | { kind: 'play' }
  | {
      kind: 'unavailable'
      reason: PauseUnavailableReason
      /** When a cooldown ends. */
      availableAgainAt?: Date
    }

export type ManageSubscriptionState =
  | { kind: 'none' }
  /** Renewal is off; Supporter access continues until `endsAt`. */
  | { kind: 'ending'; sub: PurchasesSubscriptionInfo; endsAt: Date | null }
  /** An App Store pause is scheduled or running. */
  | { kind: 'paused'; sub: PurchasesSubscriptionInfo; resumesAt: Date }
  | {
      kind: 'renewing'
      sub: PurchasesSubscriptionInfo
      renewsAt: Date | null
      pause: PauseAvailability
    }

const toDate = (value: string | null): Date | null =>
  value ? new Date(value) : null

const pauseAvailability = ({
  customer,
  platform,
  sub,
  product,
  pause,
  now,
}: {
  customer: CustomerInfo
  platform: StorePlatform
  sub: PurchasesSubscriptionInfo
  product: PurchasesStoreProduct | null | undefined
  pause: PauseRecord
  now: number
}): PauseAvailability => {
  const unavailable = (reason: PauseUnavailableReason): PauseAvailability => ({
    kind: 'unavailable',
    reason,
  })
  if (sub.billingIssuesDetectedAt) return unavailable('billing_issue')
  if (sub.periodType !== 'NORMAL') return unavailable('not_normal_period')
  const renewing = manageableSubscriptions(customer, platform).filter(
    (s) => s.willRenew
  )
  if (renewing.length > 1) return unavailable('multiple_subscriptions')

  if (platform === 'android') {
    // Google's docs disagree on pausing annual plans, so only monthly plans
    // are promised a pause.
    return billingKind(product?.subscriptionPeriod) === 'monthly'
      ? { kind: 'play' }
      : unavailable('unsupported_plan')
  }

  if (pause.startedAt !== null) {
    const availableAgainAt = moment(pause.startedAt)
      .add(PAUSE_COOLDOWN_MONTHS, 'months')
      .toDate()
    if (availableAgainAt.getTime() > now) {
      return { kind: 'unavailable', reason: 'cooldown', availableAgainAt }
    }
  }
  const offers = pauseOffers(product)
  return offers.length > 0
    ? { kind: 'offers', offers }
    : unavailable('no_offers')
}

/**
 * Everything the Manage Subscription surfaces need to render. `product` may be
 * null while it loads; pause options then read as unavailable.
 */
export const manageSubscriptionState = ({
  customer,
  platform,
  product,
  pause,
  now,
}: {
  customer: CustomerInfo | null
  platform: StorePlatform
  product: PurchasesStoreProduct | null | undefined
  pause: PauseRecord
  now: number
}): ManageSubscriptionState => {
  const sub = manageableSubscription(customer, platform)
  if (!customer || !sub) return { kind: 'none' }
  if (!sub.willRenew) {
    return { kind: 'ending', sub, endsAt: toDate(sub.expiresDate) }
  }
  if (platform === 'ios' && pause.resumesAt !== null && pause.resumesAt > now) {
    return { kind: 'paused', sub, resumesAt: new Date(pause.resumesAt) }
  }
  return {
    kind: 'renewing',
    sub,
    renewsAt: toDate(sub.expiresDate),
    pause: pauseAvailability({ customer, platform, sub, product, pause, now }),
  }
}
