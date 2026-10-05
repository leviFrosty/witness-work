# Analytics journeys

App and feature code use `analytics` from `@/lib/analytics`. Its scalar-property
contract (`capture`, `screen`, `reset`) is independent of the SDK. Missing
configuration or provider errors must never block startup or user actions.

## Event budget and retention policy

Permanent events must answer a concrete question about activation, Supporter
conversion, completion of a core workflow, meaningful feature adoption, or an
actionable failure. Register their names in
[`analyticsEvents.ts`](../src/lib/analyticsEvents.ts); `analytics.capture` accepts
only that union, and the provider rejects any other usage event before ingestion.
The registry is the complete current business-event catalog. Review added names
and properties in the same change as the feature and document the product
question here. Prefer one successful outcome to a separate event for every click,
intermediate step, preference, or background success.

The October 2026 reduction retains 121 business event types and removes 133.
Generic menu actions, navigation/keyboard/sidebar interactions, search/FAQ actions,
cosmetic preferences, repetitive background maintenance, duplicate notification
routing, and speculative paywall experiments have no permanent event. Data
creation outcomes remain; ordinary Contact, Visit, Plan, and mileage edits no
longer send separate update events. Time Entry edits/deletes remain because they
measure changes to the app's core recorded service activity.

Usage requires `appVariant: production`, development mode off, and hydrated
analytics consent. Beta, development, and missing/unknown variants do not ingest
usage, including restored queues. Feature flag requests, surveys, and crash
reporting retain their independent behavior. This is enforced in `before_send`,
queue restoration, and every delivery/retry attempt. SDK `$set`, `$identify`,
`Application Updated`, `Application Backgrounded`, and other unregistered
automatic events are discarded. Touch/text autocapture and session replay stay off.

| Event                                                                             | Retained frequency / interpretation                                                                                           |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `$screen`                                                                         | One route per PostHog session; reach rather than repeated navigation. Sessions expire after 30 minutes idle.                  |
| `Application Installed`, `Application Opened`                                     | Installation and cold-launch signals. All launch URLs are removed at capture and delivery, including legacy anonymous queues. |
| `Application Became Active`                                                       | Once per UTC day per anonymous installation; daily active reach, not foreground count.                                        |
| `onboarding_checklist_viewed`, `supporter_nudge_viewed`, `backup_reminder_viewed` | Once per UTC day and bounded source/variant context. Measure daily reach.                                                     |
| `timer_action_completed`                                                          | `action: started` only, once per session. Measures timer adoption, not pauses/resets or exact timer-start counts.             |
| `buddies_opened`                                                                  | Once per session and source.                                                                                                  |
| `buddies_push_registration`                                                       | Once per session for each outcome/reason; recovery and distinct failures remain visible.                                      |
| `icloud_restore_probe_result`                                                     | Once per session for each status/source; automatic repeated probes are suppressed.                                            |
| Supporter gate, purchase, and core outcome events                                 | Every meaningful occurrence; placement visits and `gate_flow_id` attribution remain intact.                                   |
| `$feature_flag_called`                                                            | Once per UTC day and flag/value, with SDK experiment metadata.                                                                |

[`analyticsFrequency.ts`](../src/lib/analyticsFrequency.ts) persists only the UTC
day and bounded event/context keys in a separate MMKV store; it stores no identity
or private payloads. Daily caps survive app restarts. Session caps are in memory.
Resetting the anonymous identity clears both. A storage failure falls back to the
in-memory daily cap. Caps are applied at capture, never reapplied during retries.

Changed impression frequencies affect denominators: nudge/checklist insights now
measure daily reach, and screen insights measure session reach. Do not compare raw
event counts across this rollout without accounting for the change. Locked
Supporter placement impressions deliberately remain once per visible visit.

## Privacy and user choice

Event properties are structural: bounded sources, feature/variant keys, counts,
booleans, and error codes. Never send names, notes, imported text, addresses,
coordinates, contact/Visit IDs, share tokens, URLs, or raw exception messages.
Screens send route names and the previous route only, never route parameters.
Diagnostics use `errorTracking` from `@/lib/errorTracking`.

The provider uses `personProfiles: never`; the adapter has no `identify`, and
account/RevenueCat IDs are never usage identities. The SDK's random on-device
identifier supports sessions and stable rollouts. Do not add identify/alias/group
or person updates; put bounded breakdowns on the outcome event instead. GeoIP
remains available; disclose country-level location in the privacy policy.

On upgrade, `AnonymousPostHog.setupBootstrap` clears legacy identified state
before startup requests, rotates linked identifiers, and drops that legacy queue,
including diagnostics/surveys which may carry the account ID. App-version metadata
and survey history survive. Anonymous installations keep their identifiers on
later launches; their queued events are pruned by the current retention policy.
Every delivered batch also scrubs share links and removes launch URLs.

`analyticsEnabled` (default on, per device, not synced) controls usage only.
`analyticsConsent.ts` publishes the preference at module load, after hydration,
and on changes into the store-free policy module; the gate starts closed.
Withdrawal synchronously resets the random identifier and prunes pending usage;
a rapid off/on cannot revive it on a network retry. Survey history and normal
retained SDK properties survive. The separate SDK `DeviceId` remains for flag
requests/native integrations; it is not the usage-event identity. Flag requests
remain outside the usage switch. An HTTP request already underway cannot be recalled. The switch lives in Settings under Misc and is explained in onboarding.
Keep copy accurate: structural analytics exist, and intentional survey text or
opt-in diagnostic attachments are exceptions described below.

## Feature flags and experiments

