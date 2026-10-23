import { z } from 'zod/v4'
import { defineWriteTool } from '@/features/scribe/tools/types'
import { normalizeName } from '@/features/scribe/tools/shared'

export default defineWriteTool({
  name: 'categories_create',
  area: 'time',
  description:
    'Propose a new Category on its own, when the User asks to add one that isn\'t in the context\'s categories, like credit work ("Bethel"). For time or a plan in the same message, send newCategory on time_log or plans_create instead. A way of witnessing (letter writing, cart) is a note, not a new Category. credit: its time counts as Credit Time.',
  input: z.strictObject({
    name: z.string().min(1).max(40),
    credit: z.boolean(),
  }),
  refForLaterCalls: true,
  propose: ({ name, credit }, ctx) => {
    const trimmed = name.trim()
    if (!trimmed) return { ok: false, error: 'name is empty.' }
    const existing = ctx.stores.categories.find(
      (category) => normalizeName(category.name) === normalizeName(trimmed)
    )
    if (existing)
      return {
        ok: false,
        error: `A category named ${existing.name} already exists as ${ctx.refs.issue('k', existing.id)}. Use that ref.`,
      }
    const ref = ctx.draft.pendingCategoryRef(trimmed) ?? ctx.draft.mintRef('nk')
    return {
      ok: true,
      ref,
      effects: [{ kind: 'category.create', ref, name: trimmed, credit }],
    }
  },
})
