# Plan: One-Way Calendar Sync (iOS Calendar / Google Calendar)

## Goal

Add opt-in, one-way sync of Witness Work follow-ups, day plans, and recurring plans into the user's iOS Calendar. Google Calendar support comes free via iOS's existing account integration (user adds Google to iOS Calendar; we write to the Google-backed calendar). No backend, no OAuth, no bidirectional sync.

## Scope

**In:** Conversation follow-ups, day plans, recurring plans (with full RRULE + exceptions + overrides), per-entity toggles, dedicated settings screen, multi-device-safe dedup, initial backfill with progress UI, error log with retry.

**Out:** Service reports (retrospective — belong in app, not calendar), bidirectional sync (any external edits get overwritten), direct Google Calendar OAuth integration, in-app calendar alarms (existing notification system stays the source of truth), Android.

## Architecture

```
                     ┌─────────────────────────────────────────────┐
                     │  Zustand stores                             │
                     │  conversationStore, serviceReport, contacts │
                     └──────────────┬──────────────────────────────┘
                                    │ subscribe(set)
                                    ▼
       ┌───────────────────────────────────────────────────────────┐
       │  useCalendarSyncEngine (mounted in App.tsx)               │
       │  - debounce (2s, max 30s)                                 │
       │  - per-entity write lock (auto-resume after release)      │
       │  - bulk suppression flag                                  │
       │  - chunked yields via setTimeout(0) every 10 items        │
       └──────────────┬────────────────────────────────────────────┘
                      ▼
       ┌──────────────────────────────────────────────────────────┐
       │  src/lib/calendarSync/  (private internals)              │
       │  engine • reconcile • dedup • mappers/* • hash • calendar│
       └──────────────┬───────────────────────────────────────────┘
                      ▼
       ┌──────────────────────────────────────────────────────────┐
       │  expo-calendar  →  EventKit  →  iCloud / Google calendar │
       └──────────────────────────────────────────────────────────┘
```

Triggers: (1) real-time on Zustand mutations, (2) on app foreground (`reconcileAll()`), (3) manual "Sync now" button. No iOS BackgroundTasks.

## Multi-device dedup invariant

Every sync of entity `E` on device `D`:

1. Local mapping hit → fetch event, update if drifted, done.
2. No mapping → scan target calendar for events with `url = witnesswork://entity/<E>`.
3. Match found → claim it (store `eventIdentifier` in local mapping). No EventKit write.
4. No match → create event with breadcrumb URL, store mapping locally.
5. Post-create scan → if duplicates exist, keep oldest by `creationDate`, delete the rest.

Per-device sync state (`useCalendarSync` store) is **excluded from the iCloud sync payload**. This is for _identifier locality_ (EventKit IDs are device-local), NOT for dedup — dedup is the breadcrumb scan above.

## Data model

### New store: `src/stores/calendarSync.ts` (per-device, MMKV-only, NOT in iCloud payload)

```ts
{
  enabled: boolean
  calendarId: string | null
  calendarSource: 'iCloud' | 'Local' | 'Google' | 'Other'
  syncFollowUps: boolean      // default true
  syncDayPlans: boolean       // default true
  syncRecurringPlans: boolean // default true
  lastFullReconcileAt: number | null
  mappings: {
    [entityId: string]: {
      calendarEventId: string
      lastSyncedUpdatedAt: number
      lastSyncedSnapshot: string  // JSON.stringify of calendar-relevant fields
      overrides?: { [isoDate: string]: { lastSyncedSnapshot: string } }
    }
  }
  errors: Array<{
    entityId: string
    entityType: 'followUp' | 'dayPlan' | 'recurringPlan'
    label: string
    reason: string
    at: number
  }>  // capped at 20, oldest evicted
}
```

### Modify: `src/lib/sync/payload.ts`

Verify `useCalendarSync` is **not** included in the gather/apply functions. Add a regression test asserting this.

### Modify: `src/stores/preferences.ts`

Add one new pref (per-user, in iCloud sync payload):

```ts
returnVisitDurationDefault: number // minutes, default 30
```

