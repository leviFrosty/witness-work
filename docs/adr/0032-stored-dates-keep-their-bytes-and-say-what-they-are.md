---
status: proposed
---

# Stored dates keep their bytes, and their types say what they are

## Context

The app stores dates in four ways:

- **Calendar days anchored at noon UTC.** These are a Time Entry's `date`, a Day Plan's `date`, and a Recurring Plan's `startDate`, `recurrence.endDate`, `deletedDates` and override dates. `normalizeDateForStorage` writes them, and they must be read in UTC through `momentStoredDate`, `storedDayKey` or `storedDateToLocalDate` (`src/lib/normalizeDate.ts`).
- **Local day keys (`YYYY-MM-DD`).** These are a trip's `date`, the fuel price and car setup `effectiveFrom`, a Plan's `savedOn`, and the pet's `adoptedOn`, wakes and keepsakes.
- **Instants.** These are a Visit's `date` and its Follow-up's `date`, notification fire times, a Contact's `createdAt` and `dismissedUntil`, and preferences such as `tenureStartDate`.
- **Epoch milliseconds.** These are `updatedAt`, `deletedAt`, `receivedAt`, and `createdAt` on mileage, Custom Field and Saved View records.

The first and third groups are typed `Date`, but they aren't `Date` objects once the app relaunches:

- Stores persist as JSON and load without a reviver, so after a relaunch each of these fields holds an ISO string.
- Values written in the same session are `Date` objects. A sync merge or a restore turns Plan and Time Entry dates back into `Date` objects, but not Visit or Contact dates. One store can therefore hold both forms at once.
- The code copes by wrapping stored values: roughly 60 `new Date(x.field)` and 50 `moment(x.field)` calls.

The type checker can't catch the mistake that matters. `moment(entry.date)` compiles, and it reads an anchored day in local time. At UTC+12 and beyond, that is the next day. `src/features/onboarding/lib/homeChecklist.ts` does this today, where it happens to be harmless because it only counts distinct days.

Older builds, sync files and backup files all parse these strings, so their bytes can't change. Rewriting a field would also need a new `updatedAt` on every record to reach other devices.

## Decision

1. **The stored bytes don't change.**
   - Calendar days stay anchored ISO strings.
   - Instants stay ISO strings.
   - No migration runs, and no `updatedAt` moves.
   - Sync payloads and backups are unaffected, so `PAYLOAD_VERSION` and `BACKUP_FILE_VERSION` stay put.
2. **Types say what's stored.**
   - Anchored calendar-day fields become `StoredDay`. Instant fields become `StoredInstant`. Both are `Date | string`, which is honest about both forms, so calling `Date` methods on them is a type error.
   - A `StoredDay` is read only through the `normalizeDate` helpers.
   - A `StoredInstant` is read with `new Date()` or `moment()`, because local time is right for an instant.
   - A type-aware lint rule flags `moment()`, `new Date()` and `Date` methods on a `StoredDay`.
3. **Writers produce the stored form.** `normalizeDateForStorage` returns the anchored ISO string instead of a `Date`. Instant writers store `toISOString()`. A record then looks the same in memory whether it was written this session or loaded from disk, and merges and equality checks never depend on which.
4. **New fields don't add a fifth form.**
   - A new calendar day is a `YYYY-MM-DD` key, as mileage, pet and `savedOn` already use.
   - A new instant is epoch milliseconds.
   - No new persisted field is typed `Date`.

The change lands one store at a time: Time Entries and Plans first (the anchored days), then Visits, then Contacts and preferences. Each step is typecheck-driven and keeps the existing tests.

## Consequences

- Wrong local reads of calendar days become compile or lint errors instead of off-by-one-day bugs east of UTC+12.
- Most of the defensive `new Date(...)` and `moment(...)` wrappers go away, or move into the helpers.
- It is a large, mechanical change across a few hundred call sites. There is no user-visible change and no data risk, because nothing on disk or on the wire changes.
- Time Entries and Plans keep a different day form (anchored ISO) from mileage and the pet (`YYYY-MM-DD`). Unifying them would cost more than it saves (see below).

## Alternatives considered

- **Rewrite Time Entry and Plan dates to `YYYY-MM-DD`.** Rejected:
  - Older builds read `date` with `moment()` and `new Date()`, and would take a bare day key as UTC midnight, which is the previous day west of UTC.
  - Every record would need a new `updatedAt` to propagate, which means rewriting the whole dataset through sync.
- **Add a parallel `day` field.** Rejected: it doubles the data and can drift from `date`, which is the problem the `credit` copy on Time Entries already has (ADR 0033).
- **A JSON reviver in `persist`.** Rejected:
  - It has to guess which strings are dates.
  - It doesn't cover the sync, backup and share paths.
  - Anchored days would still need UTC reads, so the type problem stays.
