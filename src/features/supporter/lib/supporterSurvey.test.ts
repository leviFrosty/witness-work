import { describe, expect, it } from 'vitest'
import type {
  CustomerInfo,
  PurchasesSubscriptionInfo,
} from 'react-native-purchases'
import {
  LAPSE_SURVEY_ID,
  SUPPORTER_SURVEY_ID,
  supporterSurveyId,
} from '@/features/supporter/lib/supporterSurvey'

const now = Date.parse('2026-09-16T12:00:00Z')
const day = 86400000
const date = (daysAgo: number) => new Date(now - daysAgo * day).toISOString()
function customer(
  subscription: Partial<PurchasesSubscriptionInfo> = {},
  activeSince?: string
): CustomerInfo {
  return {
    requestDate: date(0),
    entitlements: {
      active: activeSince
        ? {
            supporter: {
              identifier: 'supporter',
              productIdentifier: 'monthly',
              originalPurchaseDate: activeSince,
            },
          }
        : {},
    },
    activeSubscriptions: activeSince ? ['monthly'] : [],
    subscriptionsByProductIdentifier: {
      monthly: {
        productIdentifier: 'monthly',
        expiresDate: date(1),
        isActive: false,
        refundedAt: null,
        gracePeriodExpiresDate: null,
        periodType: 'NORMAL',
        ...subscription,
      },
    },
  } as unknown as CustomerInfo
}

describe('Supporter survey eligibility', () => {
  it('does not infer a lapse from unknown customer state or gifts/tips', () => {
    expect(supporterSurveyId(null, now)).toBeNull()
    const info = { ...customer(), subscriptionsByProductIdentifier: {} }
    expect(supporterSurveyId(info, now)).toBeNull()
  })
  it('waits 30 days before asking current Supporters', () => {
    expect(supporterSurveyId(customer({}, date(29)), now)).toBeNull()
    expect(supporterSurveyId(customer({}, date(30)), now)).toBe(
      SUPPORTER_SURVEY_ID
    )
  })
  it('keeps canceled-but-paid annual subscriptions in the current audience', () => {
    expect(
      supporterSurveyId(
        customer(
          { isActive: true, willRenew: false, expiresDate: date(-300) },
          date(65)
        ),
        now
      )
    ).toBe(SUPPORTER_SURVEY_ID)
  })
  it('includes recent expirations even without prior app-observed active state', () => {
    expect(supporterSurveyId(customer(), now)).toBe(LAPSE_SURVEY_ID)
    expect(
      supporterSurveyId(customer({ billingIssuesDetectedAt: date(3) }), now)
    ).toBe(LAPSE_SURVEY_ID)
  })
  it('waits for the end of billing grace and confirmation from RevenueCat', () => {
    expect(
      supporterSurveyId(customer({ gracePeriodExpiresDate: date(-1) }), now)
    ).toBeNull()
    const stale = { ...customer(), requestDate: date(2) }
    expect(supporterSurveyId(stale, now)).toBeNull()
    stale.requestDate = 'invalid'
    expect(supporterSurveyId(stale, now)).toBeNull()
  })
  it('does not ask after refunds, free trials, or old expirations', () => {
    for (const sub of [
      { refundedAt: date(1) },
      { periodType: 'TRIAL' },
      { expiresDate: date(30) },
      { expiresDate: 'invalid' },
    ]) {
      expect(
        supporterSurveyId(
          customer(sub as Partial<PurchasesSubscriptionInfo>),
          now
        )
      ).toBeNull()
    }
  })
  it('removes lapse feedback on resubscription, even before new entitlement arrives', () => {
    expect(supporterSurveyId(customer({ isActive: true }), now)).toBeNull()
    expect(
      supporterSurveyId(customer({ isActive: true }, date(0)), now)
    ).toBeNull()
  })
  it('uses the latest subscription instead of asking about an older expired product', () => {
    const info = customer()
    info.subscriptionsByProductIdentifier.annual = {
      ...info.subscriptionsByProductIdentifier.monthly,
      expiresDate: date(0),
      refundedAt: date(0),
    }
    expect(supporterSurveyId(info, now)).toBeNull()
  })
})
