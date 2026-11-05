---
status: accepted
---

# Spiritual Routine, and coins at ten times the scale

## Context

The app brings people back when they go out in the ministry, but a
publisher's week has other spiritual goals that keep it steady: daily Bible
reading, personal study, preparing for both meetings, and family worship.
Users asked for a gentle daily reason to open the app between days out, and
the Pet's coins (ADR 0035) are already the reason people come back to it.

Paying those activities coins at the old scale breaks the economy. A User out
once or twice a week earns about 250 coins a year, and about 570 buys the
whole Shop. One coin a day for Bible reading alone is 365 a year; the five
habits at a coin each would come to about 890. And a habit worth less than a
day out needs a fraction of a coin, which reads badly in a pixel-art wallet
("+0.4 Bible reading").

## Decision

1. **Spiritual Routine is its own opt-in feature.** It's free, set up from a
   Home invite or Settings, and works with or without a Pet. Five fixed
   habits ship in v1: Bible reading (daily), personal study (any day, with a
   weekly goal, by default once), midweek and weekend meeting prep (once a
   Monday–Sunday week each, tied to Meeting Days), and family worship or a
   personal worship evening (once a week). No custom habits yet.
2. **Checks are synced records, and everything is replayed from them.** A new
   `routineStore` slice in the sync payload and backups holds
   `routineEntries` (one per habit per day, or per week for weekly habits,
   keyed `habit:day` / `habit:monday`), `readingPlans` (each plan run's
   settings, start and finish) and tombstones for unchecks. Coins, plan
   progress and the heat maps are derived from them at read time, like hearts
   and coins (ADR 0030, 0035). Settings (which habits, Meeting Days, the
   study goal, the worship evening, the reminder) are synced preferences.
3. **Coins are ten times the scale.** Every ministry amount is multiplied by
   10 at once: 10 a day out, 10 a planned day kept, 100 a streak milestone, at
   least 80 for a monthly reporter's month, and items cost 100–360. Routine
   then pays whole coins, each less than a day out: 4 a day of Bible reading,
   4 a day of personal study, 5 for each meeting's prep, 5 a worship evening,
   and 500 for a finished reading plan. A perfect year of Routine at the
   defaults earns about 2,450, close to what a regular year in the ministry
   does, so the ministry stays the center of it. Routine coins count from the
   adoption day, like the rest. Routine never adds hearts: they show how the
   ministry is kept, and a pet that never fades for someone who reads daily
   but stopped going out would stop meaning anything.
4. **Purchases stay in old units.** `PetRecord.purchases[].price` keeps
   storing the old price (the new price ÷ 10), and the wallet reads spending
   ×10. An older build therefore still computes ministry coins and spending
   correctly in its own units; it just doesn't see Routine coins. Each
   device's last-shown coin count (`petSeen`) is migrated ×10 so the update
   doesn't play a huge gain.
5. **The Shop grows a study corner.** A new room part with no starter: it
   stays empty, and isn't drawn, until the first piece is bought. Its 6–8
   pieces sell at the same 100–360 range. Current prices don't change, in new
   units.
6. **Reading plans move by position, never by date.** Read today is the
   default. A plan (the Bible in a year in book order, in order of events, or
   the User's own start book and chapters a day) shows "Day N of M" and
   always offers the next unread portion, however long the User was away; it
   never shows a backlog or a slipping finish date. Switching plans keeps the
   old run for when they come back. Plans are the app's own chapter lists;
   nothing is pulled from jw.org.
7. **No streaks or Badges for Routine in v1**, and one reminder a day, off
   until the User turns it on, that lists only what's still open and skips
   days with nothing left. A finished plan is celebrated once.

## Consequences

- An older build synced with a newer one shows fewer coins (no Routine
  earnings), and if Routine coins were spent on the newer device it may show
  0 until it updates. Accepted rather than forcing an update.
- Coins arrive about twice as fast for someone who keeps a full Routine, so
  the Shop sells out sooner; the study corner adds things to save for. Prices
  live in one table and can be retuned without a migration.
- Analytics' `pet_item_bought` `price` is in new units from this release.
- A Routine Badge collection or Secret items for Routine are deferred
  (todo.md), as are widgets, watch check-offs and Shortcuts.
