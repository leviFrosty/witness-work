import { useCallback, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { refreshBackupSlots } from '@/app/account/backup'
import { logger } from '@/lib/logger'
import { useBackupState } from '@/lib/serverAccount/backupStore'

export default function useBackupSlots() {
  const slots = useBackupState((state) => state.slots)
  const mySlotId = useBackupState((state) => state.slotId)
  const [listing, setListing] = useState(false)
  const [failed, setFailed] = useState(false)

  const refresh = useCallback(async () => {
    setListing(true)
    try {
      await refreshBackupSlots()
      setFailed(false)
    } catch (error) {
      logger.warn('[backup] listing slots failed', error)
      setFailed(true)
    } finally {
      setListing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void refresh()
    }, [refresh])
  )

  const sorted = [...(slots ?? [])].sort((a, b) => {
    if (a.slotId === mySlotId) return -1
    if (b.slotId === mySlotId) return 1
    return b.uploadedAt - a.uploadedAt
  })
  return { slots: sorted, mySlotId, listing, failed, refresh }
}