Plus one trivially-small UI-state pref:

```ts
calendarSyncBannerDismissedAt?: number
```

### No changes to existing entity types

Calendar sync deliberately doesn't pollute `Conversation`, `DayPlan`, `RecurringPlan` types with sync state. All sync metadata lives in `useCalendarSync`.

## File-level changes

### New files

```
src/lib/calendarSync/
  index.ts                     # public API only — see below
  engine.ts                    # queue, debounce, write-lock, suppression, chunking
  reconcile.ts                 # reconcileAll, tombstone scan
  permissions.ts               # expo-calendar permission wrappers + state inspection
  calendar.ts                  # find/create/delete the destination calendar
  dedup.ts                     # breadcrumb scan, claim-before-create, post-create reconcile
  hash.ts                      # buildSnapshot(entity) → string (JSON.stringify of mapped fields)
  mappers/
    followUp.ts                # Conversation+followUp → EKEvent fields
    dayPlan.ts                 # DayPlan → EKEvent fields
    recurringPlan.ts           # RecurringPlan → EKEvent + RRULE + exceptions + overrides
  types.ts                     # CalendarSyncMapping, SyncError, SyncProgress, SyncableType

  __tests__/
    index.test.ts              # public-API contract tests (TDD entry point)
    hash.test.ts
    dedup.test.ts
    mappers/
      followUp.test.ts
      dayPlan.test.ts
      recurringPlan.test.ts    # RRULE conversion, override mechanics, BI_WEEKLY collapse

src/stores/
  calendarSync.ts              # Zustand store

src/hooks/
  useCalendarSyncEngine.ts     # mounts Zustand subscriptions; called once at app root

src/screens/settings/
  CalendarSyncScreen.tsx       # the dedicated settings screen
```

### Modified files

- `App.tsx` — mount `useCalendarSyncEngine()` once at root.
- `src/screens/settings/preferences/PreferencesScreen.tsx` — new entry "Calendar Sync" between Conversations and Publisher sections, navigates to `CalendarSyncScreen`.
- `src/screens/settings/preferences/sections/ConversationsPreferencesSection.tsx` — add `returnVisitDurationDefault` stepper near the existing offset prefs.
- `src/lib/sync/payload.ts` — verify exclusion; add regression test.
- `src/screens/PaywallScreen.tsx:42–53` — add `{ labelKey: 'paywallFeatureCalendarSync', free: true, supporter: true }` to `FEATURE_ROWS`.
- `src/screens/ScheduleScreen.tsx` (or equivalent top-of-schedule surface) — small inline invite banner row, dismissible via `calendarSyncBannerDismissedAt`.
- `src/locales/en-US.json` — new translation keys (listed below).
- `package.json` — add `expo-calendar`.
- `app.json` — add `expo-calendar` to `plugins` with permission strings.

## Public API (`src/lib/calendarSync/index.ts`)

Every export gets a JSDoc block: behavior, assumptions, throws, mutations.

```ts
/**
 * Enable calendar sync. Prompts permission, finds or creates the destination
 * calendar, runs initial backfill (with progress events). Returns the chosen
 * calendar metadata. Throws on permission denial or user cancellation.
 */
export async function enableCalendarSync(opts?: {
  calendarId?: string
}): Promise<CalendarMeta>

/**
 * Disable calendar sync. If `wipe` is true, removes all events tagged with our
 * breadcrumb URL from the target calendar (and deletes the calendar itself if
 * we created it and it's empty after cleanup). Emits progress.
 */
export async function disableCalendarSync(opts: {
  wipe: boolean
}): Promise<void>

/**
 * Switch destination calendar. If `wipe` is true, deletes events from the old
 * calendar, recreates them in the new. Old auto-created calendar is removed if
 * empty after the move. Emits progress.
 */
export async function switchDestinationCalendar(args: {
  newCalendarId: string
  wipe: boolean
}): Promise<void>

/**
 * Toggle a per-entity-type sync. If disabling with `wipe: true`, removes events
 * of that type from the target calendar. Emits progress.
 */
export async function setEntityTypeSync(args: {
  type: SyncableType
  enabled: boolean
  wipe: boolean
}): Promise<void>

/**
 * Force a full reconcile across all enabled entity types and their tombstones.
 * Used by "Sync now" button and on app foreground. Resolves when queue drains.
 */
export async function reconcileAll(): Promise<void>

/** Subscribe to live progress + state updates for the settings screen UI. */
export function subscribeToSyncProgress(
  listener: (state: SyncProgress) => void
): () => void
```

