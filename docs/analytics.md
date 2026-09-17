# Analytics journeys

App and feature code use `analytics` from `@/lib/analytics`. Its scalar-property
contract (`capture`, `screen`, `identify`, `reset`) is independent of the SDK.
The adapter owns provider configuration and serialization; replacing the provider
should require no changes to feature instrumentation. Missing configuration or
provider errors must not block startup or user actions.

Events describe actions and outcomes, with bounded feature flags, counts, sources,
and error codes. Never send names, notes, imported text, addresses, coordinates,
contact identifiers, share tokens, or raw exception messages. Account identity is
the existing pseudonymous account ID. Sentry continues to own crash diagnostics.
Screen tracking sends route names only, including the initial route; it does not
send route parameters. Touch/text autocapture is not enabled.

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
`defaultNav`, `defaultExportMethod`, `onboardingBackfill`, `supporter`.

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

Events live at user-action boundaries to avoid counting hydration, sync, or import
writes as manual feature usage. Contact archive/recovery/favorites, annual-history editing, and many individual
preference controls remain outside explicit action coverage. Native widget-only timer interactions do not pass
through the JavaScript timer hook. Share-sheet presentation or external-app handoff
does not prove delivery/submission to another person or app.

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