`useInitializeFeatureFlags` fetches flags without reporting exposure. It keeps
flags closed when unavailable and never restores visibility from stale SDK cache.
`useFeatureFlag` uses boolean rollouts; `useFeatureFlagValue` exposes boolean or
string values for multivariate experiences. The loader subscribes to SDK flag updates, including identity-reset reloads,
while rejecting cached values from failed, partial, or quota-limited refreshes.
Those failures close the gates until a successful evaluation. A request already
in flight when identity resets can briefly publish its earlier assignment before
the SDK reload for the new identity completes. Only a
consuming hook with a loaded value for the current anonymous identity asks the SDK to report `$feature_flag_called`; repeated reads of the same
flag/value are deduplicated by the SDK and capped to daily reach across launches. The read is checked against the rendered
variant before reporting. Consent and the production gate apply to
exposure events, while flag requests and visibility remain available when usage
is disabled. These are evaluated readers, not proof someone tapped the feature.

Read experimental flags at the experience boundary. Use a retained completion
outcome as the primary metric; add a bounded variant property only when needed.
Additional micro-interactions require an active experiment, a named question,
and an expiry/removal plan. The audit found no active PostHog experiments, so
speculative tier/billing/price/options/legal-link paywall events were removed.

## Core workflows and feature adoption

| Product question                                  | Retained events / context                                                                                                                                                                |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Are people recording meaningful service activity? | `time_entry_created`, `time_entry_updated`, `time_entry_deleted`, `contact_created`, `visit_created`, `plan_created`, `service_history_saved`. Counts and bounded workflow sources only. |
| Are follow-ups completed or rescheduled?          | `follow_up_card_completed`, `follow_up_dismissed`, `follow_up_rescheduled`.                                                                                                              |
| Is the scheduling assistant useful?               | `assistant_preview_opened`, recommendation accepted/dismissed/undone.                                                                                                                    |
| Are publisher settings and year rollover used?    | `role_period_set`, `hours_logging_changed`, `time_rollover_apply_requested`, `time_rollover_undone`.                                                                                     |
| Are reports exported?                             | `service_report_export_requested`, `service_report_exported`, `service_report_export_dismissed`. Share-sheet resolution has platform limitations; it is not proof of submission.         |
| Are new features adopted?                         | Timer start/failure, Buddies open/same-time planning, `custom_field_created`, calendar connection/disconnection/failure, and map permission results.                                     |
| Is mileage used and exported?                     | Tracking changed, vehicle/trip/fuel added, data deleted, report exported/export failed. Low-value row actions, unit preferences, and edits are dropped.                                  |

Existing structural properties and sources remain on retained events. No saved
content, record identifiers, appointment dates, or exception text is attached.
Buddies and Notes Import are rollout-gated; iCloud and Calendar Sync features
retain their iOS availability rules.

## Onboarding and activation

Use `onboarding_started` / `onboarding_resumed`, `onboarding_step_viewed`,
`onboarding_step_completed`, `onboarding_step_skipped`, and `onboarding_completed`.
Break down by stable `step_id`, since conditional steps change numeric positions.
Back/jump/button micro-interactions and hero-animation skipping are dropped.
A skipped step can also complete: completion means advancing, not filling every
optional field. `elapsed_ms` includes background time and time on other screens.

Stable step IDs: `hero`, `founderNote`, `privacyFirst`, `pickUpWhereLeftOff`,
`publisherType`, `intentPicker`, `profileSetup`, `pioneerDate`, `yourPlanPreview`,
`notifications`, `defaultNav`, `defaultExportMethod`, `onboardingBackfill`.

Notification permission request/result, import availability/skip, and backfill
completion distinguish friction from deliberate choices. `completion_method` is
`guided`, `icloud_restore`, or `backup_restore`. Home checklist view/completed/
dismissed remains; individual manual checkbox toggles are dropped. Measure
onboarding drop-off over an observation window that allows resumption.

## Imports and backups

Filter by `import_type` (`notes`, `mytime`, `icloud`, `backup_json`) and `source`.
Retain type selection, start, preview readiness, completion, failure, cancellation,
stop, and undo. Intermediate file selection, commit start, retry/reset clicks,
preview edits, prompt toggles, and warning openings are dropped.

| Flow                    | Outcomes                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Notes Import            | `notes_import_submitted`, `notes_import_refined`, `notes_import_accepted`; a preview is not committed data.                        |
| MyTime / iCloud Restore | `import_completed` with the import type.                                                                                           |
| JSON restore            | `backup_imported`; started/cancelled/failed uses `import_type: backup_json`.                                                       |
| JSON export             | `backup_export_started` → `backup_exported`, or `backup_export_failed`. File-created and share-sheet-requested stages are dropped. |
| Backup reminder         | View (daily reach), clicked, dismissed; reminder preference events are dropped.                                                    |
| iCloud photo consent    | `icloud_restore_images_prompted`, requested, skipped; replace confirmation remains.                                                |

Notes previews retain `empty`/warning counts and the ledger's original source
across background work, relaunches, and refinements. Each processing attempt can
start, so start counts are attempts, not unique documents. Export/restore retains
bounded `entry_point` (`settings` or `backup_reminder`), failure stage/error code,
and wall-clock elapsed time. `backup_exported` means Expo's sharing call resolved;
`outcome: unknown` covers both sharing and cancellation and cannot establish that
a backup was saved. Reminder dismissal snoozes without changing `lastBackupDate`.

Restore probe status is `probing`, `found`, `noBackup`, `unavailable`, or
`incomplete`; each distinct status survives the session cap. Photo consent does
not establish that photos downloaded. No file paths, filenames, or contents are
usage properties.

## Paywall and Supporter

Use `paywall_viewed` for rendered entry and its `source`/`feature` for attribution.
The preceding navigation-intent event `paywall_opened` is removed. Nudge and
feature-gate view/click/dismiss events retain the earlier funnel. Nudge visibility
changes record permanent hiding. Daily nudge impressions measure daily reach,
while clicks/dismissals remain uncapped.

Retain purchase start/completion/cancellation/failure, offering failure, restore
start/success/empty/failure, and `paywall_closed`. Keep `tier` to distinguish tips
from Supporter access, with final billing/product choice on purchase events.
Intermediate tier, billing, price, expansion, FAQ, and legal-link clicks are
removed. Closing the app is not a navigation-close event. A completed purchase
is a client RevenueCat result, not a renewal/refund or revenue ledger.

### Supporter feature conversions

