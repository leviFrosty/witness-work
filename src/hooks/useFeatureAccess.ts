import { useMemo } from 'react'
import useIsSupporter from '@/hooks/useIsSupporter'
import {
  evaluateFeatureAccess,
  type FeatureAccess,
  type FeatureKey,
} from '@/lib/featureAccess'

/**
 * Per-feature access gate. Use this when you're deciding whether to render or
 * enable a specific feature. For raw subscription state (badges, upgrade CTAs,
 * sync mirroring) keep using `useIsSupporter` — that's a different question.
 */
const useFeatureAccess = (feature: FeatureKey): FeatureAccess => {
  const { isSupporter } = useIsSupporter()
  return useMemo(
    () => evaluateFeatureAccess(feature, { isSupporter }),
    [feature, isSupporter]
  )
}

export default useFeatureAccess
