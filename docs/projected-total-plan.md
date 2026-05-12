# Projected Total + Assistant — Plan

A shared `ProjectedTotalCard` for the month and year Progress screens that answers **"Will I make it?"**, paired with a recommendation engine (the **Assistant**) that suggests realistic plans to close any gap.

---

## Surface

### `ProjectedTotalCard` (new, shared)

Used on both month and year screens. Renders:

- Header row: `faChartLine` icon + **"Projected Total"** label.
- Hero: large projected hours total + small subtitle.
- Stacked bar:
  - **Logged** (solid green) + **Planned** (hatched green).
  - End of bar = goal. No mid-bar tick. If `logged + planned > goal`, bar reads "full"; the over-amount lives in the status text only.
  - No category sub-segments inside the logged zone. (Categories remain in `MonthReport`.)
- Horizontal legend (`adjustsFontSizeToFit`): `■ Logged · X   ▒ Planned · Y   | Goal · Z`.
- Status sentence below (bold key numbers).
- **Assistant section** (month scope only) when applicable.

**Hides entirely if `goal === 0`.**

#### Placement

- **Month screen**: below `MonthReport` (replacing where `AheadOrBehindOfMonthSchedule` lived).
- **Year screen**: between `MilestoneProgressBar` (+ "adjust milestones" link) and the "ALL MONTHS" list.

#### Projected total definition

```
projected = logged_to_date + sum(future plans from today onward through period end)
```

Credit caps are applied (so a projected total exceeding the LDC cap is truncated to the truthful number).

#### Per-period scope behavior

| Period view        | Renders?                | Assistant?                                         | Status copy tense |
| ------------------ | ----------------------- | -------------------------------------------------- | ----------------- |
| Past month/year    | Yes — historical record | No                                                 | Past tense        |
| Current month/year | Yes                     | Month only                                         | Present tense     |
| Future month       | Yes                     | Yes (logged = 0, projects against scheduled plans) | Future tense      |

### `AssistantSection` (new, inside the card, month scope only)

Renders when state ∈ {`empty`, `reachable_gap`, `unreachable_gap`}. Hides on `logged_over_goal` and `projected_over_goal`.

- `faLightbulb` icon + "Assistant" label.
- Inline headline (e.g., "Plan **3h on 4 days** to reach your goal") + one-line rationale.
- Buttons: **Preview** · **Dismiss**.
- Tap **Preview** → opens `AssistantPreviewSheet`.
- Tap **Dismiss** → records a `dismissed` event for the recommended shape, hides until inputs change (hashed on logged + plans + conversations + excluded weekdays).
- After acceptance, collapses to "✓ You've planned enough" (or equivalent).

### `AssistantPreviewSheet` (new bottom sheet)

- List of proposed days, each row:
  - Date · `+/-` hours stepper (0.5h increments) · drop-day checkbox.
- "Add another day" row → opens date+hours picker.
- Live-recomputed footer: "This will put you at X hrs — goal reached ✓" (or shortfall).
- `Notify me before each plan` toggle (default = user preference).
- Buttons: **Cancel** · **Add to Schedule**.

On **Add to Schedule**:

- Creates one `DayPlan` per row, each tagged `source: 'recommendation'`.
- Records an `accepted` event for the recommended shape.
- Snackbar: "Assistant added N plans · Undo" — undo within ~5s atomically removes all created plans and rewrites the event as `dismissed`.

### `AvailabilityOnboardingSheet` (new bottom sheet)

Triggered just-in-time the first time a recommendation would generate, gated by `hasSeenAvailabilityOnboarding`. Also accessible from Settings.

- Weekday chips (Mon–Sun multi-select).
- Save / Skip.
- On Save/Skip: sets `hasSeenAvailabilityOnboarding: true`. On Save: sets `excludedWeekdays`.

### Calendar treatment for excluded weekdays

`CalendarDay` cells whose weekday ∈ `excludedWeekdays` render with a dimmed background (`bgAlt`-ish). Still tappable — engine respects exclusions, user can override per-day.

### Modifications to existing components

- `MonthSummary` → renamed to **`MonthReport`**.
- `AheadOrBehindOfMonthSchedule` → **deleted**.
- `ProgressYearTab` list rows → future months show **planned hours** with `textAlt` (or similar distinct treatment) instead of "0h".

---

## Status states + copy

Five evaluation states (computed deterministically from inputs). English baselines below; i18n keys ship to ~17 locales.

