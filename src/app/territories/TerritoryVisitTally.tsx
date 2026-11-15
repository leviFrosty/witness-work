import { useEffect } from 'react'
import { startVisitTally } from '@/features/territories/stores/territoryVisits'
import { territoryPrivacy } from '@/app/territories/territoriesService'

export default function TerritoryVisitTally() {
  useEffect(() => startVisitTally({ privacy: territoryPrivacy }), [])
  return null
}
