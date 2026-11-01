import { z } from 'zod/v4'
import { defineReadTool } from '@/features/scribe/tools/types'
import {
  addressLine,
  capList,
  foldText,
  nextFollowUp,
  oneLine,
  visitsFor,
} from '@/features/scribe/tools/shared'
import {
  contactsByRecency,
  localDayKey,
} from '@/features/scribe/runtime/snapshot'

const DEFAULT_LIMIT = 5
const NAME_MAX = 80
const ADDRESS_MAX = 160

const PROTECTED_LIMIT = 3

function score(query: string, name: string, street: string | null): number {
  const folded = foldText(name)
  if (folded === query) return 5
  if (folded.startsWith(query)) return 4
  if (folded.split(' ').some((word) => word.startsWith(query))) return 3
  if (folded.includes(query)) return 2
  if (street && foldText(street).includes(query)) return 1
  return 0
}

export default defineReadTool({
  name: 'contacts_search',
  area: 'contacts',
  description:
    "Find Contacts by name or street when the person isn't in the context's contacts, or to tell apart people with similar names. Accent and case don't matter. Returns refs with each one's address, last visit and next follow-up.",
  input: z.strictObject({
    query: z.string().min(1).max(80),
    limit: z.int().min(1).max(10).nullable(),
  }),
  run: ({ query, limit }, ctx) => {
    const needle = foldText(query)
    if (!needle) return { ok: false, error: 'query is empty.' }
    const ranked = contactsByRecency(ctx.stores)
      .map((contact) => ({
        contact,
        score: ctx.dataProtection
          ? foldText(contact.name).startsWith(needle)
            ? 4
            : 0
          : score(needle, contact.name, contact.address?.line1 ?? null),
      }))
      .filter((match) => match.score > 0)

      .sort((a, b) => b.score - a.score)
    const max = ctx.dataProtection
      ? Math.min(limit ?? DEFAULT_LIMIT, PROTECTED_LIMIT)
      : (limit ?? DEFAULT_LIMIT)
    const { items, truncated } = capList(ranked, max)
    return {
      ok: true,
      trust: 'app',
      data: {
        matches: items.map(({ contact }) => {
          const visits = visitsFor(ctx.stores.visits, contact.id)
          const address = ctx.dataProtection
            ? null
            : addressLine(contact.address)
          const next = nextFollowUp(visits, ctx.today)
          return [
            `${ctx.refs.issue('c', contact.id)} ${oneLine(contact.name || '?', NAME_MAX)}`,
            ...(address ? [`address ${oneLine(address, ADDRESS_MAX)}`] : []),
            ...(visits[0] ? [`last visit ${localDayKey(visits[0].date)}`] : []),
            ...(next ? [`next follow-up ${next.date}`] : []),
          ].join('; ')
        }),
        truncated,
      },
    }
  },
})
