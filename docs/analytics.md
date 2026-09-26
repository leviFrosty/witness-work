# Analytics journeys

App and feature code use `analytics` from `@/lib/analytics`. Its scalar-property
contract (`capture`, `screen`, `identify`, `reset`) is independent of the SDK.
The adapter owns provider configuration and serialization; replacing the provider
should require no changes to feature instrumentation. Missing configuration or
provider errors must not block startup or user actions.

Events describe actions and outcomes, with bounded feature flags, counts, sources,
and error codes. Never send names, notes, imported text, addresses, coordinates,
contact identifiers, share tokens, or raw exception messages. Account identity is
the existing pseudonymous account ID. Crash diagnostics use the separate
`errorTracking` module from `@/lib/errorTracking`.
Screen tracking sends route names only, including the initial route; it does not
send route parameters. Each route sends at most one `$screen` per PostHog session
(sessions end after 30 minutes idle), so screen insights measure reach — users and
sessions — not repeat visits. `previous_screen` is the route before the first
visit in that session. Touch/text autocapture is not enabled.

Lifecycle autocapture sends `Application Installed`, `Updated`, `Opened` and
`Became Active`; `Application Backgrounded` is dropped in `before_send` to save
event volume.

## Development logging

Analytics uses the shared `logger` for diagnostics and its enablement policy for
PostHog's SDK debug logs. Development builds enable logging automatically; the
Developer Tools preference also enables it in production. Filter the dev
server console for `[PostHog]` to see event names and payloads (including screens,
identity, lifecycle, and surveys), feature flags, flushes, and transport errors.
Capture logs indicate queued events; flush logs show successful batch requests.
`[Analytics]` logs show initialization, enabled/opted-out status, missing
configuration, skipped calls, identity resets, and provider failures.

These diagnostics are off in production unless Developer Tools is enabled.
Set `EXPO_PUBLIC_SILENT=true` or `1`
before starting the dev server to silence them without disabling analytics.

## Onboarding and activation

Use `onboarding_started` / `onboarding_resumed`, `onboarding_step_viewed`,
`onboarding_step_completed`, and `onboarding_completed` for the main funnel.
Break down by `step_id`, rather than numeric position: conditional steps mean
position and total vary. Back, jump, and skip events explain deliberate navigation.
A skipped step can also have a completed event: completed means the user advanced,
not that they filled in every optional field. Time on step (`elapsed_ms`) is wall
clock time and may include time spent in another screen or in the background.

Stable step IDs:
`hero`, `founderNote`, `privacyFirst`, `pickUpWhereLeftOff`, `publisherType`,
`intentPicker`, `profileSetup`, `pioneerDate`, `yourPlanPreview`, `notifications`,
`defaultNav`, `defaultExportMethod`, `onboardingBackfill`.

Notification permission outcomes and import availability/outcomes help distinguish
friction from an intentional skip. iCloud Restore completes onboarding directly,
with `completion_method: icloud_restore`; the guided path uses `guided`.
Home checklist interactions cover activation after the guided flow.

Do not interpret absence of an immediate completion as an explicit abandonment.
Measure drop-off with an observation window and allow resumed onboarding.

## Imports

Filter on `import_type` (`notes`, `mytime`, `icloud`, `backup_json`) and `source`.
The onboarding chooser records `import_type_selected`. Shared lifecycle events
include `import_started`, `import_preview_ready`, `import_failed`, and cancellation,
retry, stop, reset, or undo events where supported.

Completion events retain existing useful names:

| Import         | Committed data event                      |
| -------------- | ----------------------------------------- |
| Notes Import   | `notes_import_accepted`                   |
| MyTime         | `import_completed`, `import_type: mytime` |
| iCloud Restore | `import_completed`, `import_type: icloud` |
| JSON backup    | `backup_imported`                         |

A Notes Import preview is not a completed import. Its `empty` and warning counts
separate an empty result from a failure. The ledger persists original onboarding
attribution across background work, relaunches, and refinements. Legacy entries
without attribution use `unknown`. Each processing attempt may emit a start,
including resumptions; these are attempts, not unique imported documents.

## Backups and reminders

