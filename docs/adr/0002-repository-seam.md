# ADR 0002: Repository seam between iCloud sync and Zustand stores

- **Status:** Proposed
- **Date:** 2026-05-05
- **Related issues:** #314 (this ADR), #321, #326, #327, #328
- **Related code:** `src/lib/sync/iCloudSync.ts`, `src/lib/sync/payload.ts`,
  `src/lib/sync/merge.ts`, `src/lib/sync/imageSync.ts`,
  `src/stores/conversationStore.ts`, `src/stores/contactsStore.ts`,
  `src/stores/serviceReport.ts`, `src/stores/preferences.ts`

## Context

`src/lib/sync/iCloudSync.ts` is the iCloud sync orchestrator. It is currently
~1.2k lines and reaches directly into four Zustand stores via
`useContacts.getState()`, `useConversations.getState()`,
`useServiceReport.getState()`, and `usePreferences.getState()` (and the
matching `setState` calls). The same coupling exists in `payload.ts`
(`buildPayload` reads all four stores) and in the pull/merge result write-back
inside `pullAndMergeInner` (lines 830-951 of `iCloudSync.ts`).

This coupling has concrete costs we feel today:

1. **Tests can't exercise sync without booting react-native.** The pure parts
   are already split out — `merge.ts`, `payload.ts` (mostly), `imageSync.ts`,
   `imageSources.ts`, `avatarPayload.ts` — and unit tests live next to them
   under `src/lib/sync/__tests__/`. But `iCloudSync.ts` itself is untested:
   anything that calls `useX.getState()` requires the zustand modules, which
   pull AsyncStorage / MMKV / expo-notifications. The merge result write-back
   is the single highest-risk code path in the app (it can clobber user data)
   and we have zero integration coverage for it.
2. **Stamping rules leak.** `pullAndMergeInner` and `replaceLocalWithRemote`
   both bypass `usePreferences.getState().set` and call
   `usePreferences.setState` directly to avoid the stamping wrapper in
   `stores/preferences.ts:526-552`. This is correct but invisible — every
   future caller has to re-derive that knowledge by reading inline comments
   ("Same rationale as `replaceLocalWithRemote`...", lines 932 & 945).
3. **The merge boundary is implicit.** `mergePayload` produces a `MergeResult`
   that the orchestrator splays back into four `set` / `setState` calls, with
   per-entity quirks (e.g. `migrateNormalizeDates` on service reports,
   `preferenceUpdatedAt` preservation on prefs, `deletedConversations` going
   in alongside `conversations`). There is no single place to look at "what
   does it mean to apply a merged snapshot for entity X."
4. **Downstream issues #321, #326, #327, #328 explicitly request this seam.**
   They are blocked on this ADR.

There is **already a precedent** in the codebase: `imageSync.ts` defines an
`ImageSyncDeps` injection point (`bridge` + `fs` + `now`) so its
upload/download orchestration is testable without react-native. The decision
below extends that pattern to the JSON store side of sync.

A counter-argument worth taking seriously: the stores already implement an
implicit interface (`getState` + `setState` + `subscribe`). Wrapping that with
a hand-rolled `Repository<T>` adds one more layer to read through. We accept
that cost because the integration tests it unlocks are the only realistic way
to validate merge semantics against real entity shapes (the current
`merge.ts` tests use synthesized literals; an in-memory `ConversationRepo`
gives us round-trip tests through the same code path the real adapter uses).

## Decision

We will introduce a per-entity repository seam between `iCloudSync` and the
Zustand stores. The migration is **incremental, one entity at a time, starting
with conversations**.

### Q1: Introduce the seam? **Yes.**

The seam pays for itself when (a) we write an integration test for the merge
write-back path, and (b) the next person modifying sync semantics doesn't have
to re-derive which `setState` calls bypass the stamping wrapper and why. Both
are real costs being paid today.

### Q2: Repository interface shape

A repository owns one entity family (active records + tombstones for that
entity, plus any sibling collections that travel with it — e.g.
`customFieldDefs` for contacts). Sync only reaches stores through this
interface; UI code is unaffected and continues to use the Zustand hooks
directly.

```ts
// src/lib/sync/repos/types.ts (new file, created in #321)

/**
 * A whole-entity snapshot — the unit the sync layer reads, merges, and writes.
 * The shape mirrors the corresponding slice of `SyncPayload` so adapters do not
 * need to translate between two representations.
 */
export type ConversationSnapshot = {
  conversations: Conversation[]
  deletedConversations: ConversationTombstone[]
}

/**
 * Subscription handle. Returns an unsubscribe function, matching Zustand's
 * `store.subscribe` contract so the Zustand adapter is a thin pass-through.
 */
export type Unsubscribe = () => void

/**
 * Repository for one entity family. The sync layer is the only consumer; UI
 * code keeps using the Zustand hooks directly.
 *
 * Semantics:
 *
 * - `read()` returns a snapshot of the current state. It is synchronous and
 *   non-mutating (mirrors `useStore.getState()` for the relevant fields).
 * - `applyMerged(snapshot)` performs a _snapshot replace_ of the fields the repo
 *   owns. It does NOT stamp `updatedAt` on individual records (those stamps
 *   came from the merge result and must be preserved verbatim) and it does NOT
 *   re-emit through the Zustand store's stamping wrapper for preferences.
 *   Adapters are responsible for honoring this.
 * - `subscribe(fn)` notifies on any change to the owned fields. Used by
 *   `installiCloudSync` to schedule a debounced push.
 *
 * Snapshot vs. merge: the repo intentionally does NOT expose a "merge into me"
 * operation. Merging stays in `merge.ts` — a pure function of two snapshots.
 * The repo only does whole-snapshot reads and writes. This keeps the testable
 * surface (merge math) separate from the side-effecting surface (store I/O).
 */
export interface Repository<TSnapshot> {
  read(): TSnapshot
  applyMerged(snapshot: TSnapshot): void
  subscribe(listener: () => void): Unsubscribe
}

export type ConversationRepo = Repository<ConversationSnapshot>
```

