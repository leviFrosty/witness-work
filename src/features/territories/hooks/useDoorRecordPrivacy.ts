import { useEffect } from 'react'
import { useTerritoryPrivacy } from '@/hooks/useTerritoryPrivacy'
import { clearAllDoorRecords } from '@/features/territories/lib/doorRecordPrivacy'

export default function useDoorRecordPrivacy() {
  const privacy = useTerritoryPrivacy()
  useEffect(() => {
    if (privacy) clearAllDoorRecords()
  }, [privacy])
  return privacy
}
