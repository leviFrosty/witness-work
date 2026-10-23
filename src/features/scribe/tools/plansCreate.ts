import { z } from 'zod/v4'
import { defineWriteTool } from '@/features/scribe/tools/types'
import {
  addDays,
  categoryFor,
  day,
  newCategoryInput,
  optionalRef,
  ref,
  spoken,
} from '@/features/scribe/tools/shared'

const PAST_DAYS = 31
const FUTURE_DAYS = 365

export default defineWriteTool({
  name: 'plans_create',
  area: 'plans',
  description:
    'Propose a new Day Plan: time the User intends to spend in service on a day, even one that already has a Plan; not for time already done. Send anytime true with startMinutes null, or anytime false with startMinutes; newCategory is a new Category the User names. repeats: the User wants it every week or day. withBuddies: buddies going along (not invited; the card says how).',
  input: z.strictObject({
    date: day,
    minutes: z.int().min(15).max(1440),
    startMinutes: z.int().min(0).max(1439).nullable(),
    anytime: z.boolean(),
    categoryRef: optionalRef,
    newCategory: newCategoryInput,
    title: z.string().max(60).nullable(),
    note: z.string().max(500).nullable(),
    dateSpoken: spoken,
    timeSpoken: spoken,
    withBuddies: z.array(ref).max(5).nullable(),
    repeats: z.boolean(),
  }),
  propose: (input, ctx) => {
    if (input.repeats)
      return {
        ok: false,
        error:
          "Recurring Plans can't be made here. Propose nothing for it; tell the User they can make a repeating plan in Schedule, and offer to plan the next date.",
      }
    if (
      input.date < addDays(ctx.today, -PAST_DAYS) ||
      input.date > addDays(ctx.today, FUTURE_DAYS)
    )
      return {
        ok: false,
        error: `Plans can be made from ${addDays(ctx.today, -PAST_DAYS)} to ${addDays(ctx.today, FUTURE_DAYS)}.`,
      }
    if (input.anytime === (input.startMinutes !== null))
      return {
        ok: false,
        error:
          'Send anytime true with startMinutes null, or anytime false with a startMinutes.',
      }
    const category = categoryFor(ctx, input.categoryRef, input.newCategory)
    if (!category.ok) return category
    const buddies: string[] = []
    for (const value of input.withBuddies ?? []) {
      const resolved = ctx.refs.resolve(value)
      if (resolved?.kind !== 'b')
        return {
          ok: false,
          error: `Unknown buddy ref ${value}. Use one from the context's buddies.`,
        }
      if (!buddies.includes(resolved.id)) buddies.push(resolved.id)
    }
    return {
      ok: true,
      ref: category.ref,
      effects: [
        ...category.effects,
        {
          kind: 'plan.create',
          date: input.date,
          minutes: input.minutes,
          startMinutes: input.startMinutes,
          anytime: input.anytime,
          category: category.target,
          title: input.title?.trim() || null,
          note: input.note?.trim() || null,
          spoken: { date: input.dateSpoken, time: input.timeSpoken },
          inviteHint: buddies,
        },
      ],
    }
  },
})
