import { useEffect } from 'react'
import { useFeatureFlag } from '@/lib/featureFlags'
import { startVisitTally } from '@/features/territories/stores/territoryVisits'
import { territoryPrivacy } from '@/app/territories/territoriesService'

export default function TerritoryVisitTally() {
  const enabled = useFeatureFlag('territories')
  useEffect(
    () =>
      enabled ? startVisitTally({ privacy: territoryPrivacy }) : undefined,
    [enabled]
  )
  return null
}
