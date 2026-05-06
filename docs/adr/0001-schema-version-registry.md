# 0001 — SchemaVersion registry vs. per-store migration chains

- Status: Proposed
- Date: 2026-05-05
- Issue: [#315](https://github.com/leviFrosty/witness-work/issues/315)
- Enables: #322 (registry + serviceReport integration), #329 (iCloud merge guard), #330 (migrate `customFieldsMigration` and `migrateNormalizeDates` into the registry)

## Context

The app already has three structurally different migration mechanisms,
each invented in isolation as a need arose. They do not know about each
other, which is fine on a single device but increasingly risky now that
iCloud sync replicates raw payloads between devices that may be on
different schema generations.

What exists today:

1. **Zustand persist `migrate` chain (serviceReport only).**
   `src/stores/serviceReport.ts` declares `version: 2` on the persist
   config and dispatches into `migrateServiceReportPersistedState`
   (`src/stores/serviceReport.ts:76`). That function chains v0 → v1
   (`migrateServiceReports`, reshaping `ServiceReport[]` →
   `ServiceReportsByYears`) and v1 → v2 (`migrateNormalizeDates`,
   anchoring every persisted Date at noon UTC). Tests in
   `src/__tests__/serviceReportPersistMigration.test.ts` exercise the
   v0 → v2 and v1 → v2 paths and the idempotent v2 → v2 case.

2. **Boot-time, flag-gated, ad-hoc migration (custom fields).**
   `src/lib/customFieldsMigration.ts` exposes a pure
   `migrateCustomFieldsToIds` function that rewrites
   `Contact.customFields` from label-keyed to id-keyed and produces a
   `CustomFieldDefinition[]`. It runs from a `useEffect` in
   `src/App.tsx:184-219`, gated on `prefs.hasMigratedCustomFieldsToIds`.
   The contacts store has no `version` / `migrate` config —
   `src/stores/contactsStore.ts:273-278` is bare.

3. **Pre-merge data normalisation (sync layer).**
   `src/lib/sync/iCloudSync.ts` calls `migrateNormalizeDates`
   defensively on inbound remote data inside `replaceLocalWithRemote`
   (line 312) and `foldRemotePayloads` (line 933). The envelope itself
   carries `PAYLOAD_VERSION = 1` (`src/lib/sync/payload.ts:14`) and
   `parsePayload` rejects any envelope whose version is _greater than_
   the local code's known version (`src/lib/sync/payload.ts:142-143`).
   That is an envelope guard, not a per-entity schema guard:
   `mergePayload` (`src/lib/sync/merge.ts:67`) merges record-by-record
   on `updatedAt` with no awareness of the _shape_ of those records.

The problems this leaves us with:

- **A device on an older code version can pull a newer device's payload
  as long as the envelope version matches.** The envelope version has
  not been bumped since the feature shipped, so today every device
  parses every payload and merges record-by-record regardless of
  whether the inner shapes (e.g., `customFieldDefs`, normalised dates,
  any future migration) actually agree. Today this happens to be safe
  because the sync layer re-runs `migrateNormalizeDates` on inbound
  data, but that is a _coincidence of one migration_ — it does not
  scale.
- **`migrateNormalizeDates` is a v1→v2 service-report migration that is
  also reused as a sync sanitiser.** It is therefore implicitly the
  canonical "upgrade a remote payload to local" function for service
  reports, but nothing names it that or guarantees future migrations
  will be added to the same path.
- **The contacts store has no `version`.** If we ship a future contact
  shape change, we have to either invent a fourth migration mechanism
  for contacts or retrofit a Zustand persist version on a store that
  has been deployed for years (with all the "bump from 0" risk that
  carries on existing installs).
- **No single source of truth tells the UI / sync layer what version a
  given entity is at.** Issue #322 wants to expose the current version
  for `serviceReport`; #329 wants to compare local vs. remote per
  entity at merge time. Today there is no API surface for either.

## Decision

We will introduce a **single `SchemaVersion` registry** that owns the
migration chain and current version of each persistable entity, and
**each store will delegate** its `migrate` callback to that registry.
Stores keep their `persist` config, their `name`, and their storage
adapter — they do not become "registry-driven" all the way down. The
registry is the _catalogue of migrations_, not a replacement for
Zustand persist.

Concretely:

### 1. Registry vs. distributed migrations: **single registry**

A new module — proposed path `src/lib/schemaVersion/index.ts` — exports
a small typed surface roughly like:

```ts
export type SchemaEntity =
  | 'serviceReport'
  | 'contacts'
  | 'conversations'
  | 'preferences'

export type Migration<T = unknown> = (state: T) => T

export interface EntitySchema<T = unknown> {
  entity: SchemaEntity
  currentVersion: number
  // index = from-version; runs to (from + 1).
  migrations: Migration<T>[]
  // Optional: whitelisted "tolerant upgrade" used by sync (see §2).
  upgradeRemote?: (state: T, remoteVersion: number) => T
}

export function getCurrentVersion(entity: SchemaEntity): number
export function migrate<T>(
  entity: SchemaEntity,
  state: T,
  fromVersion: number
): T
export function canUpgradeRemote(
  entity: SchemaEntity,
  remoteVersion: number
): boolean
export function upgradeRemote<T>(
  entity: SchemaEntity,
  state: T,
  remoteVersion: number
): T
```

The serviceReport store's `migrate` becomes a one-liner that delegates:

```ts
migrate: (s, v) => SchemaVersion.migrate('serviceReport', s, v),
```

`migrateServiceReportPersistedState` survives as the _implementation_
behind the `serviceReport` registration. `migrateNormalizeDates` and
`migrateCustomFieldsToIds` become registered migrations for their
respective entities (issue #330).

**Rationale**

- We have three different mechanisms today (persist `migrate`, boot
  flag, sync re-normalisation). They already silently overlap:
  `migrateNormalizeDates` runs both inside the persist v1→v2 step _and_
  defensively on every inbound remote payload. Centralising forces
  that overlap to be explicit and named.
- Every downstream issue (#322, #329, #330) requires a per-entity
  current-version lookup that does not exist today. A registry is the
  smallest abstraction that supplies it.
- Stores keep their independence: a registry that owned Zustand
  persistence end-to-end would be a much larger refactor for marginal
  gain, and would couple unrelated stores (preferences vs. service
  reports) through the registry in ways that hurt testability.
- Having migration code outside the store file makes it easier to
  unit-test in isolation (we already do this for
  `migrateCustomFieldsToIds`); the registry generalises the pattern.

**Trade-offs**

- One more module to keep coherent; the registry is now a
  cross-cutting hot-spot.
- A bug in registry plumbing can affect every store. Mitigated by
  keeping the surface tiny and pure (no side effects, no I/O).
- Boot-flag-gated migrations (custom fields) need a different shape
  than version-numbered migrations (service report). The proposal:
  represent the custom-fields step as the v0 → v1 contacts migration
  inside the registry, retire the `hasMigratedCustomFieldsToIds`
  preference flag once existing installs have rolled forward, and bump
  `contactsStore` to `version: 1` with a `migrate` delegate. That is
  the design problem #330 closes; the registry just gives it
  somewhere coherent to live.

### 2. Sync-guard policy on version mismatch

The merge code in `src/lib/sync/merge.ts` will consult the registry
for each entity in the inbound payload (issue #329). The behaviour
matrix we adopt:

| local vs. remote                                | behaviour                                                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| same version                                    | merge as today (no behaviour change, regression-tested).                                                                             |
| **remote older** than local                     | run the registered forward migrations on the remote-side state up to the local version, then merge.                                  |
| **remote newer** than local, no migration       | refuse the merge for that entity; surface a non-blocking sync error in settings ("Update Witness Work to sync this device's data."). |
| **remote newer** but `upgradeRemote` registered | invoke `upgradeRemote` and merge. Used for backward-compatible additions where downgrade-tolerance is intentional.                   |

In other words: **upgrade-on-pull, refuse-on-downgrade, tell the user
when a refusal happens.** We do not silently drop fields; we do not
silently auto-downgrade. We do not write to iCloud while in a refusal
state for that entity (other entities continue to sync; the guard is
per-entity, not per-payload).

**Rationale**

- The current envelope-version check (`d.version > PAYLOAD_VERSION
→ null`, dropping the entire payload) is too coarse: a payload
  written by a device whose contacts schema is newer but whose service
  report schema matches will be entirely ignored. Per-entity guards
  let healthy entities still merge.
- "Refuse + surface" is the iCloud Drive-friendly choice. iCloud
  replicates whatever bytes the newest writer puts down; if we _also_
  write, we will overwrite the newer device's data with our older
  shape. The TestFlight / App Store rollout cadence means inter-device
  version skew is a real, ordinary state — not an exceptional one — so
  the user-visible signal must not be alarming, just informative.
- "Upgrade-on-pull" makes new code's first sync after a TestFlight
  bump silent and correct: new code can read everyone else's older
  payloads. That mirrors the sync layer's _existing_ defensive
  re-application of `migrateNormalizeDates` in `replaceLocalWithRemote`
  and `foldRemotePayloads`; we are formalising that pattern, not
  inventing it.

**Trade-offs**

- "Refuse" is asymmetric: the _older_ device cannot merge, the _newer_
  device can. So during a rollout, the newer device's writes will be
  visible to itself but not to peers until they update. We accept this
  as the safe default — the alternative, "older device merges newer
  data by ignoring unknown fields," requires every future schema
  change to be fully forward-compatible, which is a stronger constraint
  than we want to commit to today.
- Surfacing a sync error in settings is a small UI affordance we owe
  the user; that work is in #329's scope, not this ADR's.

### 3. UI / observability surface

Yes — the registry exposes `getCurrentVersion(entity)` and the merge
guard surfaces _which_ entity refused on version mismatch. We do not
ship a full settings UI for it as part of this ADR, but the data is
available so #329 can render a one-line "Service report data is newer
on another device — update to sync" message in settings, and so future
debugging UIs can list each entity's current version next to its
record count.

We do **not** persist the version per-record (no `schemaVersion` field
on individual `Contact` / `ServiceReport` rows). Per-record versioning
is a different and much heavier design; per-store is sufficient for
the problems #315/#322/#329/#330 set out to solve.

### 4. Migration order (which store integrates first)

**`serviceReport` is the first integration**, as the issue proposes,
for three reasons:

1. It already has the most layered migration chain (v0→v1→v2 plus the
   sync-side re-normalisation), so plumbing it through the registry
   exercises every interesting code path: chain dispatch, idempotency,
   pre-merge upgrade.
2. The existing tests
   (`src/__tests__/serviceReportPersistMigration.test.ts`,
   `src/__tests__/normalizeDateMigration.test.ts`,
   `src/__tests__/serviceReportStoreNormalization.test.ts`) form a
   strong regression net — a refactor that "no behaviour change" can
   be checked against them.
3. It is the entity whose payload shape is most likely to evolve next
   (recurring-plan overrides, tombstone retention, calendar-day
   semantics), so getting the registry wired before that next change
   lands is leveraged.

`contacts` integrates second (#330) — that step folds
`migrateCustomFieldsToIds` into the registry as the contacts v0 → v1
migration, retires the boot flag, and gives the contacts store a
`version` for the first time.

`conversations` and `preferences` integrate later, on demand. They have
no current migrations; registering them with `currentVersion: 0` is a
free no-op that simply makes them addressable from the merge guard.

## Consequences

**Positive**

- One place to find every entity's migration history, current version,
  and forward-migration function.
- Per-entity sync guards become possible (#329) without inventing a
  third version concept (envelope vs. entity vs. record).
- New stores get a known, documented pattern instead of three to choose
  between.
- The boot-flag pattern (`hasMigratedCustomFieldsToIds`) can be retired
  for future migrations — flag-gated migrations were a workaround for
  the contacts store not having a Zustand `version`. The registry
  removes that constraint.

**Negative**

- A single module that, if broken, can break every store's load path.
  We compensate with: pure functions, no I/O, registry-level unit
  tests, and we keep stores' `name` + storage adapter local (not
  registry-managed).
- Two additional concepts at the seams: `currentVersion` and
  `upgradeRemote`. `upgradeRemote` is opt-in and only used by entities
  that want forward-compatible reads; default behaviour is "refuse on
  newer."
- Retiring `hasMigratedCustomFieldsToIds` requires a careful one-time
  cutover — the contacts store has shipped at version 0 (implicit), so
  on first registry-aware boot, every install needs to be treated as
  v0 → v1 exactly once. The pure
  `migrateCustomFieldsToIds` function is already idempotent at the
  call-site level (#330's contract), so this is a sequencing problem,
  not a correctness one. We will solve it inside #330 by reading the
  flag once on the first registry-version boot to decide whether
  v0→v1 is needed, then dropping the flag.

**Neutral**

- The envelope-level `PAYLOAD_VERSION` stays. It guards against
  unrecognisable wire shapes (top-level structure changes), which is a
  different concern from per-entity schema. Once the registry exists,
  most schema changes will bump entity versions, not the envelope.

## Alternatives considered

### A. Keep per-store migrations; put a thin `getVersion()` helper next to each store

We considered the smallest possible change: add an exported
`SERVICE_REPORT_SCHEMA_VERSION = 2` const next to each store, and have
the merge guard import all of them. No registry, no central module.

Rejected because:

- It still leaves three different _mechanisms_ (persist, boot-flag,
  sync re-normalisation) coexisting with no shared dispatch, which is
  precisely the structural problem #315 is asking us to solve.
- Sync's "run the right migration on inbound remote data" needs a
  callable function per entity, not just a constant. Once we have to
  expose both a number and a callable per entity, we have a registry
  in everything but name.

### B. Per-record `schemaVersion` field

Stamp each `Contact`, `ServiceReport`, etc. with its own
`schemaVersion`. Migrate row-by-row at read time.

Rejected because:

- Doubles or triples our per-record write cost (every existing record
  would need backfilling), which we already paid for once in
  `backfillUpdatedAtIfNeeded`
  (`src/lib/sync/iCloudSync.ts:1006`).
- It is the right answer for systems where rows of _different_ schema
  versions can coexist legitimately (e.g., partial-rollout SaaS). In a
  single-user, all-records-at-the-current-version app, per-store
  versioning is sufficient and ~10x simpler.

### C. Drop `migrate` entirely, do all migrations at the sync layer

Treat persist as version-less; let sync's `replaceLocalWithRemote`
normalise everything on inbound and rely on the most-recent-writer
winning.

Rejected because:

- The whole point of Zustand persist's `migrate` is that the _local_
  load path can also rehydrate older shapes. A user who has not
  enabled iCloud sync would have no migration path at all under this
  alternative.
- It collapses two correctness boundaries (local-load and remote-merge)
  into one. They have different failure modes — local-load failure
  bricks the app for that user; remote-merge failure bricks sync for
  that one device — and we want to be able to fix them independently.

## Open questions for the maintainer

1. **Naming.** `SchemaVersion` is the issue's working name. We could
   also call the module `entitySchemas`, `migrationRegistry`, or
   `persistedSchemas`. Strongly leaning toward `schemaVersion` for
   continuity with the issue label `arch:schema-version`, but flagging
   it explicitly because module names ossify quickly.

2. **Error UI for refusal.** §2 says "surface a non-blocking sync
   error." Do we want that to live inside the existing iCloud sync
   error surface in settings, or is this its own pill? The answer
   doesn't change the registry design but affects #329's scope.
