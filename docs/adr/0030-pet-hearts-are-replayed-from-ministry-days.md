---
status: accepted
---

# Pet hearts are replayed from ministry days, never stored

## Context

The Pet Companion (`docs/pet-companion.md`) is a small pet on Home that stays
happy while the User keeps going out in the ministry. Its hearts go up on active
days, fade on quiet ones, and can fall asleep or die. The same pet shows on
every device the User syncs (iCloud or Google Drive) and in the iOS widget.

A stored heart count would need a writer. Each device would have to apply the
day's change once, at the right time, while it might be off, offline, or a
week behind on sync, and two devices would race to write the same counter.
Merging by last writer would drop one side's change, and replaying a restore
or import would count days twice.

Like Badges (ADR 0019), the pet must not reward circumstance. A Kingdom
Publisher reports only whether they shared, and many people can't pioneer.

## Decision

1. **Hearts are derived.** `simulateLife` (`src/features/pet/lib/life.ts`)
   replays the pet one day at a time from its adoption day to today, from
   synced records only: active days from Time Entries, Visits and Plan saves
   (`petActiveDays`), plus the wake taps on the pet record. Every device gets
   the same hearts, gold, rainbow day and gift days from the same records.
   A Plan save is the local day in the Plan's `savedOn`, the day the User first
   saved it; later edits keep it. Buddies keeping a linked Plan in step, or
   taking a removed buddy off a Plan, restamps `updatedAt` for sync but never
   writes `savedOn`.
2. **The pet record stores only what the User did to the pet**: species, coat,
   name, adoption day, wake days, kept keepsakes, the room items it has earned,
   and a random gift `seed` set at adoption, merged by id like mileage records. The room is a second record.
   Nothing about hearts is stored. Gift days are drawn from the seed (the
   adoption day for a pet without one), so they differ from pet to pet.
3. **A day counts once, not by size.** One active day is one heart however
   much was done, a 0-minute "shared" checkbox entry counts, and Time
   Rollovers don't. No rule reads minutes, hours, goals or the Publisher role.
   (Amended by ADR 0031: a month whose role reports by month fills hearts by
   the month. Still no rule reads minutes, hours or goals.)
4. **Room items unlock by Service Streak**, each the first time the raw count
   reaches its number (per streak kind, in `UNLOCK_ORDER`). A User with no
   streak to grow (streaks hidden, or a `plans` streak and no Plans) unlocks by
   active months since adoption instead, one per month, for the same reason
   badges count months (ADR 0019). A streak ends, so unlike hearts an earned
   item is stored on the pet record and never locks again. (Amended: only
   hidden streaks switch to months; a `plans` streak with no Plans stays on
   the streak, and the Decorate Room note tells the User to plan.)
5. **The lamp is the Service Streak** (ADR 0003), shown as brightness only; with
   streaks hidden it burns at a fixed level. (Decisions 4 and 5 are superseded
   by ADR 0035: items are bought in the Shop with coins, and the lamp
   follows the hearts. Items already earned under decision 4 stay owned.)

## Consequences

- Deleting or backdating records changes the pet's past, and so today's
  hearts. That's accepted: the pet reflects the records, like the Service
  Streak does.
- Plans count on the day they were first saved. Editing a Plan (its form, an
  occurrence, a buddy invite, or ticking a checklist item in its note) isn't a
  new save: it doesn't count today, and the first day keeps counting. Moving
  `savedOn` on every edit took that day out of the pet's past, so one checklist
  tick could end a year of gold. A Plan saved before `savedOn` existed, or
  added by Buddies, gets it on the User's first edit. Deleting a Plan or one
  occurrence isn't a save.
- Active days are local calendar days, worked out on each device: a Visit's
  instant and the day a Plan was saved fall on the day of the device that
  reads them (Visits) or saved them (Plans). Devices in different time zones,
  or a User who travels, can put a Visit near midnight on different days, and
  so show slightly different hearts until the next active day evens them out.
  Time Entries store a calendar day and count the same everywhere. That's
  accepted: the alternative is storing a time zone with every record.
- The replay is O(days since adoption) and memoized by record identity (a few
  results kept, so Home and the widget don't evict each other); a pet kept for
  ten years is a few thousand steps.
- Wakes and keepsakes live inside the one pet record, but they are taps, not
  settings: the sync merge takes the union of both sides' lists for the same
  companion (same adoption day and seed, newer than its tombstone) and keeps
  last-writer-wins for every other field, so a rename on one device doesn't
  drop a wake made on another. A copy from before a release, or from a separate
  adoption on another device, adds nothing.
- Wakes change the replay, so they are kept: a wake is only dropped once the
  list holds more than 120 and it is more than 400 days before the newest
  (`keptWakes`). A wake needs a sleeping or dead pet, ten or more quiet days
  apart, so a year holds about 40 at most; the cap is reached only after years
  of them, and only wakes that old can shift the replay's distant past (the
  gold count and which gift kind came next). Keepsakes keep the newest 20; only
  the latest gift can be waiting on the rug, so older ones never change the
  pet.
- Earned room items live inside the pet record too and merge as a union, like
  wakes and keepsakes. Ids from a newer build are kept. Raising a streak number
  later doesn't lock an item already earned.
- Changing the rules (decay pace, gold length) changes every pet's history at
  once on update. Treat rule changes like a data migration.