All `IsSupporter` placements use the same ordered journey:

| Stage                  | Event                            | Meaning                                                                                                                                           |
| ---------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visible locked feature | `supporter_feature_gate_viewed`  | At least half of the gate's header is visible in the window and its nearest scroll/popover viewport, on a focused screen while the app is active. |
| Feature tap            | `supporter_feature_gate_clicked` | The locked feature was tapped.                                                                                                                    |
| Supporter sheet        | `supporter_gate_viewed`          | The educational sheet opened. This existing event is a sheet view, not a feature impression.                                                      |
| Sheet action           | `supporter_gate_clicked`         | The sheet's support action was tapped.                                                                                                            |
| Paywall                | `paywall_viewed`                 | The paywall rendered with `source: feature_gate`.                                                                                                 |
| Checkout               | `supporter_purchase_started`     | A purchase was requested; filter `tier: supporter`.                                                                                               |
| Conversion             | `supporter_purchase_completed`   | The purchase succeeded with `tier: supporter` and `source: feature_gate`.                                                                         |

These events carry `feature`, `source_screen` (the originating route name),
`gate_surface`, `gate_placement` (`feature / source_screen / gate_surface`), and
`gate_flow_id`. The same attribution accompanies sheet dismissal, paywall
interaction and close, offering failures, purchase cancellation/failure, and
restore outcomes. It stays attached to the paywall route, so later screens do
not overwrite the original screen. Direct paywall entry has no gate attribution.

| Feature             | `gate_surface`       | Placement                                                                    |
| ------------------- | -------------------- | ---------------------------------------------------------------------------- |
| `customAccentColor` | `accent_color`       | Accent picker in `PreferencesPersonalization`.                               |
| `customAccentColor` | `avatar_background`  | Avatar picker, attributed to the route hosting it.                           |
| `customAccentColor` | `contact_background` | Contact background editor, attributed to the route hosting it.               |
| `customAppIcon`     | `app_icon`           | Icon picker in `PreferencesAppIcon` (iOS only).                              |
| `iCloudSync`        | `icloud_sync`        | Sync gates in `PreferencesiCloud` and `PreferencesiCloudDevices` (iOS only). |

Impressions are sent once per visible placement visit. Scrolling or rerendering
does not repeat them; returning focus starts a new visit. A tap before the first
visibility measurement records the impression first. Supporters and other users
who already have access do not produce locked-feature impressions. Visibility
is sampled every 500 ms until the first impression, then sampling stops.

`gate_flow_id` is a random, temporary visit identifier carried from impression
through checkout. It is never persisted, used as identity, or linked to an
account. It prevents a purchase from being credited to every feature previously
seen. Only route names and bounded feature/placement keys describe the origin;
no contact IDs, names, entered text, or route parameters are sent.

