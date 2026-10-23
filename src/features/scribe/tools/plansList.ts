import { z } from 'zod/v4'
import { defineReadTool } from '@/features/scribe/tools/types'
import {
  capList,
  day,
  daysBetween,
  parseDay,
} from '@/features/scribe/tools/shared'
import {
  planLine,
  plansOnDay,
  type PlanOnDay,
} from '@/features/scribe/runtime/snapshot'

const MAX_PLANS = 60
const MAX_RANGE_DAYS = 62
/** As long as plans_create allows. */
const TITLE_MAX = 60

export default defineReadTool({
  name: 'plans_list',
  area: 'plans',
  description:
    "List Day Plans (p refs) and Recurring Plan instances (r refs) between two dates, up to 62 days. Use it for questions about plans after the context's two weeks, not to change one: plans_update finds a Plan by onDate. Returns minutes, start time or anytime, category ref, title and the buddies going along.",
  input: z.strictObject({ from: day, to: day }),
  run: ({ from, to }, ctx) => {
    const span = daysBetween(from, to)
    if (span < 0)
      return { ok: false, error: '`from` must be on or before `to`.' }
    if (span >= MAX_RANGE_DAYS)
      return { ok: false, error: 'Ask for at most 62 days of plans at once.' }
    const plans: PlanOnDay[] = []
    for (
      let cursor = parseDay(from);
      span >= 0 && cursor.format('YYYY-MM-DD') <= to;
      cursor.add(1, 'day')
    )
      plans.push(...plansOnDay(ctx.stores, ctx.refs, cursor))
    const { items, truncated } = capList(plans, MAX_PLANS)
    return {
      ok: true,
      trust: 'app',
      data: {
        plans: items.map((plan) =>
          planLine(ctx.stores, ctx.refs, plan, TITLE_MAX)
        ),
        truncated,
      },
    }
  },
})
