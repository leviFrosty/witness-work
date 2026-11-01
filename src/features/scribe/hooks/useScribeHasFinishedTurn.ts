import { useScribeConversations } from '@/features/scribe/stores/conversations'

export function useScribeHasFinishedTurn(): boolean {
  return useScribeConversations((state) => state.hasFinishedTurn)
}