| State                 | Condition                                                         | Status copy (en)                                                                           | Assistant?                            |
| --------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------- |
| `empty`               | `logged + planned === 0`                                          | "No hours logged or planned yet for this {period}."                                        | Yes (treated as `reachable_gap` math) |
| `logged_over_goal`    | `logged ≥ goal`                                                   | "You're already **{over} hrs** over goal. Planned hours would put you at **{projected}**." | No                                    |
| `projected_over_goal` | `logged < goal AND projected ≥ goal`                              | "On track — planned hours would put you at **{projected}**."                               | No                                    |
| `reachable_gap`       | `projected < goal` AND gap fillable                               | "Planned hours put you at **{projected}** — **{gap} hrs** short of your goal."             | **Yes**                               |
| `unreachable_gap`     | `projected < goal` AND gap exceeds what realistic plans can close | "Planned hours put you at **{projected}**. **{gap} hrs** to goal — a stretch from here."   | **Yes** (best-effort)                 |

**Special case**: when `planned === 0`, suppress the "planned hours would put you at…" half. Use **"No plans scheduled yet."** instead.

**Period word**:

- Month → "this month"
- Year → "this service year"

**Bold treatment**: key actionable numbers bold inline; rest regular weight.

**Past-period tense**: same states evaluated, copy uses past tense ("You ended X hrs over goal" / "You ended X hrs short of goal").

---

## Recommendation engine

### Decision tree (shape selection)

| Condition                                                   | Primary shape                             | Rationale code                 |
| ----------------------------------------------------------- | ----------------------------------------- | ------------------------------ |
| `gap ≤ softCap × 2` (≈ ≤ 8h)                                | `concentrated`                            | `small_gap_one_focused_plan`   |
| `gap ≤ daysRemaining × softCap`                             | `distributed` (≈ softCap per slot)        | `spread_to_sustainable_pace`   |
| `gap ≤ daysRemaining × stretchCap` AND `daysRemaining ≥ 14` | `recurring` (e.g., 2h Tue + Thu)          | `pattern_fits_over_horizon`    |
| `gap > daysRemaining × stretchCap`                          | `distributed` at stretchCap (best-effort) | `best_effort_unreachable_goal` |

Additional rationale codes layered on top of the shape choice when applicable:

- `stretched_for_short_horizon` — when forced above softCap on a short horizon.
- `rest_recommended_then_resume` — when tiredness signal triggered (≥ 12h in prior 3 days → push first proposed day back).
- `layered_on_conversation_days` — when conversation days were preferred slots.

Engine emits at most **one** rationale string (the dominant signal). Headline + rationale = two lines max.

### Conversation-day handling

A "conversation day" is any future date that has a `Conversation.date` (un-deleted) or a `Conversation.followUp.date` where `followUp.dismissed !== true`. Multiple conversations on the same day count once.

**Behavior**: engine prefers conversation days first (fills up to `softCapHoursPerDay`), then spreads remainder across other eligible days. Rationale `layered_on_conversation_days` is emitted when ≥ 1 conversation day received a proposed plan.

### Existing-plan handling

Days with an existing `DayPlan` or `RecurringPlan` instance are **skipped entirely** (engine never adds to an already-planned day, regardless of conversation overlap).

### Excluded weekdays

Days whose weekday ∈ `excludedWeekdays` are **excluded from the eligible pool**. Empty default = no exclusion.

### Constraint parameters

| Param                       | Default             | Notes                                               |
| --------------------------- | ------------------- | --------------------------------------------------- |
| `softMaxHoursPerDay`        | 4                   | Sustainable per-day target.                         |
| `stretchMaxHoursPerDay`     | 6                   | Crunch-time ceiling.                                |
| `absoluteMaxHoursPerDay`    | 8                   | Hard ceiling — never propose more.                  |
| `maxConsecutiveStretchDays` | 3                   | After 3 stretch days, force a soft-cap day or rest. |
| `minRestDayCadence`         | 1 rest per 4 active | Prevents marathon sequences.                        |
| `minChunkHours`             | 1                   | No fractional-hour proposals.                       |
| `tirednessLookbackDays`     | 3                   | Window for fatigue evaluation.                      |
| `tirednessThresholdHours`   | 12                  | ≥ 12h in lookback → push first day back.            |
| `recurringMinHorizonDays`   | 14                  | Below this, `recurring` shape disqualified.         |
| `excludeWeekdays`           | `[]`                | From preferences.                                   |

All overridable via `params?: Partial<EngineParams>` for future tuning.

### Reachability threshold

Engine evaluates `unreachable_gap` when filling the gap would require > 6 hrs/day averaged across remaining days AND would violate either `maxConsecutiveStretchDays` or `minRestDayCadence` constraints. In that case, engine emits the strongest realistic plan and the status copy uses the "stretch" phrasing — never "impossible" or "out of reach."