For the contact repo, the snapshot type also includes `customFieldDefs`
(they live in the same store and travel as one unit through the merge
result). For service reports it includes `serviceReports`, `dayPlans`,
`recurringPlans`, and `deletedServiceReports` — and the adapter is the
right place to call `migrateNormalizeDates` on the incoming snapshot, so
that quirk lives next to the entity it concerns instead of in
`iCloudSync.ts`.

For preferences the snapshot type is
`{ values: Record<string, unknown>; updatedAt: Record<string, number> }`,
matching `mergePayload`'s output. The adapter calls `setState` directly
(not through the stamping wrapper), preserving the per-key `updatedAt`
verbatim — the rule that's currently a comment in `iCloudSync.ts` becomes
a contract enforced inside the adapter.

**Rationale for this shape (the alternatives we considered):**

- **Per-record CRUD (`get(id)`, `put(record)`, `delete(id)`).** Tempting,
  but every sync code path operates on whole-entity snapshots — `buildPayload`
  reads everything, `mergePayload` produces a whole `MergeResult`, the
  write-back replaces whole arrays. Per-record CRUD would force the sync
  layer to iterate twice for no gain and would split tombstone handling
  awkwardly (a delete is one tombstone insert + one record removal, but
  the merge result ships them together).
- **Reactive `Observable<T>`.** Overkill — `subscribe` plus `read()` covers
  every current call site. We can add an observable later if a UI consumer
  appears.
- **Generic `Repository<T extends { id: string }>`** (record-level
  generic). Doesn't fit because preferences aren't `{ id, ...}` records and
  contacts carry sibling `customFieldDefs`. The "snapshot" generic is
  honest about what we actually swap in and out.

### Q3: Migrate conversations first

`ConversationRepo` is the right first slice for three reasons:

1. **Smallest surface.** The conversation store
   (`src/stores/conversationStore.ts`, 89 lines) has only
   `conversations` + `deletedConversations` and three mutators. No nested
   structures, no sibling collections, no special merge quirks (no
   `migrateNormalizeDates`, no stamping wrapper).
2. **Cleanest tombstone story.** Conversation tombstones are a flat
   `{ id, deletedAt }[]` — the shape that `mergeTombstones` and
   `applyTombstones` operate on without any of the
   active-vs-deleted reconciliation that contacts have
   (`reconcileActiveAndDeletedContacts` in `merge.ts`). Validating the seam
   here proves it works for the simple case before contacts force the
   harder one.
3. **Lowest blast radius.** The conversation flow has fewer screens
   touching it than contacts, and no image sync coupling. A regression in
   conversations is recoverable; a regression in contacts could lose
   avatars or nuke the profile photo.

Consequence for the issue tracker: #321 (Conversations) is the first
implementation issue and unblocks #326 (Contacts), #327 (Service reports),
and #328 (Preferences). #326 should follow #321 directly because contacts
hold the most complex merge semantics; getting them next means the
remaining slices are mechanical.

### Q4: Stores stay; an in-memory adapter is the test fixture

Each entity gets exactly two adapters:

- **`ZustandConversationRepo`** — production. Wraps `useConversations`.
  `read()` is a thin `useConversations.getState()` projection.
  `applyMerged()` calls the store's existing `set` mutator (which is
  the raw zustand setter — not a stamping wrapper, for conversations).
  `subscribe()` is a direct passthrough of `useConversations.subscribe`.
- **`InMemoryConversationRepo`** — tests + Storybook. Holds a snapshot in
  a closure and drives a tiny pub/sub. Used to write integration tests
  for `pullAndMerge` against a known starting state, without booting
  AsyncStorage / MMKV / react-native.

We do **not** build a third "facade" adapter that fans out into multiple
stores. The repository is per-entity. `iCloudSync` will hold a
`{ conversations: ConversationRepo; contacts: ContactRepo; ... }` bag — call
this the `SyncRepos` map — and pass it where today it imports the
zustand modules directly.

### Q5: Migration plan — incremental, per entity, in a fixed order

```
#321 Conversations  (this ADR's first slice)
  └── #326 Contacts (also covers iCloudImageSync bookkeeping handoff)
        └── #327 Service reports
              └── #328 Preferences (the last direct .getState())
```