Internals (`engine.ts`, `reconcile.ts`, `dedup.ts`, `mappers/*`) are private to the module — consumers go through `index.ts` only.

## Field mapping reference

### Follow-up (Conversation with `followUp`)

| Field                   | Value                                                                             |
| ----------------------- | --------------------------------------------------------------------------------- |
| `title`                 | `Follow-up: <contact.name>` (active contacts only — see edge case below)          |
| `notes`                 | `<followUp.topic>\n\nwitnesswork://entity/<conversation.id>`                      |
| `location` (structured) | `contact.address` + `contact.coordinate` if present                               |
| `startDate`             | `followUp.date` (already includes time via `returnVisitTimeOffset`)               |
| `endDate`               | `startDate + returnVisitDurationDefault` minutes                                  |
| `allDay`                | false                                                                             |
| `alarms`                | none (in-app notifications stay source of truth)                                  |
| `url`                   | `witnesswork://entity/<conversation.id>` (breadcrumb)                             |
| Skip if                 | `contact` not in active `contacts[]` (auto-deleted; recreated on contact recover) |

### Day plan

| Field       | Value                                                               |
| ----------- | ------------------------------------------------------------------- |
| `title`     | `dayPlan.note` if present, else `Service plan`                      |
| `notes`     | `witnesswork://entity/<dayPlan.id>`                                 |
| `startDate` | `dayPlan.date` + `dayPlan.startTime` (when added by parallel agent) |
| `endDate`   | `startDate + dayPlan.minutes`                                       |
| `allDay`    | true if no `startTime`, else false                                  |
| `url`       | `witnesswork://entity/<dayPlan.id>`                                 |

### Recurring plan

| Field            | Value                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| `title`          | `recurringPlan.note` if present, else `Recurring service`                                         |
| `notes`          | `witnesswork://entity/<recurringPlan.id>`                                                         |
| `startDate`      | `recurringPlan.startDate` + `startTime` (when added)                                              |
| `endDate`        | `startDate + recurringPlan.minutes`                                                               |
| `allDay`         | true if no `startTime`, else false                                                                |
| `recurrenceRule` | See RRULE table below                                                                             |
| `recurrenceEnd`  | `recurrence.endDate` if present, else indefinite                                                  |
| Per-instance     | For each `deletedDates[]` entry: per-instance delete via `expo-calendar` with `instanceStartDate` |
| Per-instance     | For each `overrides[]` entry: detach via `instanceStartDate`, mutate fields                       |
| `url`            | `witnesswork://entity/<recurringPlan.id>` (on parent + each detached instance)                    |

### RRULE conversion

| App `frequency`      | EKRecurrenceFrequency                                                      | EKRecurrenceRule.interval |
| -------------------- | -------------------------------------------------------------------------- | ------------------------- |
| `WEEKLY`             | `weekly`                                                                   | `interval`                |
| `BI_WEEKLY`          | `weekly`                                                                   | `interval * 2`            |
| `MONTHLY`            | `monthly`                                                                  | `interval`                |
| `MONTHLY_BY_WEEKDAY` | `monthly` + `daysOfTheWeek` + `setPositions` from `monthlyByWeekdayConfig` | `interval`                |

On rule change (frequency, interval, byweekday, startDate): **delete the parent series and recreate**, then re-apply `deletedDates` + `overrides`. Identifier remap is local; iCloud calendar replication handles the rest.

## Engine invariants

