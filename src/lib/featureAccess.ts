export type FeatureKey =
  | 'customAccentColor'
  | 'iCloudSync'
  | 'customAppIcon'
  | 'routePlanning'
  | 'buddyColor'

type GateRule = { gate: 'supporter-only' }

export const FEATURES: Record<FeatureKey, GateRule> = {
  customAccentColor: { gate: 'supporter-only' },
  iCloudSync: { gate: 'supporter-only' },
  customAppIcon: { gate: 'supporter-only' },

  routePlanning: { gate: 'supporter-only' },
  buddyColor: { gate: 'supporter-only' },
}

export type FeatureAccess = {
  hasAccess: boolean
  reason: 'allowed' | 'requires-supporter'
}

export const evaluateFeatureAccess = (
  feature: FeatureKey,
  supporter: { isSupporter: boolean }
): FeatureAccess => {
  const rule = FEATURES[feature]
  switch (rule.gate) {
    case 'supporter-only':
      return supporter.isSupporter
        ? { hasAccess: true, reason: 'allowed' }
        : { hasAccess: false, reason: 'requires-supporter' }
  }
}