Each issue lands a vertical slice: the repo interface contract is locked
once (in #321), then each subsequent issue adds an adapter pair and
migrates the corresponding code path inside `iCloudSync.ts` /
`payload.ts`. Other entities continue calling `useX.getState()` until
their slice lands. After #328, `iCloudSync.ts` and `payload.ts` will
import the repos and **zero** Zustand store modules.

We rejected the all-at-once alternative because the migration touches the
single highest-risk code path in the app. Doing it as four reviewable
slices, each with its own integration test, lets us catch regressions
before they compound. The cost is that for ~four PRs `iCloudSync.ts`
holds a mix of repo-routed and direct-store calls; we accept that
short-term inconsistency for the long-term safety.

## Consequences

### Positive

- **Integration testable.** Each entity gets a vitest integration test
  that wires `InMemoryXRepo`, runs `pullAndMerge` (or its repo-routed
  successor), and asserts the merged state against a fixture remote
  payload. This is the test we can't write today.
- **Stamping/normalization quirks become contracts.** The
  preferences-stamping bypass and the
  `migrateNormalizeDates` call live inside the adapters where they
  belong. New contributors don't have to read `iCloudSync.ts` comments
  to learn the rules.
- **Smaller `iCloudSync.ts`.** Removing the four `getState()` /
  `setState()` clusters trims `pullAndMergeInner` significantly and
  pulls per-entity logic out of the orchestrator.
- **Future flexibility.** A future sync target (e.g. CloudKit, a
  hypothetical web export) plugs in by swapping the orchestrator's
  repo wiring, not by editing every store.

### Negative

- **One more layer of indirection.** Reading "where does sync write
  conversations?" now requires opening
  `src/lib/sync/repos/conversationRepo.ts` instead of grepping
  `useConversations.setState` in `iCloudSync.ts`. We mitigate by
  keeping the adapter file small (target: under 60 lines per entity)
  and colocating it under `src/lib/sync/repos/`.
- **Mixed-state interim.** During issues #321 → #328, `iCloudSync.ts`
  has both repo-routed and direct-store calls. A reader could mistake
  the still-direct calls for the new pattern. We mitigate with a
  short comment block at the top of `iCloudSync.ts` listing which
  entities are migrated and pointing at this ADR.
- **Migration bug risk.** Each adapter PR could introduce a regression
  in the highest-risk code path. We mitigate with the per-entity
  integration test that's explicitly listed in each issue's
  acceptance criteria, and by keeping the merge math itself
  (`merge.ts`) untouched throughout the migration.
- **Snapshot replace is coarse.** `applyMerged` replaces every owned
  field at once. For most entities this is what `pullAndMerge` already
  does. If a future use case needed to write only one field, the
  adapter would have to grow a narrower mutator — but adding that
  later is straightforward.

### Neutral / explicitly out of scope

- **Per-record CRUD remains in the store.** `addConversation`,
  `deleteConversation`, etc. continue to live on the Zustand store and
  are called from UI. The repo seam is a sync-only boundary.
- **The push-debounce and the `installiCloudSync` subscriber wiring**
  stay in `iCloudSync.ts`. The repo's `subscribe()` is the substrate;
  the orchestrator still owns the policy.
- **No change to the wire format** (`SyncPayload` in `payload.ts`).
  `buildPayload` will switch from `useX.getState()` to
  `repos.X.read()`; the bytes pushed to iCloud are unchanged. This
  also means the migration is invisible to existing devices in the
  field.
- **No change to `merge.ts`.** It stays a pure function of two
  snapshots.

## Alternatives Considered

1. **Keep direct `useX.getState()`; just write more tests.** Rejected
   because the test-boot cost is the actual blocker — vitest tests
   that import the zustand stores transitively pull
   AsyncStorage / MMKV / expo-notifications. Mocking that surface for
   each test is more code than the repo seam itself.
2. **Generic record-level `Repository<T extends { id: string }>`.**
   Rejected; doesn't fit preferences, awkward for contacts'
   `customFieldDefs`, and the merge layer already operates on whole
   snapshots.
3. **Reactive `Observable<TSnapshot>`** instead of `subscribe()` +
   `read()`. Rejected as overkill for two callers
   (`installiCloudSync` and tests).
4. **One monolithic `SyncRepository` with all four entities.** Rejected
   because it re-creates the current god-object problem at a smaller
   scale and makes incremental migration impossible.
5. **All-at-once migration in a single PR.** Rejected; touches the
   highest-risk path in the app and would be unreviewable.
6. **Migrate contacts first** (largest store, most complex). Rejected
   because validating the interface shape on the smallest entity
   first is cheaper to redo if we got the shape wrong.

## Open questions for the reviewer

- Is the snapshot-replace boundary acceptable, or do you want a
  narrower mutator surface (e.g. a separate
  `applyMergedTombstones`) for safety even though `pullAndMerge`
  always writes everything together today?
- Adapter file location: `src/lib/sync/repos/` (proposed) vs.
  `src/lib/repos/` (entity-shaped, sync-agnostic). The first is
  honest about today's only consumer; the second leaves room if a
  non-sync caller ever appears.