| Journey                      | Events                                                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Home reminder                | `backup_reminder_viewed`, `backup_reminder_clicked`, `backup_reminder_dismissed`                                                         |
| Reminder preferences         | `backup_reminders_enabled_changed`, `backup_reminder_frequency_changed`                                                                  |
| JSON export                  | `backup_export_started` → `backup_file_created` → `backup_share_sheet_requested` → `backup_exported`; `backup_export_failed` on failure  |
| JSON restore                 | `import_started` → `import_file_selected` → `import_commit_started` → `backup_imported`; `import_cancelled` or `import_failed` otherwise |
| iCloud restore               | Existing `icloud_restore_probe_result`, `import_started`, `import_completed`, `import_failed`, and `onboarding_import_skipped`           |
| iCloud photo restore consent | `icloud_restore_images_prompted`, `icloud_restore_images_requested`, `icloud_restore_images_skipped`                                     |

Reminder events include `source: home`, `variant: full | compact`, and
`frequency_days`. A view means the reminder rendered on the focused Home screen,
once per mounted reminder/focus visit; it does not verify scroll visibility or
represent a delivered push notification. Dismissal snoozes the existing reminder
by updating `lastBackupDate`; it never emits a backup completion event. Therefore
that preference is not proof of a saved backup. Preference events only fire for
changed values from the controls, not hydration or restored preferences.

JSON export and restore events retain `source: settings` and add
`entry_point: settings | backup_reminder` to connect reminder clicks to subsequent
actions. JSON restore events use `import_type: backup_json`. Export failures carry
`stage: sharing_availability | write_file | share_sheet`; restore failures carry
`stage: file_picker | read_file | validate_file | migrate | restore` and bounded
`error_code` values. Terminal export/restore events include wall-clock `elapsed_ms`
(including time spent in a picker, share sheet, or background).

`backup_file_created` means the temporary export file was written.
`backup_share_sheet_requested` precedes the native sharing call. The historical
`backup_exported` event means that call resolved; its `outcome: unknown` explicitly
reflects that Expo resolves on both sharing and cancellation. It cannot establish
that a backup was saved or distinguish an export cancellation. File names, paths,
contents, and raw errors are never attached to these analytics events.

iCloud photo consent events measure the choice only, not successful image
downloads. Background iCloud replication remains separate from these manual
backup/restore journeys.

## Paywall and Supporter

Use `paywall_opened` for entry intent and `paywall_viewed` for the rendered screen.
Break down by `source`, and `feature` for feature gates. Sources distinguish the
heart entry, settings, home nudge, onboarding, Notes Import limit, and feature gates.
Nudge and feature-gate view/click/dismiss events measure the earlier funnel.
Nudge impressions mean a card rendered on the focused Home screen, not verified
intersection with the visible scroll viewport.

Selection events cover tier, billing, price, and expanded options. Purchase events
cover start, completion, cancellation, and failure. Use `tier` to distinguish a
one-time tip from a Supporter purchase. Restore events distinguish success, no
purchases, and failure. `paywall_closed` includes whether a purchase occurred and
wall-clock duration; a successful purchase can also close the screen.

Purchase completion is a client StoreKit result, not a renewal/refund/revenue
ledger. External billing lifecycle analysis still requires server-side billing
integration. Closing the app is not a navigation close event.

## Feature usage

Instrumented actions include:

- Contact create/update and Visit create/update/delete paths, Custom Fields, Follow-ups, and
  safe flags such as Not at Home, Bible Study, and reminders.
- Time Entries, checkbox participation (including the widget deep link), timer
  actions, Time Rollover requests/dismissal/undo, and Service Report export actions.
- Day and Recurring Plans, including edit/delete scope, and Assistant preview,
  acceptance, dismissal, and undo.
- Map selection, search opening, and Marker movement, without search text or
  coordinates.
- Map onboarding's location step: `map_location_prompt_viewed`,
  `map_location_permission_result` (`granted` boolean only, never coordinates),
  and `map_location_prompt_skipped`.

Events live at user-action boundaries to avoid counting hydration, sync, or import
writes as manual feature usage. Contact archive/recovery/favorites, deleting a Service Year, and many individual
preference controls remain outside explicit action coverage. Native widget-only timer interactions do not pass
through the JavaScript timer hook. Share-sheet presentation or external-app handoff
does not prove delivery/submission to another person or app.

## Role History

`role_period_set` records a committed change to which Publisher role applied to
which months. Properties: `source` (`settings`, `month_chip`), `role` (the
Publisher enum value, or `regularAuxiliaryReduced` for the 15-hour auxiliary
status), `scope` (`from_month`, `single_month`, or `all_months`), and for Settings
changes `months_back` (how many months before the current month the change starts,
for `from_month`) and `reset_future_goals`. Dismissing a status sheet sends
nothing and leaves the role unchanged. Onboarding role selection is covered by the
onboarding events instead.