- **Idempotence:** every code path that observes "potentially out of date" either (a) is a no-op that updates `lastSyncedUpdatedAt` + `lastSyncedSnapshot` only, or (b) writes to EventKit and updates local state. No path writes to EventKit without updating local state. No path writes to the entity from sync code.
- **Suppression flag:** during `enableCalendarSync` backfill and `switchDestinationCalendar` move operations, the real-time Zustand subscription is a no-op. The bulk operation flushes everything once.
- **Per-entity write lock:** `Set<entityId>` of in-flight writes. Concurrent sync requests for the same entity coalesce; the lock auto-releases on completion and the debounce timer reschedules any pending updates.
- **Chunking:** all bulk loops process 10 items, then `await new Promise(r => setTimeout(r, 0))` to yield the JS thread, then report progress.
- **Failure isolation:** one entity's failure doesn't block others. On error, leave `lastSyncedUpdatedAt` unchanged so next reconcile retries.

## Settings screen layout (`CalendarSyncScreen.tsx`)

Top-to-bottom:

1. Master toggle: "Sync to device calendar"
2. Permission status row (only if denied / not-determined) → button to iOS Settings
3. Calendar destination row: shows current calendar name → tap to change (calendar picker modal). Helper text below: _"Want to sync to Google Calendar? Add your Google account in iOS Settings → Apps → Calendar → Calendar Accounts, then come back and pick the Google calendar here."_
4. "What to sync" section: Follow-ups / Recurring plans / Day plans toggles
5. Live status row: "Last synced 2 minutes ago" + "Sync now" button. During sync: progress bar + `Syncing 23 of 156…`
6. Recent issues (collapsible, only shown if non-empty): up to 20 entries, each with friendly label + reason + per-row Retry; "Retry all" at top
7. Footer copy: _"Edit follow-ups, plans, and recurring service in Witness Work — changes made in your calendar app will be overwritten on next sync."_
8. Footer note: _"If you uninstall Witness Work, you can remove these events by deleting the Witness Work calendar in the iOS Calendar app."_

## UX flows requiring confirmation modals

Each modal uses the existing UI patterns and shows a progress indicator during the wipe/move:

| Action                | Modal title                                                        | Default  | Wipe behavior                                                                      |
| --------------------- | ------------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------- |
| Master toggle off     | "Also remove synced events from your calendar?"                    | Remove   | Delete all events with breadcrumb URL; delete auto-created calendar if empty after |
| Per-entity toggle off | "Also remove existing follow-up events from your calendar?" (etc.) | Remove   | Delete only events of that type                                                    |
| Calendar switch       | "Move events from \<old\> to \<new\>?"                             | Move     | Delete from old, recreate in new; delete old auto-created calendar if empty after  |
| First-enable backfill | "This will add ~N events to your calendar. Continue?"              | Continue | If cancelled: revert toggle, delete the calendar we just created                   |

## Initial-enable flow

1. Master toggle off → on.
2. `requestCalendarPermissionsAsync()`. Denied → toast, revert toggle.
3. iOS 17+: request **full access** (`requestCalendarPermissionsAsync` + verify `accessLevel === 'fullAccess'`). Write-only granted → degrade gracefully (no breadcrumb scan, no recovery, single dismissible warning), but still proceed.
4. Find existing "Witness Work" calendar in iCloud source; create if absent. If iCloud source unavailable: fall back to Local source + show one-time warning _"We couldn't find an iCloud calendar source — events will only show on this device."_
5. Backfill confirmation modal with estimated event count.
6. Backfill runs with suppression flag set, progress emitted to settings screen.
7. Done — `lastFullReconcileAt` populated; real-time subscription becomes active.

## Backfill scope (first sync)

| Entity          | Scope                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------- |
| Follow-ups      | `followUp.date >= today` only                                                               |
| Day plans       | `date >= today` only                                                                        |
| Recurring plans | Full series — EventKit materializes from the rule (one event regardless of `startDate` age) |

Past follow-ups never enter the calendar. Once a follow-up's date drifts into the past while it's already synced, the event remains but stops receiving updates.

## Edge case behaviors

