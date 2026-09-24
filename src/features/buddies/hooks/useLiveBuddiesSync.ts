import { useEffect } from 'react'
import { AppState } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { logger } from '@/lib/logger'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/** Someone may accept or confirm any moment; pushes can be off or delayed. */
const WAITING_POLL_MS = 15 * 1000

const syncQuietly = () =>
  void buddiesEngine
    .sync()
    .catch((error) => logger.warn('[buddies] live sync', error))

/**
 * Keeps the visible Buddies list current: syncs when the screen gains focus or
 * the app returns to the foreground, and polls while an invite or request is
 * waiting on the other person. Does nothing before Buddies has started.
 */
export default function useLiveBuddiesSync() {
  const focused = useIsFocused()
  const hasInbox = useBuddies((state) => state.registeredInboxId !== null)
  const waiting = useBuddies(
    (state) =>
      state.outgoingInvites.length > 0 ||
      state.incomingClaims.length > 0 ||
      state.buddies.some((buddy) => buddy.status === 'awaitingConfirm')
  )
  const live = focused && hasInbox

  useEffect(() => {
    if (!live) return
    syncQuietly()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncQuietly()
    })
    return () => subscription.remove()
  }, [live])

  useEffect(() => {
    if (!live || !waiting) return
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') syncQuietly()
    }, WAITING_POLL_MS)
    return () => clearInterval(timer)
  }, [live, waiting])
}
