import type { CustomerInfo } from 'react-native-purchases'
import { supporterSinceDate } from '@/lib/supporterSince'

export const SUPPORTER_SURVEY_ID = '01a0ad7e-5095-0000-99f0-c5fdd5692070'
export const LAPSE_SURVEY_ID = '01a0ad7e-6441-0000-1968-9330c879dd5f'
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000

export function supporterSurveyId(
  customer: CustomerInfo | null,
  now = Date.now()
) {
  if (!customer) return null
  const since = supporterSinceDate(customer)
  if (since)
    return now - since.getTime() >= THIRTY_DAYS ? SUPPORTER_SURVEY_ID : null

  const subscriptions = Object.values(
    customer.subscriptionsByProductIdentifier ?? {}
  )
  // Never infer a lapse from a failed request, an active subscription, or a gift.
  if (subscriptions.some((subscription) => subscription.isActive)) return null
  const latest = subscriptions
    .filter((subscription) => subscription.expiresDate)
    .sort((a, b) => Date.parse(b.expiresDate!) - Date.parse(a.expiresDate!))[0]
  if (!latest || latest.refundedAt || latest.periodType === 'TRIAL') return null
  const ended = Math.max(
    Date.parse(latest.expiresDate!),
    latest.gracePeriodExpiresDate
      ? Date.parse(latest.gracePeriodExpiresDate)
      : 0
  )
  // A cached snapshot from before expiration is not confirmation of lost access.
  if (!(Date.parse(customer.requestDate) >= ended)) return null
  return ended <= now && now - ended < THIRTY_DAYS ? LAPSE_SURVEY_ID : null
}
