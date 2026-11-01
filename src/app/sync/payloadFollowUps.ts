import { stripPlaceholderFollowUp } from '@/lib/conversations'
import { Visit } from '@/types/visit'

export function normalizeLegacyFollowUps(d: Record<string, unknown>): void {
  const store = d.conversationStore as
    | { conversations?: unknown; explicitFollowUps?: unknown }
    | null
    | undefined
  if (!store || typeof store !== 'object') return
  if (store.explicitFollowUps === true) return
  if (!Array.isArray(store.conversations)) return
  store.conversations = (store.conversations as Visit[]).map(
    stripPlaceholderFollowUp
  )
}
