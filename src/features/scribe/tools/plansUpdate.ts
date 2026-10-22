import { z } from 'zod/v4'
import {
  defineWriteTool,
  type ToolContext,
} from '@/features/scribe/tools/types'
import {
  addDays,
  optionalDay,
  oneLine,
  optionalRef,
  parseDay,
  spoken,
} from '@/features/scribe/tools/shared'
import { clockText, plansOnDay } from '@/features/scribe/runtime/snapshot'
import { storedDayKey } from '@/lib/normalizeDate'
import { DEFAULT_START_TIME_IN_MINUTES } from '@/lib/normalizeDate'
import type { PlanFields } from '@/features/scribe/proposals/model'

const PAST_DAYS = 31
const FUTURE_DAYS = 365
/** Plans an onDate error lists. */
const MAX_LISTED = 6

export default defineWriteTool({
  name: 'plans_update',
  area: 'plans',
  description:
    "Propose a change to one Day Plan the User asks to change: its planRef, or onDate (the day it's on now) if the context doesn't list it; don't list plans first. Null keeps a field; date moves it. For anytime send anytime true; for a time send anytime false and startMinutes. Recurring Plans (r refs) can't be changed: say the User can edit them in Schedule.",
  input: z.strictObject({
    planRef: optionalRef,
    onDate: optionalDay,
    date: optionalDay,
    minutes: z.int().min(15).max(1440).nullable(),
    startMinutes: z.int().min(0).max(1439).nullable(),
    anytime: z.boolean().nullable(),
    title: z.string().max(60).nullable(),
    note: z.string().max(500).nullable(),
    dateSpoken: spoken,
    timeSpoken: spoken,
  }),
  propose: (input, ctx) => {
    if ((input.planRef === null) === (input.onDate === null))
      return {
        ok: false,
        error: 'Send exactly one of planRef or onDate; the other null.',
      }
    const planRef = input.planRef ?? planOnDate(ctx, input.onDate!)
    if (typeof planRef !== 'string') return planRef
    const resolved = ctx.refs.resolve(planRef)
    if (resolved?.kind === 'r')
      return {
        ok: false,
        error:
          "Recurring Plans can't be changed here yet. Tell the User to change it in the app's Schedule.",
      }
    if (!resolved || resolved.kind !== 'p')
      return {
        ok: false,
        error: `Unknown plan ref ${planRef}. Use a p ref from the context or plans_list.`,
      }
    const plan = ctx.stores.dayPlans.find(
      (candidate) => candidate.id === resolved.id
    )
    if (!plan)
      return {
        ok: false,
        error: `Plan ${planRef} no longer exists. List plans again.`,
      }
    if (plan.buddyShare)
      return {
        ok: false,
        error:
          "This plan follows a buddy's invitation, so only that buddy can change it.",
      }
    const current: Required<PlanFields> = {
      date: storedDayKey(plan.date),
      minutes: plan.minutes,
      startMinutes: plan.anytime
        ? null
        : (plan.startTimeInMinutes ?? DEFAULT_START_TIME_IN_MINUTES),
      anytime: !!plan.anytime,
      title: plan.title ?? null,
      note: plan.note ?? null,
    }
    const nextAnytime = input.anytime ?? current.anytime
    if (nextAnytime && input.startMinutes !== null)
      return {
        ok: false,
        error: 'An anytime plan has no start time: send startMinutes null.',
      }
    if (!nextAnytime && current.anytime && input.startMinutes === null)
      return {
        ok: false,
        error: 'Send startMinutes to give this anytime plan a time.',
      }
    if (
      input.date !== null &&
      (input.date < addDays(ctx.today, -PAST_DAYS) ||
        input.date > addDays(ctx.today, FUTURE_DAYS))
    )
      return { ok: false, error: 'That date is too far from today for a plan.' }

    const set: PlanFields = {}
    const before: PlanFields = {}
    const change = <K extends keyof PlanFields>(
      key: K,
      value: PlanFields[K] | undefined
    ) => {
      if (value === undefined || value === current[key]) return
      set[key] = value
      before[key] = current[key]
    }
    change('date', input.date ?? undefined)
    change('minutes', input.minutes ?? undefined)
    change('anytime', input.anytime ?? undefined)
    change(
      'startMinutes',
      nextAnytime
        ? current.anytime
          ? undefined
          : null
        : (input.startMinutes ?? undefined)
    )
    change(
      'title',
      input.title === null ? undefined : input.title.trim() || null
    )
    change('note', input.note === null ? undefined : input.note.trim() || null)
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
          kind: 'plan.update',
          planId: plan.id,
          planDate: current.date,
          planTitle: current.title,
          expectUpdatedAt: plan.updatedAt ?? null,
          set,
          before,
          spoken: { date: input.dateSpoken, time: input.timeSpoken },
        },
      ],
    }
  },
})

/**
 * The Ref of the only Plan on `date` (local `YYYY-MM-DD`); with none or
 * several, an error that lists the day's Plans so the model can pick or ask.
 */
function planOnDate(
  ctx: ToolContext,
  date: string
): string | { ok: false; error: string } {
  if (
    date < addDays(ctx.today, -PAST_DAYS) ||
    date > addDays(ctx.today, FUTURE_DAYS)
  )
    return { ok: false, error: 'That date is too far from today for a plan.' }
  const plans = plansOnDay(ctx.stores, ctx.refs, parseDay(date))
  if (plans.length === 1) return plans[0].ref
  if (!plans.length)
    return {
      ok: false,
      error: `There's no plan on ${date}. Check the day with plans_list, or propose a new plan with plans_create.`,
    }
  const listed = plans
    .slice(0, MAX_LISTED)
    .map((plan) =>
      [
        plan.ref,
        plan.startMinutes === null ? 'anytime' : clockText(plan.startMinutes),
        `${plan.minutes}m`,
        ...(plan.title ? [JSON.stringify(oneLine(plan.title, 40))] : []),
        ...(plan.type === 'recurring' ? ['(recurring)'] : []),
      ].join(' ')
    )
    .join(', ')
  return {
    ok: false,
    error: `${date} has ${plans.length} plans: ${listed}. Send the planRef of the one the User means, or ask which.`,
  }
}
