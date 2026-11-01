import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import type { ReceivedReply } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

export default function useShareReplies(
  key: string | undefined
): Record<string, ReceivedReply> | undefined {
  const started = useBuddies((state) => state.registeredInboxId !== null)
  const shareReplies = useBuddies((state) => state.shareReplies)

  if (!key || !started) return undefined
  return shareReplies[buddiesEngine.shareIdForKey(key)] ?? {}
}
