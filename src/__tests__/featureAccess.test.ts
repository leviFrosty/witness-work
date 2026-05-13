import { describe, it, expect } from 'vitest'
import { evaluateFeatureAccess, type FeatureKey } from '@/lib/featureAccess'

const allFeatures: FeatureKey[] = ['customAccentColor', 'iCloudSync']

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
})
