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

The October 2026 reduction retains 123 business event types and removes 133.
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
| `pointer_hover_detected`                                                          | Once per UTC day; daily reach of trackpad, mouse, or Pencil hover users.                                                      |
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

| Product question                                             | Retained events / context                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Are people recording meaningful service activity?            | `time_entry_created`, `time_entry_updated`, `time_entry_deleted`, `contact_created`, `visit_created`, `plan_created`, `service_history_saved`. Counts and bounded workflow sources only.                                                                                                                                                                                                                                                                                                                                      |
| Are follow-ups completed or rescheduled?                     | `follow_up_card_completed`, `follow_up_dismissed`, `follow_up_rescheduled`.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Is the scheduling assistant useful?                          | `assistant_preview_opened`, recommendation accepted/dismissed/undone.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Are publisher settings and year rollover used?               | `role_period_set`, `hours_logging_changed`, `time_rollover_apply_requested`, `time_rollover_undone`.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Do reminders to log planned time work?                       | `unlogged_day_reminders_changed` (`enabled`); `notification_opened` with `kind: unloggedDay`, then `time_entry_created` from the Add Time it opens.                                                                                                                                                                                                                                                                                                                                                                           |
| Are reports exported?                                        | `service_report_export_requested`, `service_report_exported`, `service_report_export_dismissed`. Share-sheet resolution has platform limitations; it is not proof of submission.                                                                                                                                                                                                                                                                                                                                              |
| Are new features adopted?                                    | Timer start/failure, Buddies open/same-time planning, `custom_field_created` (`scope`: `contact` or `conversation`), `visit_created.custom_field_count`, calendar connection/disconnection/failure, and map permission results.                                                                                                                                                                                                                                                                                               |
| Do buddies use Ask to Join, and does it lead to joint Plans? | `buddy_join_requested` and `buddy_join_request_withdrawn` (`source`: `buddy_plans_for_day` \| `buddy_detail`), `buddy_join_request_answered` (`action`: `invite_opened` \| `invited` \| `not_now`; `invited` when a Plan saved from Invite still includes the buddy, `not_now` for Not Now, dismiss, or Clear All), `buddy_join_request_notifications_changed` (`scope`: `all` \| `buddy`, `enabled`), `buddy_invite_overlap_resolved` (`choice`: `replace` \| `keep_both`). Never names, relay ids, or Plan dates and times. |
| Is mileage used and exported?                                | Tracking changed, vehicle/trip/fuel added, data deleted, report exported/export failed. Low-value row actions, unit preferences, and edits are dropped.                                                                                                                                                                                                                                                                                                                                                                       |

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
`notifications`, `calendarSync`, `defaultNav`, `defaultExportMethod`, `onboardingBackfill`.

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

### Supporter subscription management