The Service History editor records `service_history_viewed` once per Service Year
shown and `service_history_saved` on Save. Both carry `source` (`year_tab`,
`add_earlier_year`, `settings`) and `service_years_back` (0 = the latest Service
Year with a finished month). `service_history_saved` adds `months_status_changed`
and `months_time_added` counts. Leaving without saving is the abandonment signal:
a `service_history_viewed` with no following `service_history_saved`.

## iCloud Sync and Help Center

`icloud_sync_enabled_changed` records committed enable/disable transitions with
`enabled` (boolean) and `source` (`settings`, `supporter_default`,
`supporter_lapse`, or `onboarding_restore`). Filter `source: settings` for manual
switch changes. Enabling is recorded only after the preference changes, including
first-enable collision resolution; canceled/unavailable flows and unchanged
values emit nothing. This measures the sync setting, not successful data transfer.
Hydration and developer resets are not instrumented.

`help_center_opened` records navigation from `settings` or `paywall`. The existing
`paywall_faq_clicked` event remains available for the paywall funnel. Screen events
for `FAQ` separately record arrival at the Help Center.

## Validation and analysis

Run `pnpm run typecheck`, `pnpm run lint`, and `pnpm run testFinal`.
Adapter tests cover missing configuration, property serialization, and provider
failure isolation. Import tests cover persisted attribution and distinguish preview
readiness from acceptance.

Before relying on production funnels, verify delivery from an iOS build configured
with the analytics project token/host: complete and resume onboarding, try each
import path, cancel a purchase, dismiss a nudge, and perform representative feature
actions. Filter `app_variant: development` or `development_mode: true` from production analysis. No hosted dashboards
or live ingestion verification are created by this code change.

## Surveys

The app's `SurveyProvider` uses PostHog's built-in `PostHogSurveyProvider` to
automatically fetch and render eligible **Popover** surveys after onboarding.
Create and launch future popover campaigns in PostHog without adding IDs to the
app or shipping another release. Questions, appearance, audience, and recurrence
follow the installed React Native SDK's capabilities and cache/refresh behavior.
New app-specific events/properties or unsupported SDK features still need an app
change. Disable partial-response collection for these campaigns so dismissal
does not submit unfinished answers. Popover translations use SDK language detection.
The provider reuses the existing client and does not enable touch/screen
autocapture or session replay.

### Supporter invitations

The Home feedback invitation uses the same PostHog client and pseudonymous account
identity as ordinary analytics. Survey responses are an explicit exception to the
structural-event contract: text deliberately submitted in the SDK survey is sent
as `survey sent` with PostHog's question IDs and response properties. Do not attach
Contacts, Notes, ministry records, or other app text. Dismissing the card or modal
sends `survey dismissed` without partial response text. No session replay or touch
capture is enabled by this integration.

PostHog manages the two API campaigns, their questions, translations, availability,
and targeting. RevenueCat-based local eligibility distinguishes current paid
access from a recent confirmed lapse. See [ADR 0013](adr/0013-supporter-feedback-surveys.md)
for campaign links, default recurrence/dismissal behavior, and rollout steps.

## Error tracking

Use `errorTracking` from `@/lib/errorTracking` for diagnostics. Feature code must
not import the provider SDK or pass provider-specific options:

```ts
errorTracking.captureException(error, { iCloudSync: 'push' })
errorTracking.captureMessage('Invalid remote payload', { level: 'warning' })
errorTracking.addBreadcrumb({
  category: 'sync',
  message: 'Upload started',
  data: { itemCount: 3 },
})
```

`setContext` supplies app-level metadata for JavaScript diagnostics. Native
crashes retain the native SDK's app/device metadata and mirrored breadcrumbs;
the React Native SDK does not mirror custom JavaScript context to native reports.
Reporting is disabled in development builds. The module owns expected
error filtering and failure isolation; diagnostic calls must never interrupt a
user action. Breadcrumbs provide bounded context for errors rather than creating
separate product-analytics events. Keep their data structural: no contact names,
addresses, notes, credentials, file contents, or share links.

PostHog is the current implementation. Provider configuration, automatic capture,
and source-map/native-symbol uploads belong to the shared implementation and
build setup, so changing providers does not require changing feature call sites.
