import { describe, it, expect } from 'vitest'
import {
  evaluateFeatureAccess,
  FEATURES,
  type FeatureKey,
} from '@/lib/featureAccess'

const allFeatures: FeatureKey[] = [
  'customAccentColor',
  'customAppIcon',
  'routePlanning',
  'buddyColor',
]

describe('evaluateFeatureAccess', () => {
  describe('supporter-gated features', () => {
    it.each(allFeatures)('grants access to %s for a supporter', (feature) => {
      const access = evaluateFeatureAccess(feature, { isSupporter: true })
      expect(access).toEqual({ hasAccess: true, reason: 'allowed' })
    })

    it.each(allFeatures)(
      'denies access to %s for a non-supporter with reason "requires-supporter"',
      (feature) => {
        const access = evaluateFeatureAccess(feature, { isSupporter: false })
        expect(access).toEqual({
          hasAccess: false,
          reason: 'requires-supporter',
        })
      }
    )
  })

  // ADR 0040 §1: nothing sync-related is a Supporter benefit.
  it('gates no sync feature', () => {
    expect(Object.keys(FEATURES).sort()).toEqual([...allFeatures].sort())
  })
})
