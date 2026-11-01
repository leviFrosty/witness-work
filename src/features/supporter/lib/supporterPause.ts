import moment from 'moment'
import type {
  CustomerInfo,
  PurchasesStoreProduct,
  PurchasesStoreProductDiscount,
  PurchasesSubscriptionInfo,
} from 'react-native-purchases'

export type StorePlatform = 'ios' | 'android'
export type BillingKind = 'monthly' | 'annual' | 'other'
export type PauseMonths = 1 | 3 | 6

export const PAUSE_MONTHS: readonly PauseMonths[] = [1, 3, 6]

export const PAUSE_COOLDOWN_MONTHS = 12

const PAUSE_OFFER_ID = /^supporter_pause_(\d+)m(?:_.+)?$/

const STORE_FOR_PLATFORM = {
  ios: 'APP_STORE',
  android: 'PLAY_STORE',
} as const

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

export const baseProductId = (identifier: string): string =>
  identifier.split(':')[0]

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

export const pauseResumeDate = (
  expiresDate: string | null,
  months: number,
  now: number = Date.now()
): Date =>
  moment
    .utc(expiresDate ?? now)
    .add(months, 'months')
    .toDate()

export const playSubscriptionsUrl = (
  productIdentifier: string,
  packageName: string
): string =>
  `https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(
    baseProductId(productIdentifier)
  )}&package=${encodeURIComponent(packageName)}`

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

      availableAgainAt?: Date
    }

export type ManageSubscriptionState =
  | { kind: 'none' }
  | { kind: 'ending'; sub: PurchasesSubscriptionInfo; endsAt: Date | null }
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