| Scenario                                              | Behavior                                                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Contact soft-deleted                                  | Auto-delete the calendar event for any follow-up referencing this contact                                                 |
| Contact recovered                                     | Recreate the calendar event from the still-existing conversation's followUp                                               |
| Conversation deleted                                  | Cascading delete of its follow-up event (via Zustand subscription)                                                        |
| `conversation.followUp` cleared but conversation kept | Delete the follow-up event (snapshot detects sub-record gone)                                                             |
| Day plan deleted                                      | Delete the event                                                                                                          |
| Recurring plan deleted                                | Delete the parent EventKit series; detached overrides go with it                                                          |
| Recurring plan rule change                            | Delete + recreate series, re-apply `deletedDates` + `overrides`                                                           |
| App reinstall, sync re-enabled                        | Mappings empty; breadcrumb scan rebuilds them on first reconcile                                                          |
| Calendar deleted externally                           | Recreate "Witness Work" if it was auto-created; otherwise prompt user to pick another                                     |
| Permission revoked                                    | Disable sync; dismissible banner pointing to iOS Settings                                                                 |
| Tombstones from deleted entities                      | `reconcileAll` scans `ConversationTombstone[]` / `ServiceReportTombstone[]` and deletes corresponding events              |
| Travel / DST                                          | All-day events use local-day from noon-UTC normalize; timed events use device's current TZ; EventKit handles DST natively |

## Native + permissions

- `expo-calendar` added to `package.json` and `app.json` plugins.
- Required Info.plist entries (handled by plugin):
  - `NSCalendarsUsageDescription`: _"Witness Work adds your scheduled visits and service plans to your calendar so you can see them alongside your other appointments."_
  - `NSCalendarsFullAccessUsageDescription`: _"Witness Work needs full calendar access so it can keep your synced events up to date and avoid duplicates across your devices."_
  - `NSCalendarsWriteOnlyAccessUsageDescription`: _"Witness Work can add events to your calendar without reading existing ones, but multi-device sync and recovery features require full access."_
- New native build / EAS submission required.

## Telemetry

- **Sentry**: capture only unexpected errors (not "permission denied," "calendar not found," "network timeout" — those are user states).
- **Sentry breadcrumbs**: every reconcile start/end, every entity write at debug level — for context when a real Sentry event fires.
- **Logger**: verbose for everything (existing `logger` from `src/lib/logger`).
- **No new analytics library.**

## Translation keys (add to `src/locales/en-US.json` only — translations run later)

```
calendarSync                                  → "Calendar Sync"
calendarSync_description                      → "Add follow-ups and service plans to your device calendar."
calendarSync_enabled                          → "Sync to device calendar"
calendarSync_destination                      → "Calendar"
calendarSync_destinationGoogleHelp            → "Want to sync to Google Calendar? Add your Google account in iOS Settings → Apps → Calendar → Calendar Accounts, then come back and pick the Google calendar here."
calendarSync_syncFollowUps                    → "Follow-ups"
calendarSync_syncDayPlans                     → "Day plans"
calendarSync_syncRecurringPlans               → "Recurring plans"
calendarSync_syncNow                          → "Sync now"
calendarSync_lastSynced                       → "Last synced {{when}}"
calendarSync_syncingProgress                  → "Syncing {{current}} of {{total}}…"
calendarSync_recentIssues                     → "Recent issues"
calendarSync_retry                            → "Retry"
calendarSync_retryAll                         → "Retry all"
calendarSync_oneWayWarning                    → "Edit follow-ups, plans, and recurring service in Witness Work — changes made in your calendar app will be overwritten on next sync."
calendarSync_uninstallNote                    → "If you uninstall Witness Work, you can remove these events by deleting the Witness Work calendar in the iOS Calendar app."
calendarSync_disableConfirmTitle              → "Turn off calendar sync?"
calendarSync_disableConfirmBody               → "Also remove synced events from your calendar?"
calendarSync_disableConfirmRemove             → "Remove events"
calendarSync_disableConfirmKeep               → "Keep events"
calendarSync_disableTypeConfirmBody           → "Also remove existing {{type}} events from your calendar?"
calendarSync_switchConfirmTitle               → "Switch calendar?"
calendarSync_switchConfirmBody                → "Move existing events from {{from}} to {{to}}?"
calendarSync_switchConfirmMove                → "Move events"
calendarSync_switchConfirmLeave               → "Leave events behind"
calendarSync_backfillConfirmTitle             → "Sync to your calendar?"
calendarSync_backfillConfirmBody              → "This will add about {{count}} events to your calendar."
calendarSync_backfillConfirmContinue          → "Continue"
calendarSync_inviteBanner                     → "New: sync to your calendar"
calendarSync_iCloudUnavailableWarning         → "We couldn't find an iCloud calendar source — events will only show on this device. Sign in to iCloud or pick a different calendar."
calendarSync_writeOnlyDegradeWarning          → "Witness Work has write-only calendar access. Multi-device sync and recovery features require full access — open iOS Settings to upgrade."
calendarSync_permissionRequired               → "Calendar permission required"
calendarSync_openSettings                     → "Open Settings"
calendarSync_defaultCalendarName              → "Witness Work"
calendarSync_followUpTitle                    → "Follow-up: {{name}}"
calendarSync_followUpUnknownContact           → "Follow-up: (Removed contact)"
calendarSync_dayPlanDefaultTitle              → "Service plan"
calendarSync_recurringPlanDefaultTitle        → "Recurring service"
returnVisitDurationDefault                    → "Default follow-up duration"
returnVisitDurationDefault_description        → "Used when adding a follow-up to your calendar."
paywallFeatureCalendarSync                    → "Calendar sync"
```

