import { stripPlaceholderFollowUp } from '@/lib/conversations'
import { Visit } from '@/types/visit'

/**
 * Sync-time translation for payloads written before the visit form gained its
 * Follow Up switch. Those builds attached a placeholder follow-up (default
 * date, no reminder, no topic) to every Visit and inferred intent from
 * reminder/topic; current builds only attach `followUp` when the user asked for
 * one, and `isAppointment` trusts its presence.
 *
 * Runs inside `parsePayload`, per payload, before any merge. Only payloads
 * without the `explicitFollowUps` marker are touched, so a date-only follow-up
 * a user deliberately created on a current build survives the round trip.
 * `updatedAt` is left alone: the stale peer holds the same timestamp, so
 * last-writer-wins ties resolve to each side's own copy and nothing flaps.
 *
 * Kept store-free (like `payloadFieldRenames.ts`) so it stays cheap to test.
 */
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