### Assistant history weighting

Engine emits primary shape per the decision tree, plus up to two fallback shapes that are also viable. If the primary shape's history is negative (`dismissed > accepted` in the last 10 events for that shape AND total events for that shape ≥ 3), and a fallback is viable, engine switches to the highest-scoring fallback.

History never fully suppresses a shape — if it's the only viable option (e.g., small gap → only `concentrated` works), engine emits it regardless of past dismissals.

### Engine signature

```ts
function generateRecommendation(input: EngineInput): Recommendation | null

type EngineInput = {
  year: number
  month: number // 0-11
  today: Date

  monthlyGoalHours: number

  loggedAdjustedMinutes: number // already credit-cap-adjusted by caller
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
  conversations: Conversation[]

  excludedWeekdays: number[]
  assistantHistory: AssistantEvent[]

  params?: Partial<EngineParams>
}

type Recommendation = {
  shape: 'concentrated' | 'distributed' | 'recurring'
  plans: ProposedDayPlan[]
  headline: {
    code: 'shape.concentrated' | 'shape.distributed' | 'shape.recurring'
    values: {
      hours?: number
      days?: number
      day?: string
      weekdayList?: string
      weeks?: number
    }
  }
  rationale: {
    code: ReasonCode
    values: Record<string, number | string>
  }
}

type ReasonCode =
  | 'small_gap_one_focused_plan'
  | 'spread_to_sustainable_pace'
  | 'pattern_fits_over_horizon'
  | 'stretched_for_short_horizon'
  | 'rest_recommended_then_resume'
  | 'layered_on_conversation_days'
  | 'best_effort_unreachable_goal'

type ProposedDayPlan = {
  date: Date
  minutes: number
}
```

**Returns `null`** when no recommendation is appropriate: `logged_over_goal` or `projected_over_goal` or `goal === 0`.

**Purity**: no React, no zustand, no `i18n.t()`. All translation happens in the UI layer.

---

## Reactivity

Derived in components via `useMemo` keyed on:

```
(year, month, today, monthlyGoal, dayPlans, recurringPlans, conversations, excludedWeekdays, assistantHistory)
```

Re-runs naturally on:

- New logged hours.
- Plan add/edit/remove.
- Acceptance of recommendation (after Zustand inserts settle).
- Excluded-weekdays change.
- Screen focus (covers midnight rollover).

Dismissals don't re-run the engine — they just record an event and hide the UI until the input hash changes.

The existing `useTimeCache` store is reused for "monthly planned minutes" totals; engine itself doesn't cache.

---

## Data model changes

### `DayPlan`

Add:

```ts
source?: 'manual' | 'recommendation'  // unset = manual
```

### Preferences (synced)

Add:

```ts
excludedWeekdays: number[]              // 0 = Sunday … 6 = Saturday; default []
hasSeenAvailabilityOnboarding: boolean  // default false
assistantHistory: AssistantEvent[]      // FIFO max 10
hasDismissedRecommendationHash?: string // hash of inputs at dismiss time
```

```ts
type AssistantEvent = {
  shape: 'concentrated' | 'distributed' | 'recurring'
  action: 'accepted' | 'dismissed'
  at: number // epoch ms
}
```

### Acceptance and dismissal events

| User action                                                   | Event                                              |
| ------------------------------------------------------------- | -------------------------------------------------- |
| Tap **Dismiss** on card                                       | `{ action: 'dismissed', shape: <recommended> }`    |
| Tap **Preview** → **Add to Schedule** (with or without edits) | `{ action: 'accepted', shape: <recommended> }`     |
| Tap **Preview** → **Cancel**                                  | _No event_                                         |
| Card shown but never engaged                                  | _No event_                                         |
| **Undo** within snackbar window                               | Rewrites the prior `accepted` event to `dismissed` |

---

## i18n keys (en-US baseline)

Replicate to all existing locales. Crowdin handles translation sync.

### Card chrome

- `projectedTotal.header` — "Projected Total"
- `projectedTotal.heroSuffix` — "hrs if all planned hours come through"
- `projectedTotal.legend.logged` · `legend.planned` · `legend.goal`

### Status sentences (one key per state × tense)

- `projectedTotal.status.present.empty | logged_over_goal | projected_over_goal | reachable_gap | unreachable_gap`
- `projectedTotal.status.past.empty | logged_over_goal | unreachable_gap`
- `projectedTotal.status.future.empty | projected_over_goal | reachable_gap | unreachable_gap`
- `projectedTotal.status.noPlansYet` — "No plans scheduled yet."

### Assistant

