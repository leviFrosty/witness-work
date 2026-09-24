import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import type { ReceivedReply } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/**
 * Buddies' answers to one of this User's shares, by inbox id. `key` is a
 * `planShareKey` / `followUpShareKey`; undefined for anything not yet shared.
 */
export default function useShareReplies(
  key: string | undefined
): Record<string, ReceivedReply> | undefined {
  const started = useBuddies((state) => state.registeredInboxId !== null)
  const shareReplies = useBuddies((state) => state.shareReplies)
  // Deriving the id reads the identity seed, so only once Buddies is in use.
  if (!key || !started) return undefined
  return shareReplies[buddiesEngine.shareIdForKey(key)] ?? {}
}
