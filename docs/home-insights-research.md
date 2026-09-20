# Home Insights Dashboard — Market & User Research

Date: 2026-09-20. Research only; no product decisions or code changes made. Compiled from six parallel investigations: (1) health/wearable insight UX (WHOOP, Eight Sleep, Oura, Garmin, Apple Fitness/Health, Strava, Peloton, Gentler Streak, Rise); (2) CRM / finance / habit / storytelling apps (Clay, Dex, Covve, Monica, Attio, Pipedrive, HubSpot, Copilot Money, Monarch, YNAB, Rocket Money, Duolingo, Streaks, Habitify, Headspace, Todoist, Spotify Wrapped, Strava Year in Sport, Apple Screen Time, Google Photos/Maps, Day One, Reclaim, Rise); (3) App Store reviews for WitnessWork and competitors; (4) GitHub issues, shipped history, PostHog availability, prior planning docs; (5) codebase data inventory; (6) JW ministry domain ideation with jw.org-verified ground truth.

---

## 1. Top five recommendations

Ranked by (user demand × data feasibility today × cultural fit × differentiation).

### 1. People Pipeline triage — the daily "who needs you" card

**What.** A single people-first card at the top of Home that surfaces the one to five contacts who most need action, chosen by rules:

- Good conversation logged, **no follow-up scheduled** (org counsel: return "within a few days").
- Contact **going cold relative to their own cadence** ("You usually see Maria every 2 weeks; it's been 5") — Clay's "Automatic" cadence, computed from median gap between visits.
- **Bible study slipping** ("Ana's study went from weekly to every 16 days") — early warning on the one figure every publisher reports.
- **"Almost there"**: contacts with 2+ conversations and follow-up topics but no study flag.
- Overdue follow-ups (already shipped as Missed Conversations; fold in).