- `assistant.label` — "Assistant"
- `assistant.headline.concentrated` — "Plan **{{hours}}h** on **{{day}}** to reach your goal"
- `assistant.headline.distributed` — "Plan **{{hours}}h** on **{{days}} days** to reach your goal"
- `assistant.headline.recurring` — "Plan **{{hours}}h** every **{{weekdayList}}** for the next **{{weeks}} weeks**"
- `assistant.rationale.small_gap_one_focused_plan` — "A single focused plan is the fastest path."
- `assistant.rationale.spread_to_sustainable_pace` — "Spread out so no day pushes too hard."
- `assistant.rationale.pattern_fits_over_horizon` — "A weekly rhythm makes the goal feel routine."
- `assistant.rationale.stretched_for_short_horizon` — "A bit more per day — there's not much time left."
- `assistant.rationale.rest_recommended_then_resume` — "Starts after a rest day — you've been pushing lately."
- `assistant.rationale.layered_on_conversation_days` — "Layered on days you'll already be out."
- `assistant.rationale.best_effort_unreachable_goal` — "Closing your full goal is a stretch this {{period}} — here's the strongest finish."
- `assistant.button.preview | dismiss | addToSchedule | cancel | undo`
- `assistant.preview.notifyMe` — "Notify me before each plan"
- `assistant.preview.addAnotherDay`
- `assistant.preview.proposedTotal` — "This will put you at **{{projected}} hrs**"
- `assistant.snackbar.addedPlans` — "Assistant added {{count}} plans"
- `assistant.collapsedAfterAccept` — "✓ You've planned enough"

### Availability onboarding

- `availability.onboarding.title` — "Which days are you never available?"
- `availability.onboarding.body` — supporting copy
- `availability.onboarding.save | skip`
- `availability.weekday.sun | mon | tue | wed | thu | fri | sat`

### Time

- `time.thisMonth` — "this month"
- `time.thisServiceYear` — "this service year"

---

## File organization

New files:

- `src/lib/projectedTotal.ts` — projection math (logged + future planned, credit-cap-adjusted).
- `src/lib/assistantRecommendation.ts` — the recommendation engine.
- `src/components/ProjectedTotalCard.tsx` — the shared card.
- `src/components/AssistantSection.tsx` — the inline Assistant block.
- `src/components/AssistantPreviewSheet.tsx` — the preview bottom sheet.
- `src/components/AvailabilityOnboardingSheet.tsx` — the onboarding bottom sheet.

Modified files:

- `src/components/MonthSummary.tsx` → renamed to `MonthReport.tsx` (move + rename + import updates).
- `src/components/AheadOrBehindOfSchedule.tsx` → delete `AheadOrBehindOfMonthSchedule` export and its usages.
- `src/screens/ProgressScreen/ProgressMonthTab.tsx` → swap in `ProjectedTotalCard`.
- `src/screens/ProgressScreen/ProgressYearTab.tsx` → insert `ProjectedTotalCard` between milestone bar and ALL MONTHS list; show planned hrs on future month rows with `textAlt`.
- `src/components/CalendarDay.tsx` → dim background for excluded-weekday days.
- `src/types/serviceReport.ts` → add `source` field to `DayPlan`.
- `src/stores/preferences.ts` → add new preference fields.
- `src/screens/settings/preferences/PreferencesScreen.tsx` → add availability section.
- `src/locales/{en-US,...}.json` → add new keys.

---

## Visual material

For v1, the `ProjectedTotalCard` matches whatever surface `MonthReport` uses today. The iOS-26 liquid-glass migration is a separate initiative — the card is upgraded as part of that holistic refresh, not ahead of it.

---

## Implementation order (recommended)

1. **Pure engine layer** — `src/lib/projectedTotal.ts` + `src/lib/assistantRecommendation.ts` with unit tests covering the decision tree, fatigue, conversation-day preference, history fallback, and unreachable-gap behavior. No UI dependencies.
2. **Data model** — `DayPlan.source` field, new preference fields, migration if needed.
3. **`ProjectedTotalCard` (no Assistant)** — render the bar, hero, status sentence; wire to both Progress tabs; rename `MonthSummary` → `MonthReport`; remove `AheadOrBehindOfMonthSchedule`.
4. **Year list tweak** — future months show planned hrs in `textAlt`.
5. **`AssistantSection` + `AssistantPreviewSheet`** — wire engine output to UI, accept/dismiss/undo flow, history tracking.
6. **`AvailabilityOnboardingSheet` + `CalendarDay` dim** — onboarding gate, Settings entry, calendar visual treatment.
7. **i18n** — all keys added to `en-US.json` baseline; Crowdin sync.

Each step is independently mergeable.
