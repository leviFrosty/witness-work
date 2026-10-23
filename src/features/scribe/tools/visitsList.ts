import { z } from 'zod/v4'
import { defineReadTool } from '@/features/scribe/tools/types'
import {
  addDays,
  capList,
  dayRange,
  oneLine,
  optionalDay,
  optionalRef,
  resolveContact,
} from '@/features/scribe/tools/shared'
import { localDayKey } from '@/features/scribe/runtime/snapshot'
import { hasNote } from '@/lib/richText/notes'
import { isOwnVisit } from '@/lib/conversations'

const DEFAULT_LIMIT = 10
const MAX_RANGE_DAYS = 366
const NAME_MAX = 80
const TOPIC_MAX = 120

export default defineReadTool({
  name: 'visits_list',
  area: 'visits',
  description:
    'List Visits, newest first, for one Contact or everyone, in a date range (default the last 30 days). Use it to answer when someone was visited, not before logging a Visit. Returns refs, outcome and follow-up, not note text.',
  input: z.strictObject({
    contactRef: optionalRef,
    from: optionalDay,
    to: optionalDay,
    limit: z.int().min(1).max(20).nullable(),
  }),
  run: ({ contactRef, from, to, limit }, ctx) => {
    let contactId: string | null = null
    if (contactRef) {
      const resolved = resolveContact(ctx, contactRef, { allowPending: false })
      if (!resolved.ok) return resolved
      contactId = resolved.contact!.id
    }
    const range = dayRange(
      ctx,
      from,
      to,
      { from: addDays(ctx.today, -30), to: ctx.today },
      MAX_RANGE_DAYS
    )
    if (!range.ok) return range
    const names = new Map(ctx.stores.contacts.map((c) => [c.id, c.name]))
    const visits = ctx.stores.visits
      .filter((visit) => contactId === null || visit.contact.id === contactId)
      .filter((visit) => names.has(visit.contact.id))
      .map((visit) => ({ visit, date: localDayKey(visit.date) }))
      .filter(({ date }) => date >= range.from && date <= range.to)
      .sort(
        (a, b) =>
          new Date(b.visit.date).getTime() - new Date(a.visit.date).getTime() ||
          a.visit.id.localeCompare(b.visit.id)
      )
    const { items, truncated } = capList(visits, limit ?? DEFAULT_LIMIT)
    return {
      ok: true,
      trust: 'app',
      data: {
        visits: items.map(({ visit, date }) => {
          const parts = [
            ...(visit.notAtHome ? ['not at home'] : []),
            ...(visit.isBibleStudy ? ['study'] : []),
            ...(hasNote(visit) ? ['note'] : []),
            ...(isOwnVisit(visit) ? [] : ['shared']),
            ...(visit.followUp
              ? [
                  `follow-up ${localDayKey(visit.followUp.date)}${visit.followUp.topic ? ` ${JSON.stringify(oneLine(visit.followUp.topic, TOPIC_MAX))}` : ''}`,
                ]
              : []),
          ]
          return `${ctx.refs.issue('v', visit.id)} ${date} ${ctx.refs.issue('c', visit.contact.id)} ${oneLine(names.get(visit.contact.id) || '?', NAME_MAX)}${parts.length ? `: ${parts.join(', ')}` : ''}`
        }),
        truncated,
      },
    }
  },
})
