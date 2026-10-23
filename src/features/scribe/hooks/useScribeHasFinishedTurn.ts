import { useScribeConversations } from '@/features/scribe/stores/conversations'

/** Example lines show until the User's first finished turn. */
export function useScribeHasFinishedTurn(): boolean {
  return useScribeConversations((state) => state.hasFinishedTurn)
}
