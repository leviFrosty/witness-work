import { z } from 'zod/v4'
import { defineReadTool } from '@/features/scribe/tools/types'
import {
  capList,
  day,
  daysBetween,
  entryLine,
} from '@/features/scribe/tools/shared'
import { allTimeEntries } from '@/features/scribe/runtime/snapshot'
import { storedDayKey } from '@/lib/normalizeDate'

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
        entries: items.map(({ entry }) => entryLine(ctx, entry)),
        truncated,
      },
    }
  },
})
