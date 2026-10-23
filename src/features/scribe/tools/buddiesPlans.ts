import { z } from 'zod/v4'
import { defineReadTool } from '@/features/scribe/tools/types'
import {
  capList,
  day,
  daysBetween,
  optionalRef,
} from '@/features/scribe/tools/shared'
import { buddyName, clip, clockText } from '@/features/scribe/runtime/snapshot'

const MAX_RANGE_DAYS = 56
const MAX_PLANS = 80
const TIMES_OF_DAY = { m: 'morning', a: 'afternoon', e: 'evening' } as const
const NAME_MAX = 40

export default defineReadTool({
  name: 'buddies_plans',
  area: 'buddies',
  description:
    'What buddies plan to do on their own, from what they share, between two dates (up to 56 days): for one buddy ref or all. Use it for "when is Grace going out" or to plan time together. Plans the User shares with a buddy are the User\'s Plans "with" that buddy, not these.',
  input: z.strictObject({ buddyRef: optionalRef, from: day, to: day }),
  run: ({ buddyRef, from, to }, ctx) => {
    const span = daysBetween(from, to)
    if (span < 0)
      return { ok: false, error: '`from` must be on or before `to`.' }
    if (span >= MAX_RANGE_DAYS)
      return { ok: false, error: 'Ask for at most 56 days at once.' }
    let only: string | null = null
    if (buddyRef) {
      const resolved = ctx.refs.resolve(buddyRef)
      if (!resolved || resolved.kind !== 'b')
        return {
          ok: false,
          error: `Unknown buddy ref ${buddyRef}. Use one from the context's buddies, or null for all.`,
        }
      only = resolved.id
    }
    const plans: {
      buddyRef: string
      date: string
      start: number
      line: string
    }[] = []
    const names = new Map<string, string>()
    for (const buddy of ctx.stores.buddies) {
      if (buddy.status !== 'active') continue
      if (only !== null && buddy.inboxId !== only) continue
      const card = ctx.stores.buddyCards[buddy.inboxId]
      if (!card) continue
      const ref = ctx.refs.issue('b', buddy.inboxId)
      for (const cardDay of card.days) {
        if (cardDay.d < from || cardDay.d > to) continue
        for (const plan of cardDay.p) {
          names.set(ref, buddyName(buddy))
          const time =
            typeof plan.s === 'number'
              ? clockText(plan.s)
              : plan.t
                ? TIMES_OF_DAY[plan.t]
                : 'anytime'
          plans.push({
            buddyRef: ref,
            date: cardDay.d,
            start: plan.s ?? 0,
            line: `${ref} ${cardDay.d} ${time}${plan.m ? ` ${plan.m}m` : ''}`,
          })
        }
      }
    }
    plans.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.start - b.start ||
        a.buddyRef.localeCompare(b.buddyRef)
    )
    const { items, truncated } = capList(plans, MAX_PLANS)
    const listed = new Set(items.map((plan) => plan.buddyRef))
    return {
      ok: true,
      trust: 'app',
      data: {
        // Names on their own lines, as in the context's buddies.
        buddies: [...names]
          .filter(([ref]) => listed.has(ref))
          .map(([ref, name]) => `${ref} ${clip(name, NAME_MAX)}`),
        plans: items.map((plan) => plan.line),
        truncated,
      },
    }
  },
})