**Actions.** Schedule (prefilled with the contact's usual slot), Snooze, "Mark inactive / don't remind" (Pipedrive/Clay: disable always wins; Duolingo: after 3 ignored nudges, offer to stop).

**Evidence.** RV reminders are the single most-praised WitnessWork feature in reviews ("I haven't missed a RV since this app"). MyTime users asked 4× for callback-day reminders. Field Service Assistant users want study tracking with visit dates. GitHub #171 (open) wants "what leads to a study". Counter-signal to honor: "showing love, not counting numbers" (AU 5★) — this card works identically for checkbox publishers who never log hours.

**Feasibility.** All computable today from `buildConversationIndex` (`src/lib/conversationIndex.ts:53`), `isAppointment` (`src/lib/conversations.ts:78`), `Visit.isBibleStudy`, `Visit.followUp`, `Contact.isFavorite`. No schema change.

**Explore next.** Cadence heuristic (median gap vs fixed 30-day staleness); minimum history before inferring cadence; whether "almost there" needs a user-dismissable label; discreet mode (initials only) for phones passed around in service.

### 2. "When you find people home" — timing intelligence from visit outcomes

**What.** The app already stores a full timestamp on every Visit and a `notAtHome` flag that is written but never read. That unlocks a family no competitor has:

- "You find people home 3× more often on Saturday mornings than weekday afternoons."
- Per-contact: "You reach Carlos at home most on Saturday mornings (3 of 4)." → follow-up date picker defaults to that slot.
- "Not-at-home twice at 5 addresses — try a different time?" → plan an evening return-visit session.
- Weekday × time-of-day heat grid (aggregate only, never individual homes).
- Feed the Assistant so it proposes plans in high-yield slots.

**Evidence.** WHOOP Journal Impacts and Oura Discoveries are the most-loved insight type in wearables ("things you didn't know you wanted to know"). HubSpot's per-contact send-time optimization and Streaks' "time of day you usually complete" are the CRM/habit analogs. Zero competitor advertises this.

**Feasibility.** `Visit.date` keeps time-of-day (`src/stores/conversationStore.ts:29` does not normalize; form uses datetime picker). `Visit.notAtHome` exists (`src/types/visit.ts:31`). Needs sample-size gates (≥20 visits with both outcomes; WHOOP requires ≥5 yes / ≥5 no before showing an Impact). Show "unlocks after N more visits" instead of an empty state.

**Risks / explore.** Depends on users logging not-at-homes; check the `not_at_home` PostHog event rate once the CLI is authenticated. Visit timestamps can be edited post-hoc. Time entries have no time-of-day, so hours-per-hour-of-day is blocked unless `startTimeInMinutes` is added to `TimeEntry` (precedent exists on `DayPlan`).

### 3. Pace that explains itself, plus Away mode and plan follow-through

**What.** Pace is the #1 thing users have ever asked for (9 GitHub issues; JW Service lost a star when it removed its on-track bubble). It is shipped, but the numbers are presented without a "why" or a way to rest. Extend it with:

- **One-word status + reason line** (Garmin Training Status): "Catching up — fewer weekday sessions than usual." Contributors shown Oura-style: hours logged, days left, minutes already planned, your historical pace.
- **"You usually…"** (Apple Health Highlights): "You usually log time by the 12th; nothing yet this month."
- **Planned-but-not-logged** nudge (GitHub #203 open; #92 comment; #271): "You planned 2 h today — log it, or move it?"
- **Plan follow-through as information, not error** (ADR 0003): "8 of 10 planned sessions happened. Tuesday evenings rarely do — move the recurring plan?"
- **Away mode** (YNAB snooze / Oura Rest Mode / Todoist vacation): illness, travel, convention weekend pause pacing, streaks, and nudges without breaking anything. Convention and CO-visit dates are user-entered, never guessed.
- **Service-year ±** for pioneers: "412/600, ahead by 12 h; 47 h/month finishes it" (#358, JW Service Italian review "-99 ore, -33 ore al mese").

**Evidence.** #90, #113, #135, #184, #223, #224, #250, #358, #391; follow-on bugs #362/#366/#372 show users audit these numbers closely — correctness is the trust boundary. BR 3★ review: "my fear is the same problem occurs in the report."

**Feasibility.** `computeProjectedTotal`, `getScheduleStatusForMonth`, `eligibleRemainingDays`, `offDays`/`meetingDays`, `RecurringPlan.deletedDates`, `DayPlan.source` all exist. Away mode needs a new preference (status + date range).

**Explore.** Copy testing for the "reason" line; whether a paused month should show gray (YNAB) rather than red; hours-mode only vs opted-in publishers.

### 4. Your own history — seasonality, year-over-year, records, calendar-aware planning

**What.** Compare the user only with themselves, across service years:

- "August tends to be your quietest month — want a lighter goal?" / "Last March you logged 20% more (Memorial campaign)."
- Year-over-year chart (600-hour pioneer line vs progress line, #250), month-over-month delta chip, lifetime category mix ("too much cart witnessing, not enough in person" #388).
- Apple-Trends-style 90-day vs 365-day arrows for hours/month, visits/month, studies, new contacts; unlock at 6 months of data; down arrow gets a one-line coaching suggestion.
- All-time records: best month ever, most conversations in a day, longest run of months with ministry.
- Calendar hooks: Memorial campaign start (next Memorial: Mon 22 Mar 2027), March/April auxiliary-pioneer invitation ("30 h in March ≈ 7 h/week; your current pace is 5"), September start-studies campaign, service-year end countdown.

**Evidence.** App Store agent called this "the strongest differentiator gap": JW Service users praise "seeing your patterns after a few years… which months I normally have less service"; Field Service Assistant users complained when yearly consolidation removed year-to-year comparisons; GitHub #196 comment, #250, #388, #450. `docs/month-year-analytics-plan.md` explicitly deferred multi-year trends; `todo.md` lists "advanced annual analytics" as a Supporter perk.

**Feasibility.** `getServiceYearMonthlyBreakdowns`, `getCategoryBreakdownForServiceYear`, `isPersonalBest12mo`, `getEarliestReportDate` exist; all-time best needs a full-history scan. Memorial dates are public; campaign windows should be user-confirmable.

**Explore.** Supporter gating; whether seasonality needs ≥2 service years to show; Memorial-date source (hardcoded table vs user-entered).

### 5. Cadence stack — Monday recap and Service Year Wrapped

**What.** Every top wearable runs a cadence stack: daily highlight → Monday weekly recap → monthly → annual. WitnessWork has the daily (Home) and monthly (report) layers; the weekly and annual are missing.

- **Monday recap card** (Copilot "Spending Update", WHOOP Weekly Performance Assessment, Apple Screen Time): rule-templated paragraph, not LLM prose: "Last week: 6 h 20 m across 4 sessions, 2 return visits, 1 new contact. Best day: Thursday. What changed: Saturday plan skipped." One action: "Plan this week."
- **Typical-range monitor**: weekly minutes, visits, and new contacts each marked Typical/Outlier vs a 12-week band; only speak up when ≥2 are outliers (Apple Vitals rule).
- **Service Year Wrapped** (1 Sept): contacts met, return visits, studies, best month, favorite time of day, longest run of months, "a year ago you met Rosa; she now studies." Already on `todo.md`. Minimum-data threshold (Strava: ≥3 activities); slides with zero data omitted; shareable card carries app branding but **never contact names, addresses, or pins**.

**Evidence.** Reviews: "love the little motivating words. Didn't know I needed that until I now have it"; BR: "monthly graphs and motivational phrases to keep going." No GitHub demand for wrapped/streaks/badges — these are founder-driven bets; validate with a PostHog survey.

**Feasibility.** Weekly aggregates from `TimeEntry`, `Visit`, `Contact.createdAt`; streak helpers exist in `src/features/profile/lib/profileStats.ts` (buried in the profile overlay today).

**Explore.** Archetype framing (Duolingo "Fiery Phoenix" = returned after a break) — check cultural fit; gratitude tone vs scorecard; whether recap is a push notification or Home-only.

---

## 2. Container: how the Home screen should hold these

- A Home that was once a wall of stat tiles (commit 8e88f48) was consolidated into popover cards (23a632b). Don't rebuild the wall. Garmin Connect+ was panned for cards that re-narrate the chart ("intensity minutes were the same as the past four weeks").
- Oura models Today on a news app: **one Daily Highlight**, chosen by priority: due follow-up > goal at risk > anomaly > milestone > correlation. "Why this matters" expands.
- Things/Reminders tiering: **Today** (follow-ups due, planned session) → **This week** → **Worth a look** (insight cards).
- Every insight = headline sentence + supporting stat + one button. Score → contributors → action.
- Mirror new insight fields to widgets via `buildWidgetSnapshot()` (`docs/widgets.md`); users ask to "see my hours without opening the app" (lock-screen widget / Live Activity asks in reviews).
- Gate behind a feature flag (`docs/feature-flags.md`, fail-closed).

## 3. Guardrails (cultural, tonal, privacy)

From jw.org sources (WT Apr 2022 "How to Set and Reach Spiritual Goals"; WT Aug 2020; Gal 6:4; od ch. 8; MWB Nov 2017 on return visits) plus app-design norms:

- Since 1 Nov 2023 congregation publishers report only "shared in the ministry" + number of Bible studies. Hours are foregrounded only for hours-mode roles or opted-in publishers.
- Compare only with the user's own history. No leaderboards, congregation averages, or percentiles (Spotify-style "top 1%" is out).
- Every insight ends in a verb. Frame bad news forward: "Two 90-minute sessions this week would close your goal," never "You haven't been out in 12 days."
- Don't "play elder": no spiritual diagnosis, no scripture as rebuke. State what the data shows.
- Pause is first-class (Away mode). Never show a broken streak in red. Returning after a gap is celebrated, not the gap penalized.
- Sample-size gates before any correlation or anomaly; say what unlocks when.
- Explanations are rule-templated. Eight Sleep's LLM coach was criticized (May 2026) for unsound causal claims.
- Graceful retreat: after repeated ignores, offer to stop reminding (Duolingo).
- Privacy: contacts never consented to being in an app. No names/addresses on lock screen, shareable images, or push text. Aggregate heat maps only. Optional discreet mode (initials).
- Format every duration through `src/lib/minutes.ts` — decimal remaining-to-goal drew a 2★ and 3 other complaints even after the h:m preference shipped.
- Existing tension to decide on: the domain research advises against confetti/badges/tiers, while the app already has confetti, fireworks, achievement tiers, and planned badges. Recommendation: keep celebrations self-referential and quiet, keep contact data off anything shareable.

## 4. Evidence base

### User demand (GitHub, 223 issues; App Store, 91 written reviews / 720 ratings, 4.89 avg)

| Theme                                                                   | Signal                                          | Status                                       |
| ----------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------- |
| Pace / ahead-behind / hrs-per-day                                       | 9 issues, 22 comments; JW Service 29 praises    | Shipped; extend (rec. 3)                     |
| Year-over-year, seasonality, lifetime category mix                      | #196, #250, #388, #450; JW Service, FSA reviews | Not shipped (rec. 4)                         |
| Proactive reminders (planned but not logged; hours-needed notification) | #203 open, #92, #271                            | Not shipped (rec. 3)                         |
| Contact-side insight (what leads to studies)                            | #171 open; FSA, FieldJoy reviews                | Not shipped (rec. 1)                         |
| RV / study reminders                                                    | Most-praised WW feature; MyTime 4 asks          | Shipped; deepen (rec. 1)                     |
| Widgets incl. lock screen                                               | 5 review asks, 6 issues                         | Home widgets shipped; lock screen not        |
| h:m everywhere                                                          | 4 reviews incl. 2★                              | Preference exists; discoverability problem   |
| Motivation / encouraging words                                          | 4 reviews                                       | Shipped (tips, celebrations)                 |
| Streaks, badges, wrapped, study analytics                               | Zero issues, zero reviews                       | Founder bets (todo.md) — validate via survey |

### Competitor table stakes vs rare features

- Table stakes: monthly/yearly goals, timer, RV/BS tracking, Hourglass/NWP/email submit, carry-over minutes, LDC/credit, monthly + yearly totals.
- Common: graphs, widgets, planned-vs-actual projection.
- Rare: multi-year pattern insight (JW Service), overdue heat map (ServicePlanner), non-hours "Shared in Ministry" mode (ServicePlanner), Live Activity (Ministry – Time & Calls), route optimization and "progress toward starting a study" (FieldJoy 2026).
- Market context: JW Service (14k ratings) introduced a paywall Sept 2025 and drew 46 ≤3★ reviews; MyTime is abandoned. Switchers are arriving.

### Data feasibility summary (from codebase inventory)

- Computable today, no schema change: not-at-home rate, visit hour-of-day/weekday × outcome, avg gap between visits, contacts without follow-up, follow-up kept rate, study cadence/trend/new/lapsed, months-in-a-row goal met, service-year projection, credit mix and cap headroom, best month (12-mo exists; all-time needs scan), time since last new contact, plans kept vs skipped (comparison framing only), Assistant accept rate (last 10 only), tenure anniversaries.
- Blocked: hours by hour-of-day (TimeEntry has no start time); report submission timing (only YYYY-MM key stored).
- Computed but never surfaced: `Visit.notAtHome`, `DayPlan.source`, `RecurringPlan.deletedDates`, `assistantHistory`, streaks + contribution graph (profile overlay only).

### Tooling notes

- `asc` CLI works non-interactively (`ASC_BYPASS_KEYCHAIN=1`) for reviews and ratings.
- `posthog-cli` not on PATH and no API key configured locally; once authenticated, `surveys-responses-list`, `query-trends`, `query-retention` can answer NAH logging rate, screen usage, Assistant accept/dismiss.

## 5. Full candidate insight catalog

Merged from all agents. Data column names the powering fields; all are computable today unless marked.

### Return visits & contacts

1. "4 people you had good conversations with have no follow-up scheduled" — Visits without followUp → Schedule (+3 days default).
2. "You usually see Maria every 2 weeks; it's been 5" — per-contact median gap → Schedule / Snooze / Don't remind.
3. "Your median return-visit gap is 11 days" — visit dates → Plan an RV afternoon.
4. "Return visits within 5 days led to a study 3× more often" — gap → isBibleStudy; gate ≥10 RVs → set default reminder to 4 days.
5. "6 contacts haven't been visited in 30+ days" — staleness → Visit / Call / Mark inactive.
6. "It's been 6 weeks since you added someone new" — Contact.createdAt → plan house-to-house / public witnessing.
7. "3 follow-ups have no topic" — followUp.topic → add a question.
8. "Yusuf mentioned his exam last time — it's this week" — dated phrases in own notes → Send text / Visit.
9. "2 of 5 favorites haven't heard from you this month" — isFavorite → Schedule all.
10. "You've had 14 conversations this quarter; 3 turned into follow-ups" — conversion step (avoid the word "conversion") → Review the other 11.
11. "12 contacts have no phone or address" — completeness → Fill in.
12. Contact warmth: Warm / Cooling / Cold (Attio-style recency-weighted decay) → filter Cooling → Plan a route.
13. "3 RVs and a study are near each other Thursday — group them?" — coordinates + follow-up dates → Create route (on-device only).
14. "September: 14 places visited, 3 new areas" — coords/city clustering → Plan a return route.

### Timing & outcomes

15. "You find people home 3× more often Saturday mornings" — Visit.date × notAtHome; gate ≥20 → recurring Saturday plan.
16. "You reach Carlos at home most on Saturday mornings (3 of 4)" — per-contact → follow-up picker default.
17. "Not-at-home twice at 5 addresses — try a different time?" → plan evening RVs.
18. "Saturday mornings are when you meet the most people; Tuesdays are mostly not-at-homes" → Assistant plans high-yield slots.
19. Conversations per hour by weekday — partial (time entries are day-level).

### Bible studies

20. "Studies you kept weekly lasted 4× longer than those with gaps" — cadence vs duration; gate ≥3 studies → weekly recurring plan.
21. "Ana's study slipped from weekly to every 16 days" → Message / Reschedule.
22. "You're conducting 2 studies — 3 people are 'almost there'" — 2+ conversations + topics, no study flag → offer a demonstration.
23. "Your last 3 studies all began in Sept–Oct" — first-study dates → plan more in September.
24. "This will be your 6th month reporting 2 studies" — monthly distinct-study count → note for report.
25. "Most of your studies began after 3–4 conversations; Ana has had 4" — HubSpot stale-vs-own-average → Mark as study.
26. Active studies trend (12 months); new started / lapsed this month.

### Time & goals (hours roles or opted-in)

27. "On pace for 47/50 — two 90-min sessions close it" → add two plans (avoids Off/Meeting days).
28. Status + reason: "Catching up — fewer weekday sessions than usual" (Garmin) → add a weekday plan.
29. Goal readiness score with contributors (Oura bands) → Schedule the gap.
30. "You usually log time by the 12th; nothing yet this month" → Log / Plan.
31. "Service year: 412/600, averaging 51.5/mo — ahead of pace" → adjust remaining targets.
32. "9 sessions this month vs 15 last month — longer, fewer days" → rhythm preference.
33. "Credit hours are 28% of this month (cap X)" → plan field time to balance.
34. "Your best month ever: April 2025, 62 hours" → open that month.
35. "Aux pioneering 30 h in March ≈ 7 h/week; your pace is 5" → preview a March plan; dismissible per year.
36. "Goal missed 3 months running — adjust to 'within reach'?" (WT Apr 2022) → Lower goal / Keep and plan. Highest tonal risk.
37. "You're at 80% of your goal with 12 days left — ahead of your usual pace" → celebrate / raise goal.
38. Suggest a goal when none set, from imported history (Strava) → Set goal.
39. Ministry momentum (Strava fitness/fatigue EWMA: 42-day vs 7-day) — Building / Steady / Coasting.
40. Weekly effort band vs 3-week average (Strava Relative Effort) → add 45 min to stay in range.
41. Charge/drain attribution: "+6 h from Saturdays, −3 h from two missed Tuesday plans" → reschedule.

### Plans & rhythm

42. "You followed through on 8 of 10 planned sessions" — plan date vs logged day keys (information, not completion) → Plan next week.
43. "Tuesday evenings are planned but rarely happen" → move the recurring plan.
44. "No plans this week yet" → copy last week's plans (suppress if all days Off/Meeting).
45. "You've been out Tuesday mornings 6 weeks running — make it recurring?" → create recurring plan.
46. "You planned 2 h today; nothing logged yet" (#203) → log / move.
47. Away mode: travel, illness, convention → pause pacing, streaks, nudges; earned auto-freeze for one missed week.
48. Smart reminder time: default follow-up/plan reminders to when the user usually logs (Duolingo).

### Seasonal & calendar

49. "Memorial campaign starts in ~3 weeks (Memorial: Mon 22 Mar 2027). Last March you logged 20% more" → plan campaign days / consider aux pioneering.
50. "Service year ends 31 Aug — 6 weeks left" → review the year.
51. "CO visit week: last time you added 4 new contacts" — user-entered dates → plan sessions.
52. "Convention weekend ahead — no plans Fri–Sun" → mark Off Days; suppress pace warnings.
53. "August tends to be your quietest month — lighter goal?" → seasonal goal.

### Reflection & encouragement

54. "You've pioneered 3 years this month" — tenureStartDate → write a note to yourself.
55. "You've shared in the ministry 24 months in a row" — fits the checkbox model; never red on break.
56. "This year you spoke with 61 people; 9 became return visits; 2 studies" — gratitude framing → open your year.
57. "A year ago today you met Ana; she now studies weekly" (Day One On This Day) — only positive arcs; contacts can be hidden from memories.
58. "Your notes mention 'prayer' 14 times this year" — opt-in, on-device.
59. Milestone stamps: 50th return visit, 5 conversations in one day, 1 year studying with Ana.
60. "12 consecutive weeks with ministry — your longest run" (Strava Local Legend: consistency not volume); paused weeks don't break it.
61. Monday recap paragraph (rule-templated) → Plan this week.
62. Typical-range monitor: weekly minutes / visits / new contacts Typical vs Outlier; alert only at ≥2 outliers.
63. Service Year Wrapped with min-data threshold, omitted-not-zero slides, branded shareable card without contact data.
64. Year archetype (opt-in): Early Riser, Neighborhood Regular, Deep Diver, returned-after-a-break — check cultural fit before shipping.

## 6. Open questions to explore next

1. Authenticate `posthog-cli` and pull: `not_at_home` event volume (viability of rec. 2), Assistant accept/dismiss rates, screen usage for Progress/Contacts/Map, any survey free text.
2. Run a PostHog popover survey on the founder bets (weekly recap, wrapped, streak-style consistency) since issues show zero organic demand.
3. Decide the Home container: one Daily Highlight + Today / This week / Worth a look tiers vs. the current reorderable element list.
4. Decide whether recs 4 and 5 are Supporter perks (todo.md suggests advanced analytics are).
5. Define the Away-mode preference shape (status + date range) and how it interacts with `offDays`, streaks, and the Assistant.
6. Decide on adding `startTimeInMinutes` to `TimeEntry` for future hours-by-time-of-day insights.
7. Copy-test the highest-risk tiles (goal-within-reach, study slipping, contacts going cold) with a few pioneers and a few checkbox publishers.
