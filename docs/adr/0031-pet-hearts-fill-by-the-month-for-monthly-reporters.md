---
status: accepted
---

# Pet hearts fill by the month for monthly reporters

## Context

ADR 0030 replays the pet's hearts from active days: each adds a heart, and
after 10 quiet days half a heart fades every 3 days. It said no rule reads the
Publisher role, so the pet wouldn't reward circumstance.

A Kingdom Publisher reports only whether they shared each month, and the app
asks them the same way: one "shared in ministry" check a month. Many record
nothing else. Under the daily rule that one active day a month left their pet
at one or two hearts and asleep for much of the month, however faithfully they
went out. The daily rule rewarded logging often, which is circumstance for
them, the very thing ADR 0030 meant to avoid. The Service Streak already
counts months for this role, and Badges count months for the same reason
(ADR 0019).

## Decision

1. **Each month has a hearts pace** from that month's role in Role History
   (`selectHeartsPace`): `monthly` when the role's Service Streak counts
   months (it reports only whether it shared), `daily` otherwise.
2. **At the monthly pace an active day fills all 5 hearts**, a pet that died
   included, and the hearts hold through the end of the next month. Quiet days
   count from then, with the same fading (from quiet day 10, half a heart every
   3 days) and the same end (quiet day 60). One check a month keeps the pet at
   five hearts, and twelve such months turn its hearts gold.
3. **The daily pace is unchanged** for every other role.
4. Still no rule reads minutes, hours or goals: a month counts once, however
   much was done.

## Consequences

- Each month follows its own role, so changing roles changes the pace from
  that month on and never rewrites the months before. A hold that runs into a
  `daily` month still runs to its end.
- On update, Kingdom Publishers' pets replay under the new pace. The monthly
  rule only ever fills more and fades later, so hearts can only go up: a pet
  that faded or died under the daily rule may come back. Rainbow and gold
  moments land on the days they would have happened, not on the update day.
- The widget's timeline reaches `MONTHLY_HOLD_MAX_DAYS` (61) further, so it
  can still show the fading and the end without the app opening.
- Every device works out the pace from the synced Role History, so they agree,
  as ADR 0030 requires.