The [Supporter feature conversions dashboard](https://us.posthog.com/project/492895/dashboard/2165410)
contains rankings by feature, source screen, and placement; a feature-wide
ranking; an ordered visibility-to-purchase funnel; and a legacy tap-to-purchase
funnel. The rankings sort by view-to-purchase rate descending, then purchaser
count and viewer count. Compare the audience counts alongside view-to-purchase,
tap-to-purchase, and checkout-to-purchase rates before choosing a placement.

The [ranking SQL](analytics/supporter-feature-conversions.sql) is a custom
definition; the governed metric catalog was consulted and had no matching
metric. It counts unique anonymous app installations, requires all seven steps
in order on the same `gate_flow_id` within seven days of the impression, and
filters to production builds with development mode off and emulator status
false. Tips, restores, and unrelated purchases do not count as conversions.
The dashboard defaults to the last 30 days and its date filters apply to every
stage; recent views can still convert, and a purchase outside the selected dates
is excluded. Installations can appear in more than one placement row; do not
sum those rows. The feature-wide ranking deduplicates across placements.

Visibility and screen attribution begin with this instrumentation release; old
events cannot reconstruct them. The legacy chart uses the existing events and
same-feature breakdown, with approximate attribution because they lack
`gate_flow_id`. Its denominator is taps, so compare it with the new
tap-to-purchase rate, not the view-to-purchase rate. Analytics opt-out and device
identity resets still apply; these are installation counts, not cross-device
person counts or a billing ledger.

## iCloud Sync and recovery

Retain committed enable/disable transitions (`icloud_sync_enabled_changed`) and
bounded `source`: settings, supporter default/lapse, or onboarding restore.
Unchanged values, hydration, and developer resets do not emit transitions.
`icloud_sync_enable_deferred` keeps the bounded incomplete-read reason; paused,
upload failed/recovered, and account-changed outcomes remain.

First-enable viewed/chosen/outcome/dismissed describes conflict resolution. Manual
sync and reset retain started/outcome; reset adoption remains. Image toggle/outcome,
automatic enable outcome, cloud photo removal, and device remove/failure remain.
Device list views, generic sync notices, and resolution-link clicks are removed.
A local manual-sync completion does not prove Apple's cloud replication finished.
No device IDs/names, filenames, records, or payloads are included.

<<<<<<< HEAD
`kind` is one of `rollover`, `previous_report`, `auxiliary_month`, `backup`,
`data_protection_retention`, `missed_follow_up`, `reminder` (a local Follow-up,
Plan, or returning-Contact reminder that fired; `open` action), `buddies`,
`notes_import`,
`whats_new`, `milestone_update`, `supporter_nudge`, `supporter_survey`,
`calendar_sync` (the one-time Calendar Sync invitation; `set_up` and `not_now`
actions, outcome in `calendar_connected` / `calendar_sync_failed`), or
`dev_test` (Tools screen test items; `open_tools` and `bump` actions). Items never send their text, names, or
ids. Tapping a row counts as its first action. Buddies rows report their own
actions under `kind: buddies`, once per tap: `open`, `going`, `declined`,
`change_answer`, `confirm`, and `reject` (after confirming "Not who I invited").
Their long-press menu also sends `context_menu_action` (`buddy_notification`),
a separate event. An invitation or request still waiting on an answer can't be
dismissed and survives Clear All, so it never sends `notification_dismissed`.
=======
## Development logging and validation
>>>>>>> 00111145 (chore: reduce analytics event volume)

The shared logger controls SDK debug output. Development logs are on by default;
production logs require Developer Tools. `EXPO_PUBLIC_SILENT=true` or `1` silences
logs without changing analytics consent. Capture logs indicate queued events,
not proof of ingestion. Do not copy secret configuration or diagnostic payloads
into public reports.

<<<<<<< HEAD
On iOS the app icon badge shows the tray's unread count. It sends no events of
its own, since updating it isn't something the User does.

Opening the tray checks Buddies for new activity (while Buddies is in use), and
checks again every 90 seconds while it stays open. A failed check shows a slim
"Try Again" notice: `buddies_tray_sync_failed` records failures of the opening
check or a retry (not the quiet periodic checks), and
`buddies_tray_sync_retry_tapped` the retry. `reason` is `offline`, `disabled`,
`rate_limited`, or `error` — never a message.

An item that disappears because
its condition cleared (report submitted, Follow-up rescheduled) sends nothing;
compare `notifications_tray_opened` to `notification_action_tapped` for
engagement. Existing item events (`backup_reminder_*`, `supporter_nudge_*`,
`auxiliary_month_sheet_viewed`) still fire alongside, with a tray `source`.

The Time Rollover screen no longer opens at launch. Its tray item opens it, and
it comes up once per session on Progress or on the Service Report for the month
it changes, so its `time_rollover_*` events keep `source: rollover_screen`.

## Buddies push delivery

Buddies pushes carry no user content, and neither do their events: never tokens,
device or relay ids, event sequence numbers, names, or Plan details.

| Event                       | Properties                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `buddies_push_registration` | `outcome` (`registered`, `refreshed`, `failed`, `skipped`); `reason` (`permission` when skipped; failure `reason`)     |
| `buddies_push_received`     | `kind` (the push kind, e.g. `plan.invite`; `unknown` otherwise) — received while the app is in the foreground          |
| `buddies_push_sync`         | `kind`, `outcome` (`synced`, `failed`), `reason` when failed, `in_tray` (boolean, when the push named its relay event) |

`registered` means a new or changed registration reached the relay (including
the app's bundle id as its APNs topic); `refreshed` means an unchanged one was
re-sent because it was a day old, which repairs a device the relay dropped. An
unchanged registration that isn't due sends nothing. `buddies_push_sync` follows
`buddies_push_received`: whether pulling the announced event worked, and whether
it produced a tray entry (`in_tray: false` can be a change that made no entry).
Pushes tapped from outside the app are measured by the app-level notification
response handling.

## System notification taps

Taps on system notifications — local reminders and Buddies pushes — are routed
at app level, including the tap that launched the app.

| Event                 | Properties                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `notification_opened` | `source` (`local`, `push`), `kind` (`visit`, `plan`, `contact`, or `buddies`), `cold_start`                                                  |
| `notification_routed` | `source`, `destination` (`visit`, `plan`, `contact`, `buddies`, or `tray` for Buddies activity or a reminder whose record is gone), `waited` |

`waited` is true when the tap had to wait for navigation (or the Buddies flag)
at startup. Compare `notification_opened` to `notification_routed` to find taps
that never reached a screen. Neither event sends record ids, names, or push
sequence numbers.

`contact_dismissed`'s `reminder_scheduled` means notifications are allowed and
the return date is ahead; `follow_up_rescheduled`'s means the reminder time is
still ahead. The reminder reconciler does the scheduling on each device.

## Feature usage

Instrumented actions include:

- Contact create/update and Visit create/update/delete paths, Custom Fields, Follow-ups, and
  safe flags such as Not at Home, Bible Study, and reminders.
- Closing the Home Follow-up card: `follow_up_card_dismissed` with `card`
  (`approaching`; `missed` before missed Follow-ups moved to the notifications
  tray) and `count` (Follow-ups on it). The card stays closed until a new or
  rescheduled Follow-up joins it.
- Acting on the Home Follow-up card: `follow_up_card_action` with `action`
  (`talked` opens the Visit form, `not_at_home` logs one right away, `undo`
  removes that Not at Home, `reschedule`). Its menus report through
  `context_menu_action` with surface `follow_up_card`. The Not at Home it logs
  sends `visit_created` (and Undo `visit_deleted`) with `source:
'follow_up_card'`. `follow_up_card_completed` (`count`) fires when the last
  Follow-up on the card is answered while it's open; compare it to
  `follow_up_card_action` to see how often people work through the card.
- Time Entries, checkbox participation (including the widget deep link), timer
  actions, Time Rollover requests/dismissal/undo, and Service Report export actions.
- Day and Recurring Plans, including edit/delete scope, and Assistant preview,
  acceptance, dismissal, and undo. `plan_created` carries `prefilled` (true when
  the form was seeded, e.g. by a Plan row's Duplicate… or a buddy's Plan the Same
  Time). A Time Entry re-typed from its row's Change Category menu sends
  `time_entry_updated` with `source: time_report_row_menu`.
- Map selection, search opening, and Marker movement, without search text or
  coordinates.
- Map onboarding's location step: `map_location_prompt_viewed`,
  `map_location_permission_result` (`granted` boolean only, never coordinates),
  and `map_location_prompt_skipped`.
- Dropped-pin card: `map_dropped_pin_navigate_pressed` when its Navigate Here
  button opens directions (no properties, never coordinates).
- Map cards: `map_cards_toggled` when the carousel (or the wide inspector) is
  stowed or brought back, with `stowed` and `source` (`swipe` when the phone
  carousel is swiped down; `button` from the wide inspector's control;
  `peek_tap` or `peek_swipe` from the stowed cards' handle; `pin` when a pin
  tap brings them back; or `search` when opening search does).
- Buddies "Plan the Same Time": `buddy_plan_same_time_opened` when a buddy's
  Plan opens a new prefilled Plan, with `source` (`buddy_detail` or
  `buddy_plans_for_day`) and `has_start_time`. Never the buddy, day, or times;
  `plan_created` records whether it was saved.

Events live at user-action boundaries to avoid counting hydration, sync, or import
writes as manual feature usage. Contact archive/recovery/favorites and many individual
preference controls remain outside explicit action coverage. Native widget-only timer interactions do not pass
through the JavaScript timer hook. Share-sheet presentation or external-app handoff
does not prove delivery/submission to another person or app.

## Navigation

The bottom bar holds at most four destinations — Home, Schedule, Contacts,
Progress (Progress only for roles that log hours) — beside a labeled Add action.
Users can reorder (not hide) them in Preferences → Tab Order; Home stays the
launch tab. Map is a view inside Contacts and Buddies opens from Schedule's
header, so flags and features don't add tabs. Wide layouts show the same
destinations in the sidebar, plus Settings.

The tablet sidebar has a centered resize handle, switches to icons at narrow
widths, and can be hidden and restored from the page header. Width and visibility
are device-local. Hiding it keeps tablet routes and does not show the bottom bar.
Sidebar instrumentation uses only bounded modes and sources, never saved widths
or personal data:

| Event                        | When / properties                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sidebar_viewed`             | A sidebar-capable layout mounts or becomes available. `visible` (boolean), `mode` (`icons` or `labels`), including a previously hidden sidebar.                                 |
| `sidebar_visibility_changed` | The toggle is tapped. `visible` (resulting boolean), `mode` (`icons` or `labels`), `source` (`sidebar` or `header`).                                                            |
| `sidebar_resize_started`     | A horizontal drag activates on the resize handle. No properties.                                                                                                                |
| `sidebar_resized`            | A drag finishes or a screen reader adjustment changes the saved width. `mode` (`icons` or `labels`), `source` (`drag` or `accessibility`). Live drag frames do not emit events. |
| `sidebar_resize_cancelled`   | An active drag is interrupted or its handle unmounts; the saved width is restored. No properties.                                                                               |

| Event                             | When / properties                                                                                                                                                                                                                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `navigation_destination_selected` | A bottom-bar or sidebar destination is tapped. `from` and `to` (route names), `layout_variant` (`bottom_bar` or `sidebar`), `reselected` (tapped the destination already open).                                                                                                                    |
| `tab_order_changed`               | A tab is moved in Preferences → Tab Order. `order` (resulting comma-separated route names, e.g. `Home,Contacts,Schedule,Progress`; includes Progress even when hidden), `source` (`arrows` or `menu`). Long-press moves also send `context_menu_action` with `surface: tab_order_preferences_row`. |
| `quick_action_opened`             | Add is opened. `layout_variant`.                                                                                                                                                                                                                                                                   |
| `quick_action_selected`           | An Add option is chosen. `action`: `addTime`, `addPlan`, `addContact`, or `logTrip` (Mileage Tracking on). Opened without a selection is the abandonment signal; the form's own events record whether it was saved.                                                                                |
| `contacts_view_changed`           | Contacts switches workspace. `view` (`list` or `map`), `source`: `toggle` (the List / Map control), `link` (opened with a view, e.g. Home's map checklist item), or `map_empty_state` (the map's review-contacts button). The choice persists per device.                                          |
| `contacts_list_header_collapsed`  | Scrolling down the Contacts list first tucks its header away (once per app session). No properties.                                                                                                                                                                                                |
| `contacts_header_expanded`        | A compacted Contacts header is brought back by hand. `view` (`list` or `map`), `source`: `title_tap` or `header_swipe`. Scrolling back up isn't counted.                                                                                                                                           |
| `buddies_opened`                  | Schedule's Buddies button is tapped. `source: schedule_header`, `has_requests` (a request was waiting).                                                                                                                                                                                            |
| `service_report_opened`           | Progress's View Report is tapped. `source: progress_header`, `tab` (`month`, `year`, or `allTime`).                                                                                                                                                                                                |

The avatar on every root header opens the account menu: Profile, Settings,
Support WitnessWork, and Help Center. Its choices arrive as `context_menu_action`
with `surface: account_menu`. Profile opens the profile overlay (role, tenure,
and stats) from the avatar; until profile setup is done the item is
`profile_setup` instead and opens setup. That overlay used to open from Home's
profile card, which is gone along with its `profile_card` surface, so read
overlay reach from `account_menu` / `profile` from this release on. Home's
greeting line is display-only and sends nothing. On compact layouts Settings is now a pushed
`SettingsMenu` screen instead of Home's drawer, so its `$screen` reach is
comparable from this release on; compare older `Settings` counts with care. Home
still reports as `Dashboard`. The Map no longer has its own route; Contacts sends
`$screen` `Map` (`previous_screen: Contacts`, same once-per-session rule) whenever it
is focused on the map, so Map reach continues. Every Map session now also contains
Contacts, so don't compare Map-without-Contacts shares across the change.
Buddies is a pushed `Buddies` screen.

## Context menus

Every long-press `ContextMenu` and tap-to-open `PullDownMenu` records
`context_menu_action` when an item is chosen. Properties: `surface` (where the
menu lives, e.g. `contact_row`, `plan_row`, `home_section`), `action` (the item
id; submenu items are `submenu.item`, e.g. `delete.all`), and `trigger`
(`long_press`, `tap`, or `accessibility` for VoiceOver/TalkBack custom
actions). Opening a menu and closing it without choosing sends nothing; iOS
doesn't report menu presentation. Actions keep their own feature events (e.g.
`visit_deleted`), so this event measures which menus and items people use, not
whether the action succeeded.

Select mode on list screens records `list_selection_started` with `surface` and
`source` (`menu` from the header's More menu or Select button, `row` from a
row's long-press "Select", which starts with that row checked), and
`list_selection_action` with `surface`, `action`, and `count` (items affected).
Leaving Select mode without an action is the abandonment signal. Surfaces and
actions: `contacts` (`favorite`, `unfavorite`, `dismiss`, `archive`, `delete`),
`dismissed_contacts` (`undismiss`, `archive`, `delete`), `recover_contacts` (`recover`,
`delete_permanently`).

## Role History

`role_period_set` records a committed change to which Publisher role applied to
which months. Properties: `source` (`settings`, `month_card`, `year_tab` from a
Year-tab month row's menu), `role` (the
Publisher enum value, or `regularAuxiliaryReduced` for the 15-hour auxiliary
status), `scope` (`from_month`, `single_month`, or `all_months`), and for Settings
changes `months_back` (how many months before the current month the change starts,
for `from_month`) and `reset_future_goals`. Dismissing a status sheet sends
nothing and leaves the role unchanged. Onboarding role selection is covered by the
onboarding events instead.

A Kingdom Publisher (checkbox-mode standing role) can auxiliary pioneer for one
month from the notifications tray (once a month, while neither this month nor
next is auxiliary), the Home Service Report card (while one is), or Settings,
without enabling Hours Logging. `auxiliary_month_sheet_viewed` records opening
that sheet, with `source` (`notifications_tray`, `home`, `settings`) and `state`
(`none`, `this_month`, `next_month` — which month was already auxiliary). Saving
sends `role_period_set` with `source` `notifications_tray_auxiliary`,
`home_auxiliary`, or `settings_auxiliary`, `scope: single_month`, `role`
(`regularAuxiliary`, `regularAuxiliaryReduced`, or the standing role when ending
it), and `month_offset` (0 = this month, 1 = next month). A view with no
following `role_period_set` is an abandoned sheet.

The Service History editor records `service_history_viewed` once per Service Year
shown and `service_history_saved` on Save — one per Service Year with unsaved
changes, since edits are kept per year while moving between years and Save
writes them all. Both carry `source` (`year_tab`,
`year_row_menu` from an All-time year row's menu, `add_earlier_year`, `settings`) and `service_years_back` (0 = the latest Service
Year with a finished month). `service_history_saved` adds `months_status_changed`
and `months_time_added` counts. Leaving without saving is the abandonment signal:
a `service_history_viewed` with no following `service_history_saved`.

`service_year_time_deleted` records a confirmed delete of every Time Entry in a
Service Year, with `source` (`year_row_menu` from the All-time year row's menu,
`service_history` from the button at the bottom of Service History).

## Month card

The Progress → Month card shows status and goal as one line. Tapping it records
`month_card_edit_opened` with `target` (`status`, `goal`) and `via`: `menu` when
both were editable and the user picked one from the pull-down menu, `direct` when
only one was editable, `context_menu` when picked from the card's long-press menu.
Closing the pull-down without choosing sends nothing (`month_card_edit_menu_dismissed`
is no longer sent; the native menu doesn't report it).
Whether the edit was committed is `role_period_set` (status); closing a sheet
without saving is the abandonment signal.

`category_breakdown_opened` records opening the category breakdown sheet, with
`source` (`month_card` from the color key under the month bar, `year_card` from
the Service Year breakdown) and `categories` (how many categories have time).

## Year tab

`service_year_pace_scrubbed` records the first press-and-hold on the Service
Year Pace chart each time the Year tab mounts, with `tense` (`past`, `present`,
or `future` Service Year) and `has_last_year` (last Service Year's line was
shown). Further scrubbing in the same visit sends nothing. No hours, goals, or
months are sent. The chart replaced the Year tab's Projected Total card, so that
card no longer appears there.

## Service Report screen

The report screen has a month dropdown in its header and a submission-method
select above the Submit button.

| Event                           | When / properties                                                                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `service_report_month_selected` | A month picked from the header dropdown. `months_ago` (0 = current month).                                                                               |
| `submission_method_changed`     | Default submission method changed. `method`, `previous_method` (`copy`, `share`, `hourglass`, `nwpublisher`); `source` (`report_screen`, `preferences`). |

Submission itself stays on the existing `service_report_export_requested` /
`service_report_exported` / `service_report_export_dismissed` events, with
`method` and `source`: `report_screen` (the Submit button, including the other
methods in its long-press menu) or `context_menu` (Copy/Share Report from a
month's long-press menu on Home or Progress).

## Mileage

Mileage Tracking is opt-in for every role. Events never carry car names, fuel
names, notes, distances, prices, or costs — only counts, booleans, units, and
enums. `source` is where a flow started: `home_prompt`, `home_section`,
`quick_action`, `mileage_screen`, `mileage_settings`, or `trip_menu`.

| Event                                                     | When / properties                                                                                                                                                                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mileage_prompt_answered`                                 | Home's "Track mileage?" card is answered. `enabled`. The card stays until answered, so unanswered is the abandonment signal.                                                                               |
| `mileage_tracking_changed`                                | The Publisher Preferences switch is flipped. `enabled`, `source: publisher_preferences`.                                                                                                                   |
| `mileage_vehicle_added` / `mileage_vehicle_updated`       | A car is saved. `has_fuel`, `has_fuel_economy`, `created_fuel` (a fuel was added from the car form), `setup_change` (`starting` or `correct` when an edit changed fuel or fuel economy), `source`.         |
| `mileage_vehicle_archived` / `mileage_vehicle_unarchived` | A car is archived or restored.                                                                                                                                                                             |
| `mileage_vehicle_deleted`                                 | A car and its trips are deleted. `trip_count`.                                                                                                                                                             |
| `mileage_fuel_added` / `mileage_fuel_updated`             | A fuel is saved. `has_price`, `price_change` (`starting` or `correct`).                                                                                                                                    |
| `mileage_fuel_deleted`                                    | `car_count` (cars whose setup used it).                                                                                                                                                                    |
| `mileage_trip_added` / `mileage_trip_updated`             | A trip is saved. `entry_mode` (`distance` or `odometer`), `round_trip`, `has_note`, `logged_again` (seeded by Log Again Today), `source`. Opening the form without one of these is the abandonment signal. |
| `mileage_trip_deleted`                                    | `source` (`row` from the menu or swipe, `details` from the details screen or edit form).                                                                                                                   |
| `mileage_trip_shared`                                     | A trip's text is shared or copied. `source`, `method` (`share` or `copy`).                                                                                                                                 |
| `mileage_report_viewed`                                   | The Mileage screen opens or its period changes. `period` (`day`, `week`, `month`, `year`).                                                                                                                 |
| `mileage_chart_bar_tapped`                                | A bar on the Mileage screen's chart opens its day or month. `period` is the view it was tapped in (`week`, `month`, `year`); `mileage_report_viewed` follows with the new period.                          |
| `mileage_report_exported`                                 | A report is copied, shared, or exported. `method` (`copy`, `share`, `csv`), `period`, `trip_count`.                                                                                                        |
| `mileage_report_export_dismissed`                         | The share sheet closed without sharing. Same properties.                                                                                                                                                   |
| `mileage_report_export_failed`                            | Export failed. Same properties plus `reason` (`sharing_unavailable` or `error`).                                                                                                                           |
| `mileage_units_changed`                                   | `setting` (`distance` or `fuel_economy`), `unit` (the unit key or `auto`).                                                                                                                                 |
| `mileage_data_deleted`                                    | Delete All Mileage Data is confirmed.                                                                                                                                                                      |

Long-press and pull-down menus report `context_menu_action` with surfaces
`mileage_trip_row`, `mileage_report_menu`, `home_section_mileage`,
`mileage_fuel_price_history`, and `mileage_car_setup_history`.

## iCloud Sync and Help Center

`icloud_sync_enabled_changed` records committed enable/disable transitions with
`enabled` (boolean) and `source` (`settings`, `supporter_default`,
`supporter_lapse`, or `onboarding_restore`). Filter `source: settings` for manual
switch changes. Enabling is recorded only after the preference changes, including
first-enable collision resolution; canceled/unavailable flows and unchanged
values emit nothing. This measures the sync setting, not successful data transfer.
Hydration and developer resets are not instrumented.

`icloud_sync_enable_deferred` records a first enable that left sync off because
iCloud couldn't be read in full, with `source` (`settings` or
`supporter_default`) and `reason`: `scan` (the initial iCloud scan hadn't
finished), `downloading` (a remote file was still downloading), or
`newer-version` (another device writes a newer sync format). Settings shows an
"iCloud isn't ready yet" alert; the supporter default records it once and
decides again when a file lands or the app returns to the foreground.

`help_center_opened` records navigation from `settings` or `paywall`. The existing
`paywall_faq_clicked` event remains available for the paywall funnel. Screen events
for `FAQ` separately record arrival at the Help Center.

`faq_search_performed` records a nonempty Help Center query after a 400 ms pause
in typing, with `result_count` (including zero for no matches). Results update
immediately; the pause only limits event volume. Clearing the query or unmounting
the screen before the pause cancels the pending event. Search text is never sent.

| Event                                | When / properties                                                                                                                                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `help_center_question_opened`        | An answer is expanded. `question_id` is the stable FAQ entry ID; `category` is its FAQ category, including `buddies`. Collapsing an answer emits nothing.                                                                                                    |
| `help_center_resource_clicked`       | A support resource is tapped. `resource`: `bug_report`, `feature_request`, `email`, `privacy_policy`, `source_code`, or `notes_import_data_policy`. This records the request to open the resource, not a submitted report or successful external navigation. |
| `help_center_account_id_copied`      | The support account ID is successfully copied to the clipboard. No ID is captured.                                                                                                                                                                           |
| `help_center_account_id_copy_failed` | Reading or copying the support account ID fails. No ID or raw error is captured.                                                                                                                                                                             |

Help Center events never include search text, question/answer text, URLs, account
IDs, contact information, or backup contents. Opening an external resource hands
off to another app, so completion or abandonment there is not inferred.

## Settings split view

On wide layouts (iPad with the sidebar), Settings shows its list beside the open
destination. `settings_split_destination_selected` records a tap on a list row with
`destination` (the route name, e.g. `PreferencesPublisher`, `FAQ`). Screen events
cover arrival and subsection pushes inside the pane.

## Validation and analysis

Run `pnpm run typecheck`, `pnpm run lint`, and `pnpm run testFinal`.
Adapter tests cover missing configuration, property serialization, and provider
failure isolation. Tests against the pinned SDK also cover legacy identity
migration before startup requests, synchronous/asynchronous storage, offline
queues and retries, consent hydration, rapid off/on changes, and survey history preservation.
Import tests cover persisted attribution and distinguish preview
readiness from acceptance.

Before relying on production funnels, verify delivery from an iOS build configured
with the analytics project token/host: complete and resume onboarding, try each
import path, cancel a purchase, dismiss a nudge, and perform representative feature
actions. Filter `app_variant: development` or `development_mode: true` from production analysis. No hosted dashboards
or live ingestion verification are created by this code change.
=======
Run `pnpm run typecheck`, `pnpm run lint`, and the Vitest suite. Tests against the
pinned SDK cover iOS/Android capture, production filtering, unknown events, daily
and session limits, consent hydration/withdrawal/retries, legacy identity/queue
migration, URL removal, and survey history. Hook tests cover flag exposure versus
fetching, multivariate values, and opt-in behavior. Native menu tests preserve
selection and accessibility actions on both platforms after generic telemetry
removal.

This change requires an app/OTA release to reduce deployed traffic. Existing
clients continue sending their old events. No hosted dashboards, billing limits,
or campaigns are mutated by the code change. Use
[`posthog-audit-events-report.md`](../posthog-audit-events-report.md) for the
pre-change event volumes and dashboard dependencies. Review dashboard denominators
at rollout and compare production event counts by app/build/update version.
>>>>>>> 00111145 (chore: reduce analytics event volume)

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

The feedback invitation in the notifications tray uses the same PostHog client
and anonymous device identity as ordinary analytics. Survey responses are an
explicit exception to the structural-event contract: text deliberately submitted
in the SDK survey is sent as `survey sent` with PostHog's question IDs and response
properties. Do not attach Contacts, Notes, ministry records, or other app text.
Dismissing the tray item (or clearing the tray) or the modal sends `survey
dismissed` without partial response text. No session replay or touch capture is
enabled by this integration.

PostHog manages the two API campaigns, their questions, translations, availability,
and targeting. RevenueCat-based local eligibility distinguishes current paid
access from a recent confirmed lapse. See [ADR 0013](adr/0013-supporter-feedback-surveys.md)
for campaign links, default recurrence/dismissal behavior, and rollout steps.

### Buddies Alpha feedback

The Buddies screen's Alpha badge, its feedback card, and Buddies Settings open the
Buddies Feedback screen, which explains Alpha and then opens the API survey
[WitnessWork Buddies feedback (Alpha)](https://us.posthog.com/project/492895/surveys/01a0f037-23cd-0000-e818-63a4821064d8)
(`schedule: always`, so testers can send feedback repeatedly). Its ID lives in
`src/features/buddies/lib/feedback.ts`; edit questions in PostHog.

Usage events retain `buddies_feedback_submitted` (`diagnostics` boolean),
`buddies_feedback_unavailable` (survey not loaded, for example offline), and
`buddies_feedback_attachment_failed`, all with bounded `source`. Badge taps,
feedback screen views, survey starts, abandonment, and successful attachment
bookkeeping are no longer separate usage events. Explicit responses and
attachments still use the survey contract below.

**Opt-in diagnostics are the one place app data leaves the device through
PostHog.** Off by default; only when the user turns on Include Diagnostics _and_
submits the survey, the app sends `survey attachment` events (a `survey `
event, so they pass with usage analytics off, like the response itself). They
share a random `feedback_id` with the `survey sent` response, which gets it as a
session-only property:

- `kind: diagnostics` — platform, OS, device model, app version/build, locale,
  time zone, and Buddies _counts_ (never buddies' names, cards, shares, relay ids,
  or keys — that data is other people's and end-to-end encrypted).
- `kind: backup` — the same JSON backup Settings exports, gzipped and base64url
  encoded across `part`/`parts` events of ≤500KB each (PostHog drops events over
  1MB). Rebuild it with
  `node --env-file=.env scripts/buddies-feedback-backup.mjs <feedback_id>`.

Backups hold Contacts, Notes, and ministry records: open them only to debug that
report, and delete local copies afterwards.

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
<<<<<<< HEAD

## iCloud sync controls and recovery

| Event                                                             | Bounded properties / meaning                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `icloud_sync_first_enable_viewed`                                 | Conflict choice sheet opened                                                    |
| `icloud_sync_first_enable_chosen`                                 | `choice`: `keepLocal`, `useRemote`, or `merge`                                  |
| `icloud_sync_first_enable_outcome`                                | `choice`; `outcome`: `completed` or `failed`                                    |
| `icloud_sync_first_enable_dismissed`                              | Sheet closed without choosing                                                   |
| `icloud_sync_manual_started`                                      | Sync now requested                                                              |
| `icloud_sync_manual_outcome`                                      | `outcome`: `completed` or `failed`; `merged` on completion                      |
| `icloud_sync_reset_started` / `icloud_sync_reset_outcome`         | Rebuild requested; `outcome`: `completed` or `failed`                           |
| `icloud_sync_images_changed`                                      | `enabled` boolean, `source: settings`                                           |
| `icloud_sync_images_outcome`                                      | `enabled` boolean; `outcome`: `completed` or `failed`                           |
| `icloud_sync_cloud_photos_removed`                                | `source`: `disable_sync` or `images_toggle`; `outcome`: `completed` or `failed` |
| `icloud_sync_auto_enable_outcome`                                 | `outcome`: `seed`, `pull`, `conflict`, `incomplete`, `unavailable`, or `failed` |
| `icloud_sync_resolution_viewed` / `icloud_sync_resolution_opened` | `source: notifications_tray`                                                    |

Existing enabled-change, paused, and enable-deferred events remain. A completed
manual action is a local read/write outcome, not proof of Apple's cloud upload.
No payload contents, device ids/names, record ids, addresses, photos, or exception
messages are included. Sheet dismissal is an explicit abandonment; do not infer
abandonment merely from an app background event. Reminder repair is background
maintenance, not a new user journey.

## Calendar Sync

`$screen` for `PreferencesCalendar` measures views of Calendar Sync settings.
Calendar Sync is available on iOS. `calendar_connected` records a successful
connection and initial publish (`created`: boolean). `calendar_setup_cancelled`
records an explicit cancellation (`stage`: `access` or `destination`). A closed
screen without a completed connection is funnel drop-off, not proof of abandonment.
`calendar_disconnected` records local disconnect (`removed_events`: boolean).
`calendar_primary_selected` records a requested handoff (`this_device`, `pending`:
booleans); pending does not mean the previous publisher has released its write.
`calendar_device_removed` records removing a stale device. `calendar_options_changed`
contains only the changed `includeDetails`/`defaultInclude` booleans.

`calendar_published` records completed native reconciliation (`entries`, `removals`,
`published`: counts; `repair`: boolean). It can include a no-change reconciliation.
`calendar_sync_failed` records failed actions (`error_key`: bounded localized error
key; `background`: boolean). No destination/account names, device IDs/names,
appointment dates, contact/Visit IDs, raw errors, or calendar contents are sent.

`calendar_follow_up_inclusion_changed` (`included`, `configured`: booleans) and
`calendar_follow_up_duration_changed` (`duration_minutes`: number) record draft
choices in the Follow-up form. They do not imply the Visit was saved or published.

The onboarding `calendarSync` step (iOS builds with the calendar module only)
records `onboarding_calendar_setup_result` after **Add to Calendar** (`status`:
`connected`, `elsewhere` when another device already updates the calendar, or
`error` with a bounded `error_key`). Skip records `onboarding_step_skipped` with
`step_id: calendarSync`. A successful setup also records `calendar_connected`.
=======
>>>>>>> 00111145 (chore: reduce analytics event volume)
