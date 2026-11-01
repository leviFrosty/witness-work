import { useMemo } from 'react'
import useIsSupporter from '@/hooks/useIsSupporter'
import {
  evaluateFeatureAccess,
  type FeatureAccess,
  type FeatureKey,
} from '@/lib/featureAccess'

const useFeatureAccess = (feature: FeatureKey): FeatureAccess => {
  const { isSupporter } = useIsSupporter()
  return useMemo(
    () => evaluateFeatureAccess(feature, { isSupporter }),
    [feature, isSupporter]
  )
}

export default useFeatureAccess
