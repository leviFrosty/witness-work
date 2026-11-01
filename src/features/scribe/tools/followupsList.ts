import { z } from 'zod/v4'
import { defineReadTool } from '@/features/scribe/tools/types'
import {
  addDays,
  capList,
  daysBetween,
  oneLine,
  optionalDay,
} from '@/features/scribe/tools/shared'
import { localDayKey } from '@/features/scribe/runtime/snapshot'

const MAX_FOLLOW_UPS = 30
const NAME_MAX = 80
const DEFAULT_AHEAD_DAYS = 14
const MAX_RANGE_DAYS = 366

export default defineReadTool({
  name: 'followups_list',
  area: 'visits',
  description:
    'List planned Follow-ups (return visits) through to (default 14 days ahead), with every overdue one unless from is in the past. Use it for "who should I visit" or "what\'s overdue". Dismissed ones are left out.',
  input: z.strictObject({ from: optionalDay, to: optionalDay }),
  run: ({ from, to }, ctx) => {
    const end = to ?? addDays(ctx.today, DEFAULT_AHEAD_DAYS)
    if (from && daysBetween(from, end) < 0)
      return { ok: false, error: '`from` must be on or before `to`.' }
    if (from && daysBetween(from, end) >= MAX_RANGE_DAYS)
      return { ok: false, error: 'The range can cover at most 366 days.' }
    const names = new Map(ctx.stores.contacts.map((c) => [c.id, c.name]))
    const followUps = ctx.stores.visits
      .filter((visit) => visit.followUp && !visit.followUp.dismissed)
      .filter((visit) => names.has(visit.contact.id))
      .map((visit) => ({ visit, date: localDayKey(visit.followUp!.date) }))

      .filter(
        ({ date }) =>
          (from === null ||
            date >= from ||
            (from >= ctx.today && date < ctx.today)) &&
          date <= end
      )
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.visit.id.localeCompare(b.visit.id)
      )
    const { items, truncated } = capList(followUps, MAX_FOLLOW_UPS)
    return {
      ok: true,
      trust: 'app',
      data: {
        followUps: items.map(({ visit, date }) => {
          const topic = visit.followUp!.topic
          return `${date} ${ctx.refs.issue('c', visit.contact.id)} ${oneLine(names.get(visit.contact.id) || '?', NAME_MAX)}${date < ctx.today ? ' overdue' : ''}${topic ? `: ${JSON.stringify(oneLine(topic, 120))}` : ''}`
        }),
        truncated,
      },
    }
  },
})