Manage Subscription (Settings → Manage subscription, or the active card in the
Paywall's Your donations) offers a Supporter Pause before the store's own
cancel/change screen (ADR 0016). The events answer how many Supporters reach
the intercept, how many pause rather than continue to the store, which pause
length they choose, and why a pause isn't offered.

| Event                           | Meaning                                                                                                                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supporter_manage_viewed`       | The sheet opened, once per open after the store product loads. `state` (`renewing`, `ending`, `paused`, `none`), `will_renew`, `pause_options` (count), `pause_unavailable_reason` (or null). |
| `supporter_pause_started`       | An App Store pause length was tapped; `months` is 1, 3, or 6.                                                                                                                                 |
| `supporter_pause_completed`     | The App Store accepted the free promotional offer.                                                                                                                                            |
| `supporter_pause_cancelled`     | The App Store purchase sheet was dismissed.                                                                                                                                                   |
| `supporter_pause_failed`        | The offer couldn't be signed or redeemed; `error_code` and `offline`.                                                                                                                         |
| `supporter_manage_store_opened` | The store's subscription management opened. `intent: pause` is Android's Pause in Google Play; `intent: cancel` is the footer button on both platforms.                                       |

All carry `source` (`paywall`, `settings`), `billing` (`monthly`, `annual`,
`other`), and `store`. `supporter_manage_store_opened` records intent only:
cancelling, changing the amount, and Google Play pauses happen in the store, so
their outcomes come from RevenueCat, as does whether paused Supporters resume
paying. No prices, product identifiers, or dates are sent.

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

## Calendar Sync and notification badges

Calendar Sync is available on iOS. The onboarding `calendarSync` step requires a
build with the native calendar module. `onboarding_calendar_setup_result` answers
whether **Add to Calendar** connects successfully, uses another publishing device,
or fails: `status` is `connected`, `elsewhere`, or `error` with a bounded
`error_key`. Skip records `onboarding_step_skipped` with `step_id: calendarSync`.
Successful setup also records `calendar_connected` (`created`: boolean).
The one-time `calendar_sync` tray invitation retains setup behavior; outcomes use
`calendar_connected` / `calendar_sync_failed`, without separate tray click events.
`calendar_disconnected` records local disconnect (`removed_events`: boolean).
`calendar_sync_failed` includes bounded `error_key` and `background`: boolean.
No destination/account names, device IDs, appointment dates, or calendar contents
are sent. Background publication, draft options, and generic tray actions remain
outside permanent usage coverage.

On iOS the app icon badge shows the tray's unread count. Badge updates send no
events of their own.

## Pointer input

`pointer_hover_detected` answers whether enough people use a trackpad, mouse, or
Apple Pencil hover (iPad, or a mouse on Android) to justify pointer-specific
work. It is sent the first time a pointer hovers a control, capped to once per
UTC day, with `input` (`pointer` or `stylus`). Individual hovers, tooltips, and
chart readouts are not captured.

## Update reveal

Returning installs that update across `UPDATE_REVEAL_VERSION` see the update
reveal once: the splash collapses into the app tile, then an optional tour of the
release. `update_reveal_opened` fires when it appears, with `source` (`launch`,
`tray`, `whats_new`, or `dev`), `entrance` (`intro` picks up from the splash,
`calm` is the same under Reduce Motion, `replay` fades in over the app), and
`reveal_version`. `update_reveal_closed` fires once when it closes, with
`source`, `method` (`later`, `close`, `done`, or `back` for Android's back
button), `stage` (`intro` if it closed before the tour, `tour` otherwise),
`pages_viewed` and `page_count` (pages shown for this platform, role, Buddies
availability, and Apple Watch support, fixed when the tour opens; `watch` and
`siri` show only on an iPhone, `siri` only for roles that log hours),
`last_page` (a bounded page id such as `navigation`, `buddies`, `watch`, or
`android`), and `elapsed_ms` (wall
clock, including time in the share sheet). Compare
`stage: intro` with `method: later` to see who skips the tour, and
`last_page`/`pages_viewed` to see where tours end. A tour closed by quitting the
app sends no close event. Choosing Later leaves an `update_reveal` tray item
that replays it.

## Sharing the app

`app_share_tapped` records a tap on Share Link, with `source` (`update_reveal`
for the tour's last page, `settings` for Settings → Share WitnessWork).
`app_share_completed` follows with the same `source` and `outcome`: `dismissed`
when iOS reports the share sheet was closed without sharing, otherwise
`shared`. Android's share sheet doesn't report a choice, so every Android
completion reads `shared`; treat it as "the sheet opened". `app_share_failed`
carries only `source`. The message holds the two store links and nothing about
the user. QR code scans happen on the friend's phone and can't be measured;
screen tracking (`ShareApp`) shows how often the code is opened from Settings.

## Navigation preferences

Users can reorder the Home, Schedule, Contacts, and Progress tabs in Preferences
→ Tab Order; Home remains the launch tab. `tab_order_changed` measures adoption
of this preference with `order` (comma-separated bounded route names, including
Progress even when hidden) and `source` (`arrows` or `menu`). Generic menu and
navigation interactions remain removed.

## Apple Watch

The watch app has no analytics client. The iPhone captures watch events when
its JavaScript next runs, which can be well after the action on the watch.
Events never carry entry ids, dates, durations, Type names or timer values.

| Event                          | When / properties                                                                                                                                                                                                                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `time_entry_created`           | An entry made on the watch is saved on the iPhone. `source: watch`, `watch_origin` (`app`, `shortcut` for Siri/Shortcuts, `timer` for a saved timer), `entry_mode` (`hours`, or `checkbox` for the shared-in-ministry marker), `has_category`, `has_note: false`. A repeated delivery of the same entry is not counted again. |
| `watch_timer_action_completed` | The watch started or paused the iPhone's timer. `action` (`started`, `paused`), `origin` (`app`, `shortcut`). Watch requests the iPhone never received aren't recorded.                                                                                                                                                       |
| `watch_entry_skipped`          | A watch entry wasn't saved. `reason` (`deleted` when it was deleted on a device before it arrived, `invalid`).                                                                                                                                                                                                                |
| `watch_entry_adjusted`         | A watch entry was saved as Standard because its Type was deleted first. `reason: category_removed`.                                                                                                                                                                                                                           |
| `watch_app_status`             | At most once a week per iPhone while the watch app is installed: the adoption baseline. `complication_enabled` (a WitnessWork complication is on the active watch face).                                                                                                                                                      |

## Development logging and validation

The shared logger controls SDK debug output. Development logs are on by default;
production logs require Developer Tools. `EXPO_PUBLIC_SILENT=true` or `1` silences
logs without changing analytics consent. Capture logs indicate queued events,
not proof of ingestion. Do not copy secret configuration or diagnostic payloads
into public reports.

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
