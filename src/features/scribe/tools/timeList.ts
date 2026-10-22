import { z } from 'zod/v4'
import { defineReadTool } from '@/features/scribe/tools/types'
import { capList, day, daysBetween } from '@/features/scribe/tools/shared'
import { allTimeEntries, categoryRef } from '@/features/scribe/runtime/snapshot'
import { entryMinutes } from '@/lib/entryMinutes'
import { storedDayKey } from '@/lib/normalizeDate'
import { hasNote } from '@/lib/richText/notes'
import { isLdcEntry } from '@/lib/serviceReportCategory'

const MAX_ENTRIES = 60
const MAX_RANGE_DAYS = 31

export default defineReadTool({
  name: 'time_list',
  area: 'time',
  description:
    'List individual Time Entries between two dates, up to 31 days, oldest first. Use it to answer about specific days, not before logging: logging time never needs a check. Returns refs, minutes, category ref and whether it counts as credit.',
  input: z.strictObject({ from: day, to: day }),
  run: ({ from, to }, ctx) => {
    const span = daysBetween(from, to)
    if (span < 0)
      return { ok: false, error: '`from` must be on or before `to`.' }
    if (span >= MAX_RANGE_DAYS)
      return { ok: false, error: 'Ask for at most 31 days of entries at once.' }
    const entries = allTimeEntries(ctx.stores.serviceReports)
      .filter((entry) => !entry.rollover)
      .map((entry) => ({ entry, date: storedDayKey(entry.date) }))
      .filter(({ date }) => date >= from && date <= to)
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.entry.id.localeCompare(b.entry.id)
      )
    const { items, truncated } = capList(entries, MAX_ENTRIES)
    return {
      ok: true,
      trust: 'app',
      data: {
        entries: items.map(({ entry, date }) => {
          const flags = [
            ...(entry.credit || isLdcEntry(entry) ? ['credit'] : []),
            ...(hasNote(entry) ? ['note'] : []),
          ]
          return `${ctx.refs.issue('t', entry.id)} ${date} ${entryMinutes(entry)}m ${categoryRef(ctx.refs, ctx.stores.categories, entry.categoryId)}${flags.map((flag) => ` ${flag}`).join('')}`
        }),
        truncated,
      },
    }
  },
})
