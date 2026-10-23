import { z } from 'zod/v4'
import { defineWriteTool } from '@/features/scribe/tools/types'
import {
  categoryFor,
  day,
  newCategoryInput,
  optionalRef,
  spoken,
} from '@/features/scribe/tools/shared'

export default defineWriteTool({
  name: 'time_log',
  area: 'time',
  description:
    'Propose a Time Entry: service time already done, on a day up to today (a day of the month alone, like "the 3rd", is the latest one up to today). Not for future days (plans_create). newCategory: a new Category the User names (a way of witnessing is a note). When the context shows showsTimeEntry false, send minutes 0 to mark that the User shared this month.',
  input: z.strictObject({
    date: day,
    minutes: z.int().min(0).max(1440),
    categoryRef: optionalRef,
    newCategory: newCategoryInput,
    note: z.string().max(500).nullable(),
    dateSpoken: spoken,
  }),
  propose: (input, ctx) => {
    if (input.date > ctx.today)
      return {
        ok: false,
        error: `${input.date} is after today (${ctx.today}). Log time only for days that have passed; use plans_create for future days.`,
      }
    const { showsTimeEntry } = ctx.context.publisher
    if (!showsTimeEntry && input.minutes > 0)
      return {
        ok: false,
        error:
          'This User reports only whether they shared in the ministry. Send minutes 0 to mark the month as shared.',
      }
    if (showsTimeEntry && input.minutes === 0)
      return { ok: false, error: 'Log at least 1 minute.' }
    const category = categoryFor(ctx, input.categoryRef, input.newCategory)
    if (!category.ok) return category
    return {
      ok: true,
      ref: category.ref,
      effects: [
        ...category.effects,
        {
          kind: 'time.create',
          date: input.date,
          minutes: input.minutes,
          category: category.target,
          note: input.note?.trim() || null,
          spoken: { date: input.dateSpoken, time: null },
        },
      ],
    }
  },
})
