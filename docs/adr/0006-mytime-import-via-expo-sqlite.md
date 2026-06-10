# ADR 0006: Read MyTime backups via `expo-sqlite` for the import feature

- **Status:** Accepted
- **Date:** 2026-06-08
- **Related code (planned):** `src/features/mytime-import/lib/readMytimeDb.ts`,
  `src/features/mytime-import/lib/mapMytimeData.ts`,
  `src/features/mytime-import/lib/coreDataDate.ts`,
  `src/features/mytime-import/screens/MytimeImportScreen.tsx`,
  `src/features/onboarding/components/steps/MytimeImport.tsx`

## Context

MyTime (PriddySoftware) is the long-standing iOS field-service tracker many
publishers are migrating away from. Its export — a `.mytimedb` file — is a
**vanity extension on a Core Data SQLite store**: every table is `Z`-prefixed
(`ZCALL`, `ZRETURNVISIT`, `ZTIMEENTRY`, `ZSTATISTICSADJUSTMENT`, `ZUSER`,
`ZTIMETYPE`, …), primary keys are `Z_PK` integers, relationships are integer FK
columns, and **all dates are Core Data reference timestamps** (seconds, with
fractional precision, since `2001-01-01 00:00:00 UTC`).

We want a first-class import so a switching user keeps their contacts, visit
history, and service time. WitnessWork stores its data as JSON in Zustand
stores (`Contact`, `Visit`, `TimeEntry`, `Category`, preferences), not SQL, so
the import has to **read the relational MyTime store, join/denormalize it, and
translate into our types** — discarding MyTime-only data (territories,
publication placements, filters/sorters) that has no equivalent here.

The blocking technical question is **how the app reads a SQLite file at
runtime**. The data is genuinely relational — a faithful import needs joins
(`ZADDITIONALINFORMATION` → contact phone/email/notes by type, `ZRETURNVISIT` →
`ZCALL`, monthly `ZSTATISTICSADJUSTMENT` reconciled against `ZTIMEENTRY` sums) —
so we need a real query engine, not just file bytes. We already ship
`expo-document-picker` (pick the file) and `expo-file-system` (read/copy it),
but neither can parse SQLite.

The semantics that make a SQL engine worth it (verified by reverse-engineering
the MyTime Objective-C source and a real backup):

- A month's displayed Hours = `sum(ZTIMEENTRY.ZMINUTES for that month) +
ZSTATISTICSADJUSTMENT["Hours"]`, where the adjustment is a **signed delta in
  minutes**, not an absolute. Reproducing MyTime's totals requires aggregating
  one table and reconciling against another.
- "Bible Study" / "Return Visit" counts are derived from `ZRETURNVISIT.ZTYPE`
  strings with per-person/per-month dedup — i.e. relational grouping.
- Contact phone/email/notes live in a separate `ZADDITIONALINFORMATION` table
  joined to `ZCALL` through a type table.

## Decision

**Add `expo-sqlite` and open the picked `.mytimedb` read-only to run the import
joins natively.**

The flow: `expo-document-picker` copies the file into the cache directory →
`expo-sqlite` opens it **read-only** → a thin `readMytimeDb.ts` runs a fixed set
of `SELECT`s (validating the file is actually a MyTime store by probing for
`ZCALL`/`ZRETURNVISIT` first) → `mapMytimeData.ts` denormalizes the rows into
WitnessWork types → the stores' existing `add*` actions persist them. We never
write to the source file; we never keep the SQLite handle past the import.

`expo-sqlite` is a first-party Expo module (SDK 55), so it's a native
dependency requiring one dev-client rebuild (`pnpm run ios`). The project
already uses `expo-dev-client` + prebuild, so this is routine.

## Alternatives Considered

1. **Bundle a WASM SQLite (`sql.js`/`wa-sqlite`).** Rejected. ~1 MB of WASM
   plus a non-trivial loader story in React Native (no DOM, filesystem access
   shims), all to avoid a first-party native module we can add cleanly. Larger
   bundle, more moving parts, worse cold-start, no upside.
2. **Hand-parse the SQLite file format in JS** (walk the b-tree pages off the
   `expo-file-system` byte buffer). Rejected. The SQLite on-disk format is
   stable but intricate (page headers, overflow pages, varint encodings,
   index vs. table b-trees); a hand-rolled reader is a large, fragile surface
   to maintain for one feature, and still leaves us writing joins by hand.
3. **Require the user to convert the file off-device** (desktop tool → JSON).
   Rejected. Defeats the purpose of an in-app onboarding/settings import; most
   users can't run a CLI, and it adds a tool we'd have to ship and maintain.
4. **Ask MyTime for a JSON/CSV export.** Not available; MyTime's only export is
   this Core Data store, and the project is effectively unmaintained.

## Consequences

### Positive

- **Faithful import.** Native SQL lets us reproduce MyTime's exact monthly
  totals and relational joins instead of approximating them.
- **Small, self-contained surface.** All SQLite usage is confined to
  `src/features/mytime-import/lib/`. The rest of the app never sees `expo-sqlite`
  and keeps persisting through the existing Zustand stores.
- **Read-only and disposable.** We open the external file read-only and drop
  the handle after import — no risk to the user's original backup, no new
  long-lived database in the app.
- **Reusable.** A general SQLite engine is available if a future feature needs
  one (e.g. importing other apps' Core Data stores).

### Negative

- **Native dependency + rebuild.** Adds `expo-sqlite` to the native build;
  contributors must rebuild the dev client once. Mitigated: it's first-party and
  prebuild is already the workflow.
- **Schema drift risk.** MyTime shipped ~19 Core Data model versions; our reader
  targets the columns present in real recent backups and must **degrade
  gracefully** on missing columns/tables (treat absent data as empty, never
  hard-fail the whole import). The validation probe and per-table try/catch are
  the mitigation.

### Neutral / out of scope

- **MyTime-only entities are ignored** (territories, publications/placements,
  bulk placements, filters, sorters) — no WitnessWork equivalent.
- **Import mapping decisions** (synthesized monthly residual time entries,
  skipping soft-deleted calls, seeding contact notes as a visit note,
  only-fill-if-unset for publisher role/tenure) are import-policy choices, not
  database-access choices, and are documented with the feature rather than here.
- **No change to the iCloud sync wire format or any store shape** — imported
  records are ordinary `Contact`/`Visit`/`TimeEntry` records with deterministic
  `mytime-*` ids for idempotent re-import.
