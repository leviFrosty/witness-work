/**
 * Single seam for feature gating. Callers ask "does this user have access to
 * feature X?" rather than "are they a supporter?" — so the gate rule for any
 * one feature can evolve (becoming free, region-restricted, trialable, etc.)
 * without grepping every call site.
 *
 * The supporter check itself still lives in `useIsSupporter` for non-gating
 * uses (badge dates, upgrade CTAs) — this module only owns the per-feature
 * gating decision. Sync is free for everyone and has no gate (ADR 0040 §1).
 */

export type FeatureKey =
  | 'customAccentColor'
  | 'customAppIcon'
  | 'routePlanning'
  | 'buddyColor'

type GateRule = { gate: 'supporter-only' }

export const FEATURES: Record<FeatureKey, GateRule> = {
  customAccentColor: { gate: 'supporter-only' },
  customAppIcon: { gate: 'supporter-only' },
  // Also enforced server-side: ww-api refuses to optimize for non-Supporters.
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