## Implementation order (TDD-first, public API first)

1. **`src/lib/calendarSync/types.ts`** — type definitions.
2. **`src/lib/calendarSync/__tests__/index.test.ts`** — write contract tests for the public API. Mock `expo-calendar`. Tests fail.
3. **`src/lib/calendarSync/__tests__/mappers/*.test.ts`** — entity → EKEvent mapping tests. Pure functions; fully unit-testable.
4. **`src/lib/calendarSync/mappers/*.ts`** — implement until mapper tests pass.
5. **`src/lib/calendarSync/hash.ts`** — `buildSnapshot()` + tests.
6. **`src/lib/calendarSync/__tests__/dedup.test.ts`** — breadcrumb scan, claim-before-create, post-create reconcile.
7. **`src/lib/calendarSync/dedup.ts`** + **`calendar.ts`** + **`permissions.ts`** — implement until dedup tests pass.
8. **`src/stores/calendarSync.ts`** — Zustand store + MMKV persist.
9. **`src/lib/calendarSync/engine.ts`** + **`reconcile.ts`** — debounce, write lock, suppression, chunking, tombstone scan.
10. **`src/lib/calendarSync/index.ts`** — wire public API to engine. Re-run contract tests; should now pass.
11. **`src/hooks/useCalendarSyncEngine.ts`** + mount in `App.tsx`.
12. **Regression test for `payload.ts`** asserting `useCalendarSync` is excluded.
13. **`src/screens/settings/CalendarSyncScreen.tsx`** + entry in `PreferencesScreen.tsx`.
14. **`returnVisitDurationDefault` UI** in `ConversationsPreferencesSection.tsx`.
15. **Inline invite banner** on schedule screen + `calendarSyncBannerDismissedAt` pref.
16. **Paywall row** in `PaywallScreen.tsx`.
17. **`expo-calendar` install** + `app.json` plugin config + Info.plist permission strings.
18. **en-US.json keys** added.
19. **Manual smoke test** on a development build with iCloud, Local, and Google-backed calendars.
20. **Add code comment**: `// TODO(perf): consider react-native-worklets-core if JS thread blocked >100ms during sync` near the chunking loop in `engine.ts`.

## Rollout

- Direct ship in next regular version bump (no remote feature flag — opt-in via toggle is the gate).
- Release notes call out the feature.
- Existing-user discovery: the small inline banner on the schedule screen.
- New-user discovery: paywall feature row + organic settings discovery (no onboarding step).

## Design decisions reference

Quick lookup of every decision made during planning, in case implementation surfaces ambiguity:

