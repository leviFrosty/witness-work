import { z } from 'zod/v4'
import { defineWriteTool } from '@/features/scribe/tools/types'
import {
  entryCategory,
  optionalDay,
  optionalRef,
  resolveCategory,
  resolveEntry,
  spoken,
} from '@/features/scribe/tools/shared'
import { entryMinutes } from '@/lib/entryMinutes'
import { storedDayKey } from '@/lib/normalizeDate'
import type {
  CategoryTarget,
  TimeFields,
} from '@/features/scribe/proposals/model'

/** The Time Entry form's limit: 99 hours 59 minutes. */
const MAX_MINUTES = 99 * 60 + 59

const sameCategory = (a: CategoryTarget, b: CategoryTarget): boolean =>
  JSON.stringify(a) === JSON.stringify(b)

export default defineWriteTool({
  name: 'time_update',
  area: 'time',
  description:
    'Propose a change to one Time Entry the User asks to change, by entryRef (from time_list) or onDate (its day). Null keeps a field; categoryRef k0 makes it Standard.',
  input: z.strictObject({
    entryRef: optionalRef,
    onDate: optionalDay,
    date: optionalDay,
    minutes: z.int().min(0).max(MAX_MINUTES).nullable(),
    categoryRef: optionalRef,
    note: z.string().max(500).nullable(),
    dateSpoken: spoken,
  }),
  propose: (input, ctx) => {
    const found = resolveEntry(ctx, input.entryRef, input.onDate)
    if (!found.ok) return found
    const { entry } = found
    if (input.date !== null && input.date > ctx.today)
      return {
        ok: false,
        error: `${input.date} is after today (${ctx.today}). Time can only be on days that have passed.`,
      }
    const { showsTimeEntry } = ctx.context.publisher
    if (input.minutes !== null && !showsTimeEntry)
      return {
        ok: false,
        error:
          'This User reports only whether they shared in the ministry, so the hours stay as they are.',
      }
    if (input.minutes === 0)
      return {
        ok: false,
        error:
          'An entry needs at least 1 minute. To remove it, use time_delete.',
      }
    let category: CategoryTarget | undefined
    if (input.categoryRef !== null) {
      const resolved = resolveCategory(ctx, input.categoryRef)
      if (!resolved.ok) return resolved
      category = resolved.target
    }

    const current: Required<TimeFields> = {
      date: storedDayKey(entry.date),
      minutes: entryMinutes(entry),
      category: entryCategory(entry),
      note: entry.note ?? null,
    }
    const set: TimeFields = {}
    const before: TimeFields = {}
    if (input.date !== null && input.date !== current.date) {
      set.date = input.date
      before.date = current.date
    }
    if (input.minutes !== null && input.minutes !== current.minutes) {
      set.minutes = input.minutes
      before.minutes = current.minutes
    }
    if (category && !sameCategory(category, current.category)) {
      set.category = category
      before.category = current.category
    }
    const note = input.note === null ? undefined : input.note.trim() || null
    if (note !== undefined && note !== current.note) {
      set.note = note
      before.note = current.note
    }
    if (!Object.keys(set).length)
      return {
        ok: false,
        error:
          'Nothing would change. Send the fields to change, or no call at all.',
      }
    return {
      ok: true,
      effects: [
        {
          kind: 'time.update',
          entryId: entry.id,
          entryDate: current.date,
          entryMinutes: current.minutes,
          entryCategory: current.category,
          expectUpdatedAt: entry.updatedAt ?? null,
          set,
          before,
          spoken: { date: input.dateSpoken, time: null },
        },
      ],
    }
  },
})
