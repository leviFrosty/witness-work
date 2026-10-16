import { getOrCreateAccountId } from '@/lib/account'

/**
 * What ww-api accepts as `revenueCatAppUserId`: 8 to 64 of `A-Z a-z 0-9 _ -`.
 * RevenueCat's anonymous ids (`$RCAnonymousID:…`) never match.
 */
const REVENUECAT_APP_USER_ID = /^[A-Za-z0-9_-]{8,64}$/

/** `id` when ww-api would accept it as `revenueCatAppUserId`, else undefined. */
export const toRevenueCatAppUserId = (
  id: string | null | undefined
): string | undefined =>
  typeof id === 'string' && REVENUECAT_APP_USER_ID.test(id) ? id : undefined

/**
 * The RevenueCat app user id Notes Import sends so ww-api can check Supporter
 * status (ADR 0027 §4): the id `CustomerProvider` logs in to RevenueCat with,
 * ADR 0011's shared account id or this device's install id. Undefined when it
 * can't be read or ww-api wouldn't accept it, which ww-api reads as "not a
 * Supporter".
 *
 * A stopgap: once RevenueCat is linked to the server account, ww-api answers
 * Supporter status from the account and this helper goes away.
 */
export const notesImportRevenueCatAppUserId = (): string | undefined => {
  try {
    return toRevenueCatAppUserId(getOrCreateAccountId())
  } catch {
    return undefined
  }
}