| Area                         | Decision                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| Scope                        | Follow-ups + recurring plans + day plans (no service reports). Per-entity toggles, all default on. |
| Provider                     | `expo-calendar` only. Google Calendar reached via iOS account integration.                         |
| Destination                  | Auto-create one "Witness Work" calendar in iCloud (fallback Local). User can re-target via picker. |
| Identity                     | Per-device `useCalendarSync` mapping store + breadcrumb URL on every event.                        |
| Multi-device dedup           | Claim-before-create scan; post-create reconcile keeps oldest by `creationDate`.                    |
| One-way enforcement          | External edits silently overwritten on next sync. Documented in footer copy.                       |
| Follow-up title              | `Follow-up: <contact name>`                                                                        |
| Follow-up notes              | Topic + deep link                                                                                  |
| Follow-up location           | Address + geo coordinate                                                                           |
| Follow-up duration           | New `returnVisitDurationDefault` pref, default 30 min                                              |
| Calendar alarms              | None (in-app notifications stay source of truth)                                                   |
| Privacy mode                 | Not in v1 (rely on calendar choice)                                                                |
| Plan title                   | `note` if present, else generic                                                                    |
| Plan notes                   | Deep link only                                                                                     |
| Time-of-day fallback         | All-day event                                                                                      |
| Plan/recurring overlap       | No coordination — recurring plan + standalone day plan are independent                             |
| `BI_WEEKLY`                  | Collapsed to weekly with `interval * 2`                                                            |
| Recurring exceptions         | Per-instance API (no EXDATE on rule)                                                               |
| Recurring overrides          | Detached instances via `instanceStartDate`                                                         |
| Rule change handling         | Delete + recreate parent series                                                                    |
| Snapshot dedup               | JSON.stringify of mapped fields, string compare                                                    |
| Triggers                     | Real-time + foreground + manual. No BackgroundTasks.                                               |
| Off-thread strategy          | Yield-aggressively for v1; TODO comment for worklets upgrade                                       |
| Loop prevention              | Idempotence invariant + suppression flag + per-entity write lock + auto-resume                     |
| Settings entry               | Pushed dedicated screen from PreferencesScreen                                                     |
| Initial enable               | 5-step flow with backfill confirmation modal                                                       |
| Backfill scope               | Forward-looking only for follow-ups + day plans; full series for recurring plans                   |
| Last-sync display            | Relative time + per-entity retry; cap errors at 20                                                 |
| Disable cleanup              | Confirm + wipe + progress, default Remove                                                          |
| Calendar switch              | Confirm + move + progress, default Move                                                            |
| Entity-level deletes         | Cascading, no confirmation                                                                         |
| App uninstall                | Document cleanup path in settings footer                                                           |
| Contact soft-delete          | Auto-delete the follow-up event; recreate on contact recover                                       |
| Time zones / DST             | Local-day for all-day; current TZ for timed; EventKit handles DST                                  |
| Indefinite recurrence        | No fake `UNTIL` — let EventKit handle natively                                                     |
| iCloud unavailable           | Fall back to Local source + one-time warning                                                       |
| Past follow-ups              | Leave existing in place but stop updating                                                          |
| Past recurring `startDate`   | Materialize full series (EventKit handles efficiently)                                             |
| Tombstones                   | `reconcileAll` scans tombstone arrays and deletes corresponding events                             |
| Sync state in iCloud payload | **Excluded** (identifier locality)                                                                 |
| `returnVisitDurationDefault` | In iCloud payload (per-user preference)                                                            |
| Engine mount                 | `App.tsx`                                                                                          |
| Hash function                | JSON.stringify + string compare (renamed `lastSyncedSnapshot`)                                     |
| Native build                 | New EAS build required                                                                             |
| iOS 17+ permissions          | Full access required (write-only degrades gracefully)                                              |
| Onboarding                   | None for new users; small inline banner for existing users                                         |
| Paywall                      | Free feature row added to comparison chart                                                         |
| Sentry                       | Unexpected errors only; breadcrumbs for normal activity                                            |
| Rollout                      | Direct ship in next version bump (no remote flag)                                                  |
| i18n                         | Add keys to `en-US.json` only; translations run later                                              |
