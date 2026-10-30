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
routing, and speculative paywall experiments have no permanent event. The
exception is two capped Help Center health events (`help_center_search_completed`,
`help_center_refreshed`), which measure the reach of the website-backed Help
Center rather than each search or open. Data
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

| Event                                                                             | Retained frequency / interpretation                                                                                                                                                                                                |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$screen`                                                                         | One route per PostHog session; reach rather than repeated navigation. Sessions expire after 30 minutes idle.                                                                                                                       |
| `Application Installed`, `Application Opened`                                     | Installation and cold-launch signals. All launch URLs are removed at capture and delivery, including legacy anonymous queues.                                                                                                      |
| `Application Became Active`                                                       | Once per UTC day per anonymous installation; daily active reach, not foreground count.                                                                                                                                             |
| `app_launch_timed`                                                                | Once per UTC day per installation. `launch_ms` (React Native start to first screen) and `js_ms` (bundle start to first screen) measure real-world launch speed across releases. Launches that start in the background are skipped. |
| `onboarding_checklist_viewed`, `supporter_nudge_viewed`, `backup_reminder_viewed` | Once per UTC day and bounded source/variant context. Measure daily reach.                                                                                                                                                          |
| `pointer_hover_detected`                                                          | Once per UTC day; daily reach of trackpad, mouse, or Pencil hover users.                                                                                                                                                           |
| `timer_action_completed`                                                          | `action: started` only, once per session. Measures timer adoption, not pauses/resets or exact timer-start counts.                                                                                                                  |
| `buddies_opened`                                                                  | Once per session and source.                                                                                                                                                                                                       |
| `badges_opened`                                                                   | Once per session and source; reach of the Badges screen, not repeat visits.                                                                                                                                                        |
| `buddy_badges_opened`                                                             | Once per session; reach of a buddy's collection, not repeat visits.                                                                                                                                                                |
| `contacts_filter_added`                                                           | Once per session and kind (`variant`); reach of each Sort & Filter filter, not every filter added.                                                                                                                                 |
| `contacts_staleness_chip_applied`                                                 | Once per session, group (`variant`) and surface (`source`); reach of the Contacts quick filters, not every tap.                                                                                                                    |
| `map_group_opened`                                                                | Once per session; reach of the Map's grouped pins, not every tap.                                                                                                                                                                  |
| `contacts_suggested_contact_opened`                                               | Once per session and section (`variant`); reach of the Suggested sections, not every Contact opened.                                                                                                                               |
| `buddies_push_registration`                                                       | Once per session for each outcome/reason; recovery and distinct failures remain visible.                                                                                                                                           |
| `icloud_restore_probe_result`                                                     | Once per session for each status/source; automatic repeated probes are suppressed.                                                                                                                                                 |
| `saved_view_applied`                                                              | Once per session and surface (`source`); reach of Saved View switching, not how often people switch.                                                                                                                               |
| `schedule_year_view_opened`                                                       | Once per session and way in (`source`); reach of the Schedule's Year view, not every zoom.                                                                                                                                         |
| `recovery_key_viewed`                                                             | Once per session; reach of the recovery key, not repeat views.                                                                                                                                                                     |
| `account_backup_failed`                                                           | Once per UTC day and reason; which failures affect people, not how often a phone retries.                                                                                                                                          |
| `account_session_failed`                                                          | Once per UTC day and reason; which devices can't open an account session, not how often one retries.                                                                                                                               |
| `device_storage_full`                                                             | Once per UTC day; how many devices run out of storage, not how often writes fail.                                                                                                                                                  |
| `update_required_shown`                                                           | Once per session and source; reach of Update Required, not every return to the foreground.                                                                                                                                         |
| `help_center_search_completed`                                                    | Once per session per source and outcome; reach of the search service and of searches that find nothing, not every search.                                                                                                          |
| `help_center_refreshed`                                                           | Once per UTC day per outcome and reason; whether new Help Center content reaches devices, not every open.                                                                                                                          |
| Supporter gate, purchase, and core outcome events                                 | Every meaningful occurrence; placement visits and `gate_flow_id` attribution remain intact.                                                                                                                                        |
| `$feature_flag_called`                                                            | Once per UTC day and flag/value, with SDK experiment metadata.                                                                                                                                                                     |

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

Features that call ww-api disclose that traffic in their own Help Center
entries; it is not analytics. Route planning, for example, sends the stops'
coordinates and the account id to ww-api, which passes only the coordinates to
HERE and stores neither (see the Help Center's route planning privacy answer).

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

| Product question                                             | Retained events / context                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Are people recording meaningful service activity?            | `time_entry_created`, `time_entry_updated`, `time_entry_deleted`, `contact_created`, `visit_created`, `plan_created`, `service_history_saved`. Counts and bounded workflow sources only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Do people log time and plan from a day without leaving it?   | `time_entry_created`, `time_entry_updated`, and `time_entry_deleted` with `source: day_sheet` when the entry is saved from the time form inside a day's sheet (a day on Schedule, Home's This Week, or Progress' All Days), versus `source: time_entry_form` on the Add Time screen. These, and the `time_report_row` delete and `time_report_row_menu` Type change, carry `entry_mode`: `hours`, or `checkbox` for a 0h 0m shared-in-ministry marker. Before October 2026 the form and the row sent no `entry_mode`. `plan_created` with `source: day_sheet` from the Plan form inside a day's sheet, versus `source: plan_form` on the Plan screen. A day's inline form expanded full screen saves from the Add Time or Plan screen, so it sends `source: time_entry_form` or `source: plan_form`. Opening, folding, or expanding the forms, resizing, or closing the sheet sends nothing.                                                        |
| Are follow-ups completed or rescheduled?                     | `follow_up_card_completed`, `follow_up_dismissed`, `follow_up_rescheduled`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Does Log Visit make logging faster?                          | `visit_created` with `source: quick_action`, `picked_from` (`nearby`, `followUpsDue`, `recent`, `all`, `search`, or `new_contact`), `nearby_shown`, and `not_at_home`. `log_visit_dismissed` (`step`: `pick_contact` or `choose_outcome`) when the + menu's Log Visit closes without logging or continuing to a form; abandoning that Visit Form isn't counted. `log_visit_location_answered` (`granted`) after its Show contacts near you prompt. No coordinates, distances, names, or search text are sent.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Does carrying Bible Study forward help the report?           | `visit_created.bible_study_prefilled`: the new Visit's Bible Study switch started on because the Contact's last real conversation (not a Not at Home) was a Bible Study. With `bible_study`, a prefilled switch saved off shows how often people turn it off.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Where do people log Not at Home in one tap?                  | `visit_created` with `not_at_home: true` and `source`: `quick_action` (Log Visit), `follow_up_card` (Home's Follow-up card), or `contact_details` (Contact Details' + Add → Not at Home). Each logs right away with an Undo toast; Undo sends nothing. A Not at Home saved from the Visit Form (e.g. a Contact's menu in the Contacts list) has no `source`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Is the scheduling assistant useful?                          | `assistant_preview_opened`, recommendation accepted/dismissed/undone.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Are publisher settings and year rollover used?               | `role_period_set`, `hours_logging_changed`, `time_rollover_apply_requested`, `time_rollover_undone`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Do Kingdom Publishers want to log hours?                     | `hours_logging_changed` (`enabled`; `source`: `onboarding` for the setup question, `tray` for the one-time question in the notifications tray, `settings` for Log my hours in Settings → Profile). Each answer sends one event; in the tray, No Thanks, dismissing it, or Clear All sends `enabled: false`. Compare `enabled: true` by `source` with Kingdom Publisher onboardings (`onboarding_step_completed` with `step_id: publisherType` and `publisher_role: publisher`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Do reminders to log planned time work?                       | `unlogged_day_reminders_changed` (`enabled`); `notification_opened` with `kind: unloggedDay`, then `time_entry_created` from the Add Time it opens.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Do month-start reminders get reports submitted?              | `month_report_reminder_changed` (`enabled`; `source`: `settings` for Preferences → Plans, or `report_offer` for the one-time offer on the report screen after a report is sent, where dismissing it sends `enabled: false`) when Remind Me to Submit My Report is switched. Taps on the reminder arrive as `notification_opened` with `kind: monthReport`; compare with the `service_report_exported` that follows. Never the month, time logged, or report content.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Does inviting people to plan next week lead to planning?     | `week_plan_reminder_changed` (`enabled`) when Remind Me to Plan Next Week is switched in Preferences → Plans. Taps on a fired reminder arrive as `notification_opened` with `kind: weekPlan`; compare with the `plan_created` and accepted Assistant recommendations that follow. Never the chosen day or time, dates, or Plan details.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Do streaks keep people planning and keeping their plans?     | `streak_milestone_reached` (`count`, `kind`: `plans` \| `months`; `after_action`: whether the User's own action just reached it, so it got the full celebration rather than the chip's flare, ADR 0021) once per device when the streak reaches a celebrated milestone (3, 5, 10, 15, 20, 25, 30, 40, 50, then every 25 for Plans; every month from 3 for months), not on every kept day. `streak_details_opened` (`kind`; `ending`: whether the chip showed a countdown) when the Home streak chip opens its popover, to see whether people look at their streak's details and buddies' streaks. `streak_reminders_changed` (`enabled`) when Streak Reminders is switched. `streaks_setting_changed` (`enabled`) when Show streak is switched in Preferences → Streaks & Badges; while it's off, milestones send nothing. Taps on a fired reminder arrive as `notification_opened` with `kind: streak`. Never dates, Plan details, or time logged. |
| Do people plan hours without a set time?                     | `plan_created.time_mode`: `hours` for Just hours (no set time) or `span` for a start and end time. Never the time itself.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Do people want reminders for recurring Plans?                | `plan_created.reminder_enabled` with `plan_kind: recurring`; taps on a fired one arrive as `notification_opened` with `kind: plan`. Never the reminder time or Plan details.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Does the Schedule intro lead to planning?                    | `schedule_intro_closed` once per showing, with `source` (`first_visit`), `method` (`plan` for Plan a Day, `done`, `close`, or `back` for Android's back button), `pages_viewed`, and `page_count` (3, or 4 where Buddies shows; 2 fewer with Show streak off; less any page onboarding already showed: the tour's Plan or Buddies page, or the Plan Month or Buddies step). Compare `method: plan` with the `plan_created` that follows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Are reports exported?                                        | `service_report_export_requested`, `service_report_exported`, `service_report_export_dismissed`, with `source` (`report_screen` or `context_menu`) and `report_month` (`previous`, `current` for a report sent before its month is over, or `other`). Home points at last month's report while it's unsent, so watch `current` shrink early in a month. Share-sheet resolution has platform limitations; it is not proof of submission. Android reports every share as `service_report_exported`, even a dismissed sheet, so an Android share doesn't mark the month sent. Hourglass and NW Publisher opened while the device is offline mark the month sent only if the User answers "Mark as Sent" when they come back; `service_report_handoff_confirmed` records the answer (`method`, `source`, `report_month`, `sent`).                                                                                                                       |
| Are reports marked sent or not sent by hand?                 | `service_report_marked_not_sent` when Mark as Not Sent undoes a month marked sent by an export or Already Submitted, and `service_report_marked_sent` when Mark as Sent records one (a report sent another way, or shared from Android, where Share doesn't mark it). Both carry `source` (`report_screen` for the report's Sent / Not Sent menu, `context_menu` for a month's menu) and `months_ago` (0 for this month, 1 for last month). Never the month's contents.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Are new features adopted?                                    | Timer start/failure, Buddies open/pairings by platform (`buddy_paired`)/same-time planning/plan invites/invitation answers/customization, `custom_field_created` (`scope`: `contact` or `conversation`), `visit_created.custom_field_count`, `visit_field_suggestion_used` (`position`: the tapped suggestion's place, 1–5; `filtered`: something was typed first; never the value), calendar connection/disconnection/failure, and map permission results.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Do buddies use Ask to Join, and does it lead to joint Plans? | `buddy_join_requested` and `buddy_join_request_withdrawn` (`source`: `buddy_plans_for_day` \| `buddy_detail`), `buddy_join_request_answered` (`action`: `invited` \| `not_now`; `invited` when Invite adds the buddy to the Plan, `not_now` for Not Now, dismiss, or Clear All), `buddy_join_request_notifications_changed` (`scope`: `all` \| `buddy`, `enabled`), `buddy_invite_overlap_resolved` (`choice`: `replace` \| `keep_both`; `includes_recurring`: whether a recurring Plan's instance overlapped). Never names, relay ids, or Plan dates and times.                                                                                                                                                                                                                                                                                                                                                                                    |
| Do people filter Contacts by last visit?                     | `contacts_staleness_chip_applied` (`variant`: `month`, `week`, `recent`, or `never`; `source`: `list` or `map`) when a Contacts chip turns on that group, above the list or over the map. Once per session per group and surface; clearing a chip sends nothing. Dragging chips into a new order is a cosmetic preference and sends nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Which Contacts filters do people use?                        | `contacts_filter_added` (`variant`: the filter kind, such as `hasFollowUp`, `noFollowUp`, `followUpOverdue`, `pinStaleness`, `name`, or `customField`) when Sort & Filter adds a filter. Once per session per kind; editing or removing a filter sends nothing. Never filter values, custom field ids, or which Contacts match. The Next follow-up sort shows up as `sort: nextFollowUp` on `saved_view_created`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Do people open Contacts from the Suggested sections?         | `contacts_suggested_contact_opened` (`variant`: `nearby`, `followUpsDue`, `recent`, `beenAWhile`, or `other` for the rest of the list under Other Contacts; `nearby_shown`: whether Nearby was on the list) when a Contact is opened from the Contacts list while the Suggested sort shows its sections (no search). Once per session per section; Select mode taps send nothing. Comparing `variant` shows whether the sections are used ahead of the rest, `beenAWhile` whether people reconnect before they go quiet, and `nearby_shown` how often location makes Nearby available. Never coordinates, distances, addresses, or which Contact.                                                                                                                                                                                                                                                                                                   |
| Do people put imported Contacts on the map?                  | `map_find_contacts_result` when a run of the Map's Find contacts row ends: `outcome` (`completed`, `cancelled` when stopped or the Map was left, `offline`), `count` (Contacts looked up) and `found` (Contacts that got a pin), each bucketed `0`, `1`, `2-5`, `6-20`, `21-50` or `51+`. Never addresses or Contact ids.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Do the Map's pin cards help?                                 | `map_card_detail_changed` (`detail`: `nextVisit`, `lastVisit`, `followUpTopic`, `nameOnly`, or `field` for any Contact Field, never its name; `source`: `settings` for Settings → Map or `map` for the Map's layer menu) when what pin cards show changes; `map_due_lens_applied` (once per session) when the due chip narrows the map to Contacts due; `map_group_opened` (once per session; `count` bucketed `2`, `3-5`, `6+`) when a pin grouping Contacts at one place opens its list.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Do people permanently delete Contacts?                       | `contact_deleted` (`count`: Contacts deleted at once) when a Delete Permanently confirmation is accepted from a Contact's menu, Contact Details, or Select mode. Archiving, Archive Instead, and deletes from Recover Contacts send nothing. Never names or which Contact.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Are Saved Views adopted and used?                            | `saved_view_created` (`filter_count`, `sort`, `view_count`) and `saved_view_applied` (`view_count`; `source`: `list` or `map` for the chip row it was picked from; once per session and surface). Updating, renaming, reordering (including dragging a chip) and deleting a view are ordinary edits and send nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Is mileage used and exported?                                | Tracking changed, vehicle/trip/fuel added, data deleted, report exported/export failed. Low-value row actions, unit preferences, and edits are dropped.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Are formatted notes and note photos used?                    | `has_note`, `has_formatting` (the note has formatting, lists, labeled links or photos) and `note_photos` (how many) on `visit_created`, `time_entry_created` and `time_entry_updated` from the form, `plan_created` and `mileage_trip_added`. `note_photo_added` (`surface`: `visit`, `time_entry`, `plan` or `trip`; `count`) when photos are added in the note editor, and `note_photo_failed` (`surface`) when one couldn't be saved. Never the note's text, links or photos.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Can people with limited photo access pick photos?            | `photo_picker_limited_closed` when the iOS picker for limited photo access closes: `surface` (`avatar`, `note`, `scribe_photo` or `scribe_paper`), `outcome` (`picked` or `cancelled`), `count` (photos picked), `managed` (the User opened Manage to change which photos are shared) and `failed` (a picked photo couldn't be loaded). Never the photos or their dates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Do people lock the app with Face ID or Touch ID?             | `app_lock_changed` (`enabled`; `method`: `faceId`, `touchId`, `passcode`, or `biometrics` on Android; `require_after`: seconds away before it asks again, `0`, `60`, `300`, or `900`) when Settings → Security's switch is confirmed or its Require delay changes. Unlocks aren't sent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Existing structural properties and sources remain on retained events. No saved
content, record identifiers, appointment dates, or exception text is attached.
Saved View `sort` is a built-in sort key or just `customField`; the events never
carry view names, filter values, or custom field ids.
Buddies and Scribe AI are rollout-gated; iCloud features retain their iOS
availability rules, and Calendar Sync is available on iOS and Android.

## Onboarding and activation

Use `onboarding_started` / `onboarding_resumed`, `onboarding_step_viewed`,
`onboarding_step_completed`, `onboarding_step_skipped`, and `onboarding_completed`.
Break down by stable `step_id`, since conditional steps change numeric positions.
Back/jump/button micro-interactions and hero-animation skipping are dropped.
A skipped step can also complete: completion means advancing, not filling every
optional field.
`pickUpWhereLeftOff` sends `onboarding_step_skipped` only from Start fresh.
Once something has been imported there, the button reads Continue and sends
just `onboarding_step_completed`. `elapsed_ms` includes background time and time on other screens.

Stable step IDs, in order: `hero`, `featureTour`, `pickUpWhereLeftOff`,
`publisherType`, `hoursLogging`, `pioneerDate`, `planMonth`, `dataProtection`, `buddies`,
`notifications`, `calendarSync`, `defaultNav`, `onboardingBackfill`,
`profileSetup`, `founderNote`. The flow introduces the app before it asks for
anything, asks for the name last, and ends on the founder note.
`intentPicker` and `yourPlanPreview` were retired in October 2026 when `planMonth`
replaced them. `privacyFirst` and `badges` were retired in October 2026 when
their content moved into `featureTour`; `profileSetup` moved from after
`publisherType` to the end, and `founderNote` from after `hero` to the very
end. `defaultExportMethod` was retired in October 2026: the report method
defaults to NW Publisher and is chosen above Submit on the report screen. Its
`onboarding_step_completed` events carried `selected_option`. Compare funnels
across these changes by step, not position.

`featureTour` is a paged tour of the app, shown right after `hero`. Its question
is whether showing the features first keeps people in setup, and how much of it
they watch. Leaving it sends `onboarding_tour_closed` with `method` (`finished`
from the last page, `skipped`, or `back` to the welcome), `pages_viewed`,
`page_count`, `last_page` (a bounded page id such as `track`, `plan`, `siri` or
`more`), and `elapsed_ms`. Skip also sends `onboarding_step_skipped`. Individual
page views are not captured.

`hoursLogging` only appears for the Kingdom Publisher, added in October 2026. Its
question is how many Kingdom Publishers want to log hours when asked up front,
rather than finding Log my hours in Settings. Continue stays off until they
pick; `onboarding_step_completed` carries `selected_option`: `yes` or `no`, and
the answer also sends `hours_logging_changed` with `source: onboarding`.

`planMonth` only appears for publishers who log hours and have a monthly goal.
Its question is whether hands-on planning lands: adding the plan sends
`assistant_recommendation_accepted` with `source: onboarding`, `shape`,
`plan_count`, `past_plan_count`, `edited_day_count`, `service_day_count`,
`reaches_goal`, and `reminder_enabled`. The plan covers the whole month, so
`past_plan_count` counts plans on days already gone, which tells how often
people join late in the month. `edited_day_count` counts days changed by hand
with the day slider; `shape` is `manual` when every plan was added by hand. "I'll plan later"
sends `onboarding_step_skipped`. Divide accepted by `onboarding_step_viewed` for
the step. Exclude `source: onboarding` when measuring the Schedule Assistant.

`buddies` only appears where Buddies is available (iOS builds with the Keychain
module and the `buddies` flag on). Its question is whether introducing Buddies
during setup leads people to invite a buddy, and what gets in the way. The
name comes at the end of setup, so a buddy invite without one first asks for it
on the step and reports `name_required` only if the invite still fails. Its
`onboarding_step_completed` carries `selected_option`: `invited` when the step
created a Buddies Invite (the share sheet opened), else `skipped`; Continue
without inviting also sends `onboarding_step_skipped`. Each invite attempt sends
`onboarding_buddies_invite_result` with `status`: `shared` (the share sheet
completed), `dismissed`, or `error` with a bounded `reason` (`name_required`,
`limit`, `offline`, `disabled`, `suspended`, `rate_limited`, `unverified`,
`verify_later`, `update`, or `error`). No links, invite ids, or names are sent.
The same Buddies failure reasons (`buddiesFailureReason`) are on
`buddies_push_registration` and `buddies_tray_sync_failed`: `unverified` means
this device can't be verified, so it has no account session and Buddies sends
nothing (ADR 0027); `verify_later`, that verifying it failed for now; `update`,
that ww-api needs a newer app. The step leaves itself out on a device that can
never be verified.

Notification permission request/result, import availability/skip, and backfill
completion distinguish friction from deliberate choices. `completion_method` is
`guided`, `icloud_restore`, `backup_restore`, or `account_backup` (From your other
phone restored the account's backup). Measure onboarding drop-off over an
observation window that allows resumption.

The Home checklist is meant to be finished in the first week: plan a day of
service, log time (Regular Publishers without Hours Logging check off the
month), add a return visit, and log time on 3 different days. The last step is
left out for those Regular Publishers, since they share once a month, so
`onboarding_checklist_viewed` carries `item_count` (3 or 4). Until October 2026
the last step was "send your first report", which couldn't finish before the
month ended; compare completion rates across that change by app version. Its
question is which step people stall on, and whether finishing early comes with
coming back in week 2. Each step that gets done while the checklist is mounted sends
`onboarding_checklist_item_completed` with `item` (`setMonthlyGoal` for the
plan step, `logFirstMinute`, `addFirstContact`, `logThreeDays`), `method`
(`auto` when the app detected it, `manual` when ticked by hand), and
`days_since_install` (`0`, `1`, `2_3`, `4_7`, `8_14`, `15_30`, `over_30`, or
`unknown`). Steps already done when the checklist mounts aren't sent again, and
unticking sends nothing. View, completed, and dismissed (`all_done`) stay;
individual manual checkbox toggles beyond completion are dropped.

## Imports and backups

Filter by `import_type` (`notes`, `paper`, `mytime`, `icloud`, `google_drive`, `backup_json`, `other_phone`) and `source`. `other_phone` is onboarding's From your other phone, which opens Sign In with QR Code; the handoff events below follow it. `notes` and `paper` are onboarding choices that open [Scribe AI](#scribe-ai), which sends its own events, not `import_*` ones.
Retain type selection, start, preview readiness, completion, failure, cancellation,
stop, and undo. Intermediate file selection, commit start, retry/reset clicks,
preview edits, prompt toggles, and warning openings are dropped.

| Flow                   | Outcomes                                                                                                                                                                                                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MyTime / cloud restore | `import_completed` with the import type (`icloud` on iOS, `google_drive` on Android).                                                                                                                                                                                                   |
| JSON restore           | `backup_imported`; started/cancelled/failed uses `import_type: backup_json`. `import_failed` `error_code: invalid_file` means the JSON held no WitnessWork store (another app's file; stage `validate_file`) or its stores couldn't be read (stage `restore`). Locked files: see below. |
| JSON export            | `backup_export_started` (Create Backup tapped, the protection sheet opens) → `backup_exported`, or `backup_export_failed`, or `backup_export_cancelled` (sheet closed). File-created and share-sheet-requested stages are dropped.                                                      |
| Backup reminder        | View (daily reach), clicked, dismissed; reminder preference events are dropped.                                                                                                                                                                                                         |
| iCloud photo consent   | `icloud_restore_images_prompted`, requested, skipped; replace confirmation remains.                                                                                                                                                                                                     |

Backup files are locked (docs/backup-files.md). `backup_exported`,
`backup_export_failed` and `backup_export_cancelled` carry `protection`:
`account` or `password`, the choice on the sheet when it ended (absent on
failures before the sheet). `backup_export_failed` at stage `lock` means
locking failed, before the share sheet. `backup_imported` carries `protection`:
`none` (an unlocked file from an older version), `account` or `password`.
Restoring a locked file adds stage `unlock`: `import_cancelled` there means the
person closed the password sheet, and `import_failed` there has `error_code`
`no_account_key` (an account file on a device with no account key),
`wrong_account` (another account's file), `newer_version` or `invalid_file`.
`backup_imported` and that `import_cancelled` add `wrong_passwords`, how many
wrong passwords were tried, when there were any. Only the count is sent, never a
password.

JSON restore `import_failed` at stage `restore` with `error_code: newer_version`
means a newer app version wrote the file, so nothing was restored. When some
records couldn't be read and the rest were restored, `backup_imported` adds
`dropped_records`, how many were left out. Only the count is sent.

MyTime `import_failed` at stage `parse` with `error_code: invalid_file` adds
`file_kind`, what the picked file looks like from its first bytes: `sqlite` (a
database without MyTime's tables, or one SQLite couldn't read), `zip`, `pdf`,
`bplist` (a binary property list), `json`, `text`, `empty`, or `unknown`
(another binary format, or the file couldn't be read). It shows which wrong
files people pick, so the guidance can name them. Only the kind is sent, never
the file's name or contents.

The onboarding chooser's `import_type_selected` uses `import_type: notes` or
`paper`, and `onboarding_import_options_viewed` adds `paper_available`. Both
choices open Scribe AI's conversation, so their messages carry
`entry: onboarding` on `scribe_turn_started`. Settings → Import Data lists the
same options and sends `import_type_selected` with `source: settings` (its
messages carry `entry: settings`); there `icloud` or `google_drive` means the
person opened Device Sync.

Export/restore retains
bounded `entry_point` (`settings`, `backup_reminder`, or `import_data`), failure stage/error code,
and wall-clock elapsed time. `backup_exported` means Expo's sharing call resolved;
`outcome: unknown` covers both sharing and cancellation and cannot establish that
a backup was saved. Reminder dismissal snoozes without changing `lastBackupDate`.

Restore probe status is `probing`, `found`, `noBackup`, `unavailable`, or
`incomplete`; each distinct status survives the session cap. Photo consent does
not establish that photos downloaded. No file paths, filenames, or contents are
usage properties.

## Scribe AI

Scribe AI (ADR 0032) is a conversation: the User speaks, types, scans notes or
reads paper pages, Scribe AI answers or proposes changes as review cards, and
nothing is written until Add. The questions are whether people reach it, whether
a turn ends in something useful, how often they keep what it proposes, and
whether the usage limits get in the way. Every property is a bounded value or a
count. No message, transcript, answer, name, address, note, Ref, tool argument
or record id is ever sent, and neither are recordings, photos or page images.
ww-api logs its own per-step metering, cache writes, billed cost and the gap
between turns (`api_scribe_step`) without a person profile; see [`scribe-ai-protocol.md` → Logging and privacy](./scribe-ai-protocol.md#logging-and-privacy).

| Event                        | When / properties                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Question                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `scribe_entry_tapped`        | An entry point opened Scribe AI. `entry`: `home_orb` (Home's Quick Actions orb), `plus_sheet` (the + sheet's Speak an update), or `menu_bar` (File → Speak an update in the iPad menu bar). `state`: `available`, `limited` (a usage window is full; the conversation opens on the limit card), `offline` (the no-internet explainer opened instead), `blocked` (the conversation opens on the blocked message), or `voice_unsupported` (no on-device speech; the conversation opens with the keyboard).                                                                                                                                                                                                                                                                                                                                  | Which entry points do people use, and how often does the tap land somewhere other than voice? |
| `scribe_turn_started`        | A message was sent. `entry`: where the conversation was opened from (the entries above, plus `onboarding`, `history`, `conversation` for a later message, and `say_a_change`). `input`: `voice`, `keyboard`, `photo` (scanned notes) or `paper` (read pages). `turn`: `1`, `2`, `3-5` or `6+` in this conversation. `pending_proposal`: the message was sent while review cards were still waiting (a correction).                                                                                                                                                                                                                                                                                                                                                                                                                        | How do people talk to it, and how long do conversations run?                                  |
| `scribe_turn_finished`       | A turn ended. `outcome`: `proposal` (review cards), `answer` (text only), `error`, `stopped` (Stop), or `limit`. `steps`, `read_calls`, `write_calls`, `invalid_calls` (tool calls the device rejected). `error_code`: a stable code such as `network`, `timeout`, `too_much`, `couldnt_finish`, `rate_limited`, `model_error`, `device_ineligible`, `attestation_unavailable`, `suspended` or `update_required`, else null. `duration`: `<5s`, `5-15s`, `15-30s` or `30s+`.                                                                                                                                                                                                                                                                                                                                                              | Does a turn end in something useful, and how long does it take?                               |
| `scribe_proposal_resolved`   | A set of review cards was decided. `outcome`: `applied`, `partially_applied` (some cards were skipped because their record changed or went missing), `dismissed`, `superseded` (a correction replaced it), or `failed`. `cards`, `applied_cards`, `deselected_cards` (unchecked before Add), `choice_cards` ("Which Maria?" cards), `consent_cards` (cards that asked the User to confirm a new householder agreed to be kept, in data protection mode). `kinds`: the effect kinds on the cards, sorted and comma-separated (`contact.create`, `plan.create`, `time.create`, `time.update`, `time.delete`, …). `tainted`: the turn read text someone wrote (notes), which reviews more carefully.                                                                                                                                         | How often do people keep what Scribe AI proposes, and what do they uncheck?                   |
| `scribe_undo`                | Undo ran. `source`: `toast`, `history`, or `conversation` (the Undo link on an added Proposal in its conversation). `target`: `scribe` or `legacy_import` (a Notes Import from before Scribe AI, under History → Earlier imports). `result`: `undone`, `partially_undone` (records changed since were kept) or `nothing_to_undo`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | How often is an Add a mistake?                                                                |
| `scribe_limit_reached`       | A turn or page read hit a full usage window. `plan`: `free` or `supporter`. `window`: `session`, `weekly` or `monthly`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Are the limits sized right for each plan?                                                     |
| `scribe_context_full`        | The conversation neared or reached its length budget. `state`: `near_full` (the banner) or `full` (the composer is replaced by New conversation). Once per conversation per state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Do conversations run long enough to need starting over?                                       |
| `scribe_capture_finished`    | A voice recording, notes scan or paper batch ended. `input`: `voice`, `photo` or `paper`. `outcome`: `done`, `cap` (the 3-minute voice cap), `interrupted` (a call or leaving the app; what was heard waits in the composer), `typed` (Type instead while listening; what was heard waits in the composer), `discarded` (for paper, the conversation closed while pages were read), `empty`, or `error`. Voice adds a `duration` bucket and the recognizer `engine`; paper adds `pages` and `retry`. `error_code` is a stable code or null. When paper pages are left unread for a reason that can pass (no connection, a busy or unavailable service, a model error), the event adds `retry_offered: true` and the app keeps those pages for Try again; each Try again sends its own event with `retry: true` and `pages` it read again. | Does capture work on both platforms, and why does it fail?                                    |
| `scribe_voice_minimized`     | The voice sheet over a conversation was pulled down (or the space above it tapped) while listening, shrinking it to a small orb over the conversation. Once per recording.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Do people want to read the conversation while they talk?                                      |
| `scribe_memory_saved`        | Scribe AI changed its memory in the background, in one kept step of a turn. `added`, `changed`, `removed`: how many notes it saved, never their text. `fill`: how full the memory is afterwards, `<25%`, `25-50%`, `50-75%` or `75%+` of its 1,500 characters.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Does Scribe AI remember things people tell it, and does memory fill up?                       |
| `scribe_memory_managed`      | The User changed the memory in Settings → Scribe AI memory. `action`: `edited` (once per edit, when the field loses focus), `cleared`, `turned_off` or `turned_on`. `fill`: how full the memory is after an edit, and before clearing or turning it off.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Do people trust what Scribe AI keeps, or do they correct, clear or turn it off?               |
| `scribe_setting_changed`     | Scribe AI was turned on or off with the switch in Settings → Scribe AI. `enabled`: whether it's on now. Off hides every entry point and stops Scribe AI's status checks. Turning it on where this device hasn't agreed to the Terms of Use sends this only once they're accepted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Do people turn Scribe AI off, and do they come back to it?                                    |
| `scribe_privacy_viewed`      | How Scribe AI handles data was shown. `surface`: `settings` (Zero Data Retention's Learn more) or `first_open` (the step after the Terms of Use, the first time this device opens Scribe AI).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Do people look into how Scribe AI handles their data, and does it come before turning it off? |
| `scribe_terms_resolved`      | The Terms of Use step for Scribe AI ended (once a device, before its first use, and when turning Scribe AI on in Settings before agreeing). `surface`: `first_open` or `settings`. `outcome`: `accepted` or `dismissed` (swiped away: Scribe AI stays on and asks again next time; from Settings it stays off).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Do people agree to the terms, or put Scribe AI off?                                           |
| `scribe_usage_viewed`        | Usage was shown. `surface`: `conversation` (the meter in the conversation header, once per visit) or `settings` (Settings → Scribe AI usage, once per visit). `plan`, `limited`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Do people check their usage, and do they do it when they're limited?                          |
| `scribe_upsell_tapped`       | Become a Supporter was tapped. `surface`: `limit_reached` (the limit card) or `usage` (Settings → Scribe AI usage). The Paywall then opens with `source` `scribe_limit_reached` or `scribe_usage`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Does reaching a limit lead to supporting?                                                     |
| `scribe_supporter_rechecked` | Check again was tapped where this device is a Supporter but ww-api metered the account as free (the limit card or Settings → Scribe AI usage). `supporter`: whether ww-api answered Supporter after linking again.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | How often does a Supporter's status fail to reach the server, and does linking again fix it?  |
| `quick_actions_tile_tapped`  | A tile in Home's Quick Actions section was tapped. `tile`: `time` (Add Time), `visit` (Log Visit, shown in place of Time when the publisher doesn't log hours), `contact`, or `plan`. The orb in the same section sends `scribe_entry_tapped` with `entry: home_orb`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Do the Quick Actions tiles earn their place on Home next to the orb?                          |

Scribe AI runs on the account session (ADR 0027): a device that can't be
verified sees the blocked message, and its turns end with `error_code`
`device_ineligible`, `attestation_unavailable` or `suspended`. Break the events
down by the SDK's `$os_name` to compare iOS and Android, especially
`scribe_capture_finished` for voice. Typing a draft, editing captured text,
checking or unchecking a card, and picking a choice chip send nothing; their
effect shows up in `scribe_proposal_resolved`.

Notes Import's `notes_import_*` events stopped with Scribe AI (October 2026).
Compare adoption across the change with `scribe_turn_started` against
`notes_import_submitted`, and `scribe_proposal_resolved` (`applied`) against
`notes_import_accepted`.

## Paywall and Supporter

Use `paywall_viewed` for rendered entry and its `source`/`feature` for attribution.
The preceding navigation-intent event `paywall_opened` is removed. Nudge and
feature-gate view/click/dismiss events retain the earlier funnel. Nudge visibility
changes record permanent hiding. Daily nudge impressions measure daily reach,
while clicks/dismissals remain uncapped. Nudge view/click/dismiss carry
`variant: standard | early` — whether the user qualified through long tenure or
the early heavy-use path (see `docs/supporter-nudge-plan.md`). Compare the two
paths' click-through and purchase rates before changing either threshold.

Quiet Supporter notes after a moment of value open the paywall with `source`
`onboarding_checklist` (notifications tray item listed once the Home "Get started"
checklist is completed) or
`onboarding_mytime_import` (MyTime import success during setup). They have no
impression event; measure them from `paywall_viewed` and purchases by source.

Retain purchase start/completion/cancellation/failure, offering failure, restore
start/success/empty/failure, and `paywall_closed`. Keep `tier` to distinguish tips
from Supporter access, with final billing/product choice on purchase events.
Intermediate tier, billing, price, expansion, FAQ, and legal-link clicks are
removed. Closing the app is not a navigation-close event. A completed purchase
is a client RevenueCat result, not a renewal/refund or revenue ledger.

`paywall_offerings_failed` carries `trigger`: `initial` (the paywall opened),
`retry` (Try Again), `foreground` or `reconnect` (automatic retries while the
paywall shows no prices). `paywall_offerings_empty` fires when a load succeeds
with no packages at all (a store or dashboard configuration problem), with the
same `trigger`. Compare failures by trigger to see whether users recover.

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
| `iCloudSync`        | `icloud_sync`        | Sync gates in `PreferencesiCloud` and `PreferencesiCloudDevices` (both OSs). |
| `routePlanning`     | `today_route`        | Supporter card in place of Find Shortest Route on `TodayRoute` (preview).    |
| `buddyColor`        | `buddy_color`        | Color picker on a buddy's detail screen (`Buddy`).                           |

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

| Event                           | Meaning                                                                                                                                                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supporter_manage_viewed`       | The sheet opened, once per open after the store product loads. `state` (`renewing`, `ending`, `paused`, `none`), `will_renew`, `pause_options` (count), `pause_unavailable_reason` (or null), `product_lookup_failed`. |
| `supporter_pause_started`       | An App Store pause length was tapped; `months` is 1, 3, or 6.                                                                                                                                                          |
| `supporter_pause_completed`     | The App Store accepted the free promotional offer.                                                                                                                                                                     |
| `supporter_pause_cancelled`     | The App Store purchase sheet was dismissed.                                                                                                                                                                            |
| `supporter_pause_failed`        | The offer couldn't be signed or redeemed; `error_code` and `offline`.                                                                                                                                                  |
| `supporter_manage_store_opened` | The store's subscription management opened. `intent: pause` is Android's Pause in Google Play; `intent: cancel` is the footer button on both platforms.                                                                |

All carry `source` (`paywall`, `settings`), `billing` (`monthly`, `annual`,
`other`), and `store`. `supporter_manage_store_opened` records intent only:
cancelling, changing the amount, and Google Play pauses happen in the store, so
their outcomes come from RevenueCat, as does whether paused Supporters resume
paying. No prices, product identifiers, or dates are sent.

## iCloud Sync and recovery

Android's Google Drive Sync (ADR 0019) sends the same `icloud_sync_*`,
`icloud_restore_*`, and `icloud_account_changed` events from the same code;
split them by the SDK's `$os_name`. On Android, `icloud_sync_upload_failed`
means Google storage is full, and `icloud_account_changed` means a different
Google Account was connected. Drive adds three events of its own:

| Event                          | Interpretation                                                                                                                                                                                                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `google_drive_connect_outcome` | A user tried to connect Google Drive. `source` (`settings`, `onboarding`, `reconnect`), `outcome` (`connected`, `canceled`, `scopeDenied`, `network`, `misconfigured`, `unavailable`, `unknown`), and `switch_account`. `misconfigured` means no OAuth client matches the build. |
| `google_drive_access_lost`     | Google stopped granting Drive access silently (revoked or expired), so sync waits for Reconnect. Once per loss.                                                                                                                                                                  |
| `google_drive_disconnected`    | The user disconnected Google Drive in Settings. Turning sync off with it also sends `icloud_sync_enabled_changed` (`source: google_drive_disconnect`).                                                                                                                           |

No account ids, emails, or hashes are sent.

Retain committed enable/disable transitions (`icloud_sync_enabled_changed`) and
bounded `source`: settings, supporter default/lapse, or onboarding restore.
Unchanged values, hydration, and developer resets do not emit transitions.
`icloud_sync_enable_deferred` keeps the bounded incomplete-read reason; paused,
upload failed/recovered, and account-changed outcomes remain.

First-enable viewed/chosen/outcome/dismissed describes conflict resolution. Manual
sync and reset retain started/outcome; reset adoption remains.
`icloud_sync_manual_outcome` has `outcome` `completed`, `failed`, `offline` (the
OS reported no connection, so nothing was tried), `needs_reconnect` (Android,
Google Drive needs the user again) or `paused` (Cloud Sync's server switch is off
or the account isn't entitled, checked again first; nothing failed); a failure carries the transport's
`error_code` (`network`, `rate-limited`, `server-error` (Cloud Sync's server
failed), `storage-full`, `unauthorized`, `not-found`, `unknown`, or `none`). It
answers how often "Sync now" fails, and why. `icloud_restore_probe_result` has
`status: offline` when onboarding couldn't reach the cloud to look for a backup.
Image toggle/outcome, automatic enable outcome, cloud photo removal, and device
remove/failure remain. Device list views, generic sync notices, and
resolution-link clicks are removed. A local manual-sync completion does not
prove Apple's cloud replication finished. No device IDs/names, filenames,
records, or payloads are included.

### Cloud Sync

Cloud Sync (ADR 0030) runs on the same engine, so it sends the same
`icloud_sync_*` events; split them by the device's option with the events
below. Each device syncs through one option: Cloud Sync, iCloud/Google Drive
(`platform`), or `off`.

| Event                              | Interpretation                                                                                                                                                                                                                                                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cloud_sync_default_outcome`       | A device that never chose a sync option tried Cloud Sync as its default. `outcome`: `seed`, `pull`, `conflict` (it asks Merge or Replace), `incomplete`, `unavailable`, `not_entitled`, `disabled`, `no_session`, or `failed`.                                                                                              |
| `cloud_sync_option_changed`        | A switch finished. `from` and `to` (`cloud`, `platform`, `off`), and `source` (`settings`, `offer`, `tools`).                                                                                                                                                                                                               |
| `cloud_sync_switch_failed`         | A switch couldn't happen and nothing changed. `from`, `to`, `source`, and `reason` (`not_entitled`, `disabled`, `no_session`, `unavailable`, `incomplete`, `offline`, `account_changed`).                                                                                                                                   |
| `cloud_sync_offer_answered`        | A device on iCloud/Google Drive answered the one-time offer to switch. `choice`: `switch` or `dismiss`.                                                                                                                                                                                                                     |
| `cloud_sync_account_changed`       | The server account behind Cloud Sync changed (a QR code or recovery key to another account), so sync stopped and the device decides again. `source` (the identity check's trigger) and `sync_was_enabled`.                                                                                                                  |
| `cloud_sync_photos_storage_full`   | A photo didn't upload because the account's Cloud Sync photo storage is full (ADR 0040 §6). At most once a day a device. `photos`: the account's photo count, `<100`, `<1000` or `1000+`.                                                                                                                                   |
| `cloud_sync_photo_transfer_failed` | A Cloud Sync photo didn't upload or download, for a reason other than a full account or being offline. At most once a day a device for each `source` and `reason`. `source`: `upload` or `download`; `reason`: the transport's class (`too-large`, `server-error`, `rate-limited`, `unauthorized`, `not-found`, `unknown`). |

They answer how many devices use each option, whether the default and the offer
move devices to Cloud Sync, and why switches fail. No account ids, slot ids,
device names, or records are sent.

## Calendar Sync and notification badges

Calendar Sync is available on iOS and Android. The onboarding `calendarSync` step
requires a build with the native calendar module. `onboarding_calendar_setup_result` answers
whether **Add to Calendar** connects successfully, uses another publishing device,
or fails: `status` is `connected`, `elsewhere`, or `error` with a bounded
`error_key`. Skip records `onboarding_step_skipped` with `step_id: calendarSync`.
Successful setup also records `calendar_connected` (`created`: boolean).
The one-time `calendar_sync` tray invitation retains setup behavior; outcomes use
`calendar_connected` / `calendar_sync_failed`, without separate tray click events.
`calendar_disconnected` records local disconnect (`removed_events`: boolean;
`source`: `settings`, `tray` for the paused notification's Turn Off,
`onboarding` for Skip after a failed setup, or `tools` when developer tools
generate mock data, reset, or clear calendar events).
`calendar_sync_failed` includes bounded `error_key` and `background`: boolean.
The generic errors (`calendarConnectionError`, `calendarConnectionErrorAndroid`,
`calendarCreateError`) add `native_code`, the code the calendar module reported
(for a failed create, the cause behind it): `CALENDAR_UNAVAILABLE` (an iCloud or
calendar operation failed without a code of its own), `CALENDAR_BUSY`,
`CALENDAR_JOURNAL`, `CALENDAR_DEVICE_UNKNOWN`, `CALENDAR_STATE_CHANGED`,
`CALENDAR_INVALID_URL`, `CALENDAR_CREATE_FAILED` (the account refused the new
calendar), or `other`. `calendarNoSourceError` means setup, or Choose a calendar
in Calendar Sync settings, found no account that can hold a new calendar (iCloud
Calendars off) and, for Choose a calendar, no existing calendar to use either.
Recovery attempts add `recovery` to `calendar_sync_failed` (the retry failed
too) and `calendar_connected` (setup succeeded on the retry): `try_again` when
the user tapped **Try Again**, or `open_settings` when the app retried by itself
after the user allowed calendar access in Settings and came back, or came back to
Calendar Sync settings while it showed `calendarNoSourceError`. Compare them
to first failures (no `recovery`) to see whether people get past an error. A
successful retry that only updates an already connected calendar sends no event.
Android uses the same events (break them down by the SDK's `$os_name`); it never
reports `elsewhere`. Its `calendar_connected` adds `local_calendar`: boolean, true
for a calendar stored only on the device, to show how many people publish to a
calendar their other devices can't see. Android's permission and generic errors
use `calendarPermissionErrorAndroid` and `calendarConnectionErrorAndroid`, so the
denied-permission share of Android setups is countable.
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

## Help Center

The Help Center's answers come from the website (ADR 0033). These answer whether
the search service finds answers people's own words miss, and whether new
content reaches devices.

| Event                          | When                                                                                                                           | Properties                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `help_center_search_completed` | A search settled: the search service answered or failed for the typed query. Once per session for each `source` and `outcome`. | `source: remote \| local` (`local`: offline, slow, an error, or nothing the device shows), `outcome: results \| no_results`. |
| `help_center_refreshed`        | Opening the Help Center checked the website for new content. Once per UTC day for each `outcome` and `reason`.                 | `outcome: updated \| unchanged \| failed`, `reason` when failed: `offline \| http \| invalid \| storage`.                    |

Never the query, the answers opened, or URLs. Individual keystrokes, opened
answers and copies are not captured.

## Announcements

Remote announcements in the notifications tray (the `announcement` flag; see
[`feature-flags.md`](./feature-flags.md#announcements)) answer whether people
read a notice or wave it away. `announcement_dismissed` is sent when the User
dismisses one (including Clear All) and `announcement_link_opened` when they tap
its link, each with `announcement_id`, the payload's `id` that we set. Reach
comes from the flag's `$feature_flag_called`. Never the text or the link.

## Update reveal

Returning installs that update across `UPDATE_REVEAL_VERSION` see the update
reveal once: the splash collapses into the app tile, then an optional tour of the
release. `update_reveal_opened` fires when it appears, with `source` (`launch`,
`tray`, `whats_new`, or `dev`), `entrance` (`intro` picks up from the splash,
`calm` is the same under Reduce Motion, `replay` fades in over the app), and
`reveal_version`. `update_reveal_closed` fires once when it closes, with
`source`, `method` (`later`, `close`, `done` for the last page's Take me home,
or `back` for Android's back button), `stage` (`intro` if it closed before the tour, `tour` otherwise),
`pages_viewed` and `page_count` (pages shown for this platform, role, Buddies
availability, and Apple Watch support, fixed when the tour opens; `watch` and
`siri` show only on an iPhone, `siri` only for roles that log hours),
`last_page` (a bounded page id such as `navigation`, `buddies`, `watch`, or
`more`), and `elapsed_ms` (wall
clock, including time in the share sheet). Compare
`stage: intro` with `method: later` to see who skips the tour, and
`last_page`/`pages_viewed` to see where tours end. A tour closed by quitting the
app sends no close event. Choosing Later leaves an `update_reveal` tray item
that replays it.

## Badges

Badges count calendar months, never hours, and are earned on the device (ADR
0019). These events answer whether people grow badges as they use the app,
how much history upgraders bring with them, whether anyone hides or stops
sharing them, and whether buddies encourage each other's badges. Properties are
the fixed catalog's ids, a badge count, and bounded keys: never record counts,
months, dates, buddy ids, or names.

| Product question                                               | Events / properties                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Do people grow badges as they use the app, and which ones?     | `badge_earned` (`badge`: a collection or One-time Badge id such as `monthsShared` or `firstBibleStudy`; `level`: 1–4, or 0 for a One-time Badge; `kind`: `collection` \| `one_time`; `after_action`: whether the User's own action just earned it, which offers the full-screen celebration, or it arrived another way and waits on the Home card, ADR 0021). Live unlocks only, from something done this month or last; history never sends it. Once per badge per device: a badge that arrives through iCloud Sync isn't sent again.                                                                                                   |
| Do unlock toasts work better than taking over the screen?      | `unlock_toast_shown` (`kind`: `badge` or `pet_item`), once per toast when it first shows. `unlock_toast_closed` (`kind`; `outcome`: `opened` for tapped open, `swiped`, `timeout`, `background` when the app left while it showed, `expired` when its moment passed behind a takeover, `replaced`, or `dismissed`), once per toast. Only after the User's own action, so a handful at most per session.                                                                                                                                                                                                                                  |
| Do unlocks that wait in the tray still reach people?           | `unlock_opened_from_tray` (`kind`: `badge` or `pet_item`), when View on a tray item opens the full-screen moment. Dismissing the item sends the tray's own events.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| How much history do upgraders and importers bring?             | `badges_history_found` (`count`: badges stored quietly). Once, on a device's first evaluation, when existing history already reaches badges. Later imports and restores add their badges quietly without an event.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Does the one-time welcome lead people to their badges?         | `badges_welcome_closed` (`action`: `look` for Take a look, which opens the profile, or `later` for Later or Android's back). Once per device at most: the "Your badges are here" screen shows only after a device's first evaluation finds history (the same moment as `badges_history_found`), never right after onboarding, on a launch that didn't show the update reveal, and closing it settles it.                                                                                                                                                                                                                                 |
| Do people hide badges, stop sharing them, or turn off alerts?  | `badges_setting_changed` (`setting`: `show` for Show badges in Preferences → Streaks & Badges, `share` for Badges in Buddies Settings, `alerts` for Badge Alerts; `enabled`; `scope`: `all` or `buddy` for `share` and `alerts`, from Buddies Settings for All Buddies or one buddy). Committed changes only.                                                                                                                                                                                                                                                                                                                            |
| Do people open their collection, and from where?               | `badges_opened` (`source`: `profile_overlay`, `profile_card`, `celebration` for See all badges on a new badge, `welcome` for Take a look when the profile isn't set up yet, `settings`, or `other`; `earned_count`: badges the User has earned, every level counted). Once per session and source. Opening one badge full screen sends nothing.                                                                                                                                                                                                                                                                                          |
| Do people look through a buddy's whole collection?             | `buddy_badges_opened` (no properties). See all on a buddy's page, once per session. Never which buddy or what they hold; opening one of their badges full screen sends nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Do buddies encourage each other's badges, how, and from where? | `badge_reaction_sent` (`emoji`: the reaction's id, `party` \| `confetti` \| `fire` \| `clap` \| `thumbsUp` \| `raisedHands`; `level`: the buddy's badge level, 1–4, or `null` for a One-time Badge; `source`: `bell` for Encourage on the buddy's news in the notification bell, `badge_view` for the full-screen badge). Once each time the User picks a reaction on a buddy's badge, including a change to another one; picking the one already chosen sends nothing. Comparing `source` shows whether one-tap Encourage in the bell brings more encouragement than the badge view. Never which buddy, whose badge, or the collection. |

## Pet companion

The Pet Companion is an opt-in Home section (`docs/pet-companion.md`). These
events answer whether people take the offer, which animals they choose, whether
a pet that fell asleep or died brings them back, whether people decorate its
room, how its room items unlock, whether they share it, and whether anyone finds
the hidden moments. Properties are fixed ids only: never the pet's name, hearts,
days, keepsakes, streak count, or anything about a visiting buddy. Pats, rubs and tricks send
nothing per touch.

| Product question                                                | Events / properties                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Do people want a companion when Home offers one?                | `pet_prompt_answered` (`choice`: `choose` for Choose a pet or a tap on one of the animals, which opens the picker, or `not_now`, which hides the offer until Pet is turned on in Settings → Preferences → Home Screen; `species`: the animal tapped, only for a tap on one). Once per answer.                                                                                                                                                                                                                                                                                                                                               |
| Which animals and coats do people pick?                         | `pet_adopted` (`species`: `lion` \| `dog` \| `cat` \| `donkey` \| `lamb`; `coat`: the species' coat id, `default` for one-coat species). Once per adoption, from the picker. Comparing it with `pet_prompt_answered` (`choose`) shows how many leave the picker without adopting.                                                                                                                                                                                                                                                                                                                                                           |
| Do people finish the intro after adopting?                      | `pet_intro_closed` (`step`: the furthest of the 3 steps seen, 1–3; `finished`: `true` when Done was pressed, `false` when the sheet was pulled down first). Once per adoption, when the intro closes.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Do people find the pet's details by tapping its card?           | `pet_details_opened` (`from`: `header` for the card's name row, `room` for a tap on the room away from the pet, `menu` for Hat & Room… in the long-press menu). Once per opening.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Do people change their pet later, and to what?                  | `pet_appearance_changed` (`species`, `coat` as above). Once per saved Change Pet that changes something.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Do people decorate the room, and with what?                     | `pet_room_changed` (`part`: `hat` \| `windowTime` \| `windowSeason` \| `wallColor` \| `wallPattern` \| `floor` \| `bed` \| `shelf` \| `lamp` \| `sign`, with `option` the picked option id, e.g. `hat` / `cap`, `floor` / `stone`, `sign` / `plan`, `windowTime` / `live`; or `part` `window` with `option` `live` \| `fixed` for the Live window switch; `from`: `room` for a pick in the pet's details, `shop` for an item put on right after buying it in the Shop). Once per change; picking the option already chosen sends nothing. Which items get picked soon after they're bought or found shows whether they're worth saving for. |
| Do the secret items get found, and how fast?                    | `pet_room_item_unlocked` (`item`: the secret item or hat id, e.g. `hat:duck`; `by`: `secret`, the only value since the Shop, ADR 0035). Once per item, when the device first stores it as found, so at most 76 per companion; an item synced from another device isn't sent again, but two devices that find the same item before syncing each send it. Regular items are bought, not unlocked (`pet_item_bought`). The dev harness's opened secrets (`override({ secrets: true })`) send nothing.                                                                                                                                          |
| Does the User open a pet item's reveal into Decorate Room?      | `pet_unlock_reveal_closed` (`action`: `decorate` for Try it on or Decorate Room, `done` for Done, the backdrop or Android's back). Once per reveal, which opens only from an unlock toast or tray item.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Do people visit the Shop, and from where?                       | `pet_shop_opened` (`from`: `room` for the Shop button in the pet's details, `more` for the More in Shop card that ends a part's items there, opening the Shop at the first one still for sale, `menu` for Shop… in the Home card's long-press menu). Once per opening of the Shop.                                                                                                                                                                                                                                                                                                                                                          |
| What do people buy, and at what price?                          | `pet_item_bought` (`item`: the room item or hat id, e.g. `floor:stone`, `hat:cap`; `part`: as in `pet_room_changed`; `price`: what it cost in coins, a whole number). Once per purchase, so at most 29 per companion. Comparing it with `pet_shop_opened` shows how many browse without buying, and which prices hold people back. Coins are never sold, so no money is involved.                                                                                                                                                                                                                                                           |
| Do people keep the reward animations, or turn them off?         | `reward_animations_changed` (`enabled`). Once per change of the Reward animations switch, in Settings → Rewards or Pet Settings. It's on by default, so the count that turn it off answers whether the stack wears thin.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Which reward sounds do people pick?                             | `reward_sounds_changed` (`sounds`: `punch` \| `retro` \| `soft` \| `off`). Once per tap on a sound set in Settings → Rewards or Pet Settings, the current one included (each tap previews it). Turning sounds off here is separate from Settings' audio switch, which this doesn't see.                                                                                                                                                                                                                                                                                                                                                     |
| Is the reward stack too long, and where do people cut it short? | `reward_stack_skipped` (`slot`: `toast` above the bottom toasts, `celebration` inside a streak celebration, `card` over the pet's Home card; `phase`: `play` \| `hold` \| `slam` \| `fly` \| `count`; `lines`: how many lines the run had; `played`: how many had stomped in). Once per tap that ends a run early. A run that plays to its end sends nothing, so compare against saves (`time_entry_created`, `visit_created`). No amounts or labels.                                                                                                                                                                                       |
| Do people share their pet?                                      | `pet_share_opened` (`from`: `menu` for Share… in the card's long-press menu, `details` for Share in its details), once per opening of the share card; then `pet_shared` (`sign`: whether the picture included the wall sign), once per Share on the card, after the share sheet with the picture closes. Comparing the two shows how many open the card without sharing it. The share sheet doesn't say whether the picture was sent, so read it as "the picture was offered"; failures send nothing (a toast says so).                                                                                                                     |
| Do people let buddies see their pet?                            | `pet_sharing_changed` (`enabled`; `scope`: `all` or `buddy`, from Buddies Settings for All Buddies or one buddy). Once per change of the Pet switch in Buddies Settings (shown once a companion exists). Turning it off stops the pet visiting buddies' rooms.                                                                                                                                                                                                                                                                                                                                                                              |
| Does a sleeping pet or one that died bring people back?         | `pet_woken` (`from`: `asleep` \| `died`). Once per wake, which can happen at most once a day.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Does anyone find the hidden moments?                            | `pet_secret_found` (`secret`: `trick` \| `twirl` \| `gift` \| `paradise` \| `star` \| `rainbow` \| `visitor` \| `gold`). Once per secret per installation (a flag in the separate `pet-secrets` MMKV store, holding only the ids): the first time a trick or the twirl plays, a gift is kept, the paradise walkers or shooting star show, the rainbow shows, a buddy's pet visits, or the hearts are gold.                                                                                                                                                                                                                                  |
| Do people use a visiting buddy pet to get to their day?         | `pet_visitor_action` (`action`: `activity` for View Plan or View Follow-up, `buddy` for View <buddy>, `hide` for Hide <buddy>'s Pet; `activity`: `plan` \| `followUp` \| `followUpInvitation`, what the visit came from; `from`: `home` for a visiting pet's long-press menu on the card, `details` for the Visiting Today list opened from the pet's details). Once per menu choice or row tap; nothing about the buddy. Turning visits off in Pet Settings sends `buddies_sharing_changed` (`setting: pet_visits`).                                                                                                                       |

## Sharing the app

`app_share_tapped` records a tap on Share Link, with `source` (`settings` for
Settings → Share WitnessWork; `update_reveal` came from the update reveal tour's
last page in 1.44.0 and 1.44.1 before their OTA update replaced it with Take me
home).
`app_share_completed` follows with the same `source` and `outcome`: `dismissed`
when iOS reports the share sheet was closed without sharing, otherwise
`shared`. Android's share sheet doesn't report a choice, so every Android
completion reads `shared`; treat it as "the sheet opened". `app_share_failed`
carries only `source`. The message holds the two store links and nothing about
the user. QR code scans happen on the friend's phone and can't be measured;
screen tracking (`ShareApp`) shows how often the code is opened from Settings.

## Navigation preferences

Users can reorder the Home, Contacts, Progress, and Schedule tabs in Preferences
→ Tab Order; Home remains the launch tab. `tab_order_changed` measures adoption
of this preference with `order` (comma-separated bounded route names, including
Progress even when hidden) and `source` (`arrows` or `menu`). Generic menu and
navigation interactions remain removed.

## Progress cards

Progress → Month shows the month's report, then cards the User picks: Daily
Pace, Studies, Days Out, Visits, Credit, Weeks, Projected Month, Days, Service
Year, Year Pace, Streak, Lifetime, and Mileage. They're edited in place, like
Home Screen widgets (Edit Cards, or holding a card, which lifts it): remove,
resize by the corner handle, drag to move, Add Cards, Reset Cards. Edits save as they're made. The product questions are
which cards people want and whether they find the editor; one event per
editing session answers both:

| Event                       | When / properties                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `progress_cards_customized` | Editing a Progress tab's cards finished (Done, leaving the screen or the tab, or Android's Back) with a different layout than it started with. `tab`: whose cards, `month`, `year`, or `all_time`. `source`: how editing started, `footer` (Edit Cards after the cards), `card` (holding a card, which lifts it), or `add` (Add Cards with no cards left). `header` (Edit Cards in the header) stopped once that button left the header (ADR 0036). `cards`: the layout afterwards as comma-separated `card:size` pairs. `card_count`, `added`, `removed`, `resized` (counts), `moved` (two cards changed order), `reset` (the layout ended at the defaults, by Reset Cards or by hand). |

Opening the editor without changing anything sends nothing. No hours, goals,
names, or dates are sent; card ids and sizes are a fixed list.

## Home sections

Home's sections (Approaching Conversations, Service Report, Quick Actions,
Mileage, This Week, Timer, Did You Know, and Service Year Summary on iPad) are rearranged in place
the same way: Edit Home Screen in a section's long-press menu, or holding empty
space, starts editing; sections jiggle, drag to move, the minus hides one (with
Undo), and Add Sections shows hidden ones again. Preferences → Home Screen still
does the same with switches and arrows. Whether people find and use the in-place
editor is the question; one event per editing session answers it:

| Event                    | When / properties                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `home_screen_customized` | Editing finished (Done, tapping empty space, leaving Home, or Android's Back) with a different layout than it started with. `source`: `menu` (a section's Edit Home Screen), `footer` (the Edit Home Screen button after the sections), or `background` (holding empty space). `sections`: the shown sections afterwards, comma-separated, in order. `hidden`, `shown` (counts hidden and shown again), `moved` (two sections changed order). |

Opening the editor without changing anything sends nothing. Section keys are a
fixed list; nothing in the sections is sent.

## Plan details

Tapping a Plan opens Plan Details: the Plan read-only, with Edit and a More menu
in the header and its buddies below. Screen tracking (`Plan Details`,
`previous_screen`) shows its reach and where people come from. Edit,
Duplicate, and Log as Time are taps, so they send nothing here; what they lead
to is already counted (`plan_created`, `time_entry_created`). One event counts
the outcomes nothing else does:

| Event                 | When / properties                                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `plan_details_action` | `action`: `delete` (a delete was confirmed) or `invite_buddy` (Invite Buddies added a buddy in place). `plan_kind`: `day` or `recurring`. `linked`: the Plan follows a buddy's invitation. |

Invite for a buddy who asked to join sends `buddy_join_request_answered`
(`invited`), as it does from the bell. Answering a buddy's invitation here sends
`buddy_invitation_answered` with `source: plan_details`. Plan titles, dates,
times, places, notes, ids, and buddy names are never sent.

## Visit details

Tapping a Visit (a timeline card, Contact Details' Up Next card, Home's
Follow-up card, a Follow-up reminder, a buddy's reply, or an outgoing Follow-up
on a buddy's page) opens Visit Details in a sheet: the Visit read-only, with
Edit and a More menu in the header, its Follow-up, and the buddies invited
along. Screen tracking (`Visit Details`, `previous_screen`) shows its reach and
where people come from. Edit, Log Visit, Reschedule, and Dismiss are already
counted downstream (`visit_created`, `follow_up_rescheduled`,
`follow_up_dismissed`). One event counts the outcomes nothing else does:

| Event                  | When / properties                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `visit_details_action` | `action`: `delete` (a delete was confirmed) or `invite_buddy` (Invite Buddies added a buddy to the Follow-up in place). `not_at_home`: the Visit was a Not at Home. `has_follow_up`. |

Contact names, notes, topics, dates, ids, and buddy names are never sent.

## Schedule calendar

The Schedule tab has a Month view (continuous weeks with this and next month's
goals above them) and a Year view (the Service Year's twelve months), switched
in the header, by pinching, or by tapping a Service Year divider. The product
question is whether people zoom out to plan across months and the Service
Year, and which way in they find.

| Event                       | When / properties                                                                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schedule_year_view_opened` | The Year view opened. `source`: `toggle` (header switch), `pinch`, or `divider` (a Service Year divider in the weeks). Capped once per session and source. |

Zooming back into a month, scrolling between months, and jumping to today send
nothing. No dates, goals, or hours are sent.

## Route planning

Plan Today's Route is a Supporter feature on iOS and Android. Anyone can open
it: non-Supporters see their own stops, with a Supporter card in place of Find
Shortest Route. That card is the `today_route` gate placement (see Supporter
feature conversions); its button opens the paywall directly, so this placement
has no `supporter_gate_viewed`/`supporter_gate_clicked` sheet stage. An entry
event answers which placements people find, and three outcome events answer
whether Supporters use it, whether a planned route turns into a drive, and why
planning fails:

| Event                           | When / properties                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `route_plan_entry_opened`       | An entry point opened the route screen. `surface`: `home_follow_ups` (Plan Route on Home's conversations card), `home_day` (Home's day sheet), `schedule_day` (Schedule's day sheet), `schedule_inspector` (iPad), `plan_menu` (Plan Route in a Plan's menu, which ties the route to that Plan), `day_menu` (touching and holding a day), or `contacts_map` (the Today's Route chip on the Contacts map); `supporter` (boolean); `future_day` (boolean: a day after today, planned ahead). |
| `route_plan_created`            | Shortest Order put the stops in order. `stop_count` (stops in the route, a chosen start included), `removed_count` (stops the user took out), `start` (`current_location`, `stop` for the first stop, or `place` for a chosen place or Plan), `optimized` (always `true` from the route builder).                                                                                                                                                                                          |
| `route_plan_failed`             | Planning stopped with `error_code`: `location` (no fix), `location_denied`, `offline`, `timeout`, `no_route`, `daily_limit`, `rate_limited`, `supporter_required`, `supporter_check_failed`, `suspended` (account suspended), `device_unverified` (this device can never open an account session), `verify_later` (verifying this device has to wait), `unavailable`, or `failed`. `supporter_required` on a device that shows Supporter status points at entitlement drift.               |
| `route_plan_navigation_started` | The first navigation-app hand-off for a planned route: `app` (`apple`, `google`, `waze`), `handoff` (`route` for one multi-stop link, `stopByStop` for one stop at a time), `stop_count`. Later stops and repeat taps aren't captured. Opening the app is not proof the drive happened.                                                                                                                                                                                                    |
| `route_stops_reordered`         | The first time in a visit that the user moved a stop (drag or Move Up/Down). `stop_count`. Later moves in the same visit aren't captured.                                                                                                                                                                                                                                                                                                                                                  |
| `route_stop_added`              | A stop the day didn't already have was added: `source` (`place` from search, `contact`, `coordinates` pasted into search, `map` from the Add Stop sheet's map, `map_pin` from touching and holding the route map, `home`, `kingdom_hall`, or `contacts_map` for Contacts picked on the Contacts map with Plan Route). `count` (Contacts added at once) comes only with `contacts_map`; it counts those not already on the route that fit.                                                  |
| `route_plan_linked`             | The route was tied to one of the day's Plans. `starts_at_plan` (boolean: the Plan has a place, so the route now starts there); `source`: `menu` (picked in Details), `plan` (opened from the Plan's menu), or `new_plan` (a Plan made from the route to invite buddies).                                                                                                                                                                                                                   |
| `route_finish_set`              | Where the day finishes was changed. `finish`: `last_stop`, `start` (back to the start), `home`, `kingdom_hall`, or `place` (any other place).                                                                                                                                                                                                                                                                                                                                              |
| `route_saved_place_set`         | Home or the Kingdom Hall was saved for one-tap use. `place`: `home` or `kingdom_hall`. Never the address.                                                                                                                                                                                                                                                                                                                                                                                  |
| `route_buddy_invited`           | A buddy chip in the route builder's Invite Buddies row invited a buddy to the route's Plan. Taking one off isn't captured. No properties.                                                                                                                                                                                                                                                                                                                                                  |

Opening the screen is covered by screen tracking (`TodayRoute`), so
`$screen` → `route_plan_created` → `route_plan_navigation_started` is the
adoption funnel. Stop names, addresses, coordinates, times, and record ids are
never sent; only counts and the bounded keys above.

## Apple Watch and Wear OS

Neither watch app has an analytics client. The phone captures watch events
(the iPhone for an Apple Watch, the Android phone for a Wear OS watch) when its
JavaScript next runs, which can be well after the action on the watch. The
phone's platform (`$os`) tells the two watches apart. Events never carry entry
ids, dates, durations, Type names or timer values.

| Event                          | When / properties                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `time_entry_created`           | An entry made on the watch is saved on the phone. `source: watch`, `watch_origin` (`app`, `shortcut` for Siri/Shortcuts, `timer` for a saved timer; on Wear OS `ongoing_activity` for Stop Timer on the running timer's notification), `entry_mode` (`hours`, or `checkbox` for the shared-in-ministry marker), `has_category`, `has_note: false`. A repeated delivery of the same entry is not counted again.                                                                                                                                                                                                                                                                                  |
| `mileage_trip_added`           | A trip logged with Siri on the Apple Watch is saved on the iPhone. `source: watch`, `entry_mode: distance`, `round_trip`, `has_note: false`, `logged_again: false`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `watch_timer_action_completed` | The watch started or paused the phone's timer. `action` (`started`, `paused`), `origin` (`app`, `shortcut`, `up_next` for Start Timer on an Up Next Plan; on Wear OS `tile` for the tile's button and `ongoing_activity` for Pause Timer on the running timer's notification). Watch requests the phone never received aren't recorded.                                                                                                                                                                                                                                                                                                                                                         |
| `watch_entry_skipped`          | A watch or Siri entry wasn't saved. `reason` (`deleted` when it was deleted on a device before it arrived, `invalid`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `watch_entry_adjusted`         | A watch or Siri entry was saved as Standard because its Type was deleted first. `reason: category_removed`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `watch_app_status`             | At most once a week per phone while the watch app is installed: the adoption baseline for both watches. `complication_enabled` (a WitnessWork complication is on a watch face); `progress_complication` and `up_next_complication` (that complication is on a face or in the Smart Stack); `progress_complication_styles` (the Monthly Progress styles in use, comma-separated: `default` for the ring and the other families, `range` for the gauge from zero to the goal, `symbol` for the gauge with a clock; omitted when none is), all omitted until the watch app has reported its complications. On Wear OS also `tile` (the Monthly Progress tile is added); never sent from an iPhone. |

## Siri and Shortcuts

Answers which Siri actions people use, on which device, and what stops them.
Siri on the iPhone and iPad runs in an App Intents extension that can't reach
analytics, so it leaves events for the app to capture when its JavaScript next
runs. The watch's actions are recorded by the iPhone when it receives them;
failures on the watch aren't recorded. Events never carry ids, dates,
durations, distances, Type or car names.

| Event                   | When / properties                                                                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `siri_action_completed` | A Siri or Shortcuts action finished. `action` (`add_time`, `start_timer`, `pause_timer`, `stop_timer`, `log_trip`), `device` (`iphone`, `ipad`, `watch`). On the watch, timer actions also send `watch_timer_action_completed` with `origin: shortcut`. |
| `siri_action_failed`    | An action on the iPhone or iPad couldn't finish. `action`, `device`, `reason` (`not_set_up`, `hours_logging_off`, `invalid_duration`, `timer_empty`, `timer_too_long`, `mileage_off`, `no_car`, `invalid_distance`, `failed`).                          |
| `time_entry_created`    | An entry made with Siri on the iPhone or iPad is saved. `source: siri`, `entry_mode: hours`, `has_category`, `has_note: false`. Watch entries use `source: watch` (above).                                                                              |
| `mileage_trip_added`    | A trip logged with Siri on the iPhone or iPad is saved. `source: siri`, `entry_mode: distance`, `round_trip`, `has_note: false`, `logged_again: false`.                                                                                                 |

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

### Buddy detail

A buddy's detail screen answers whether people plan together from it and make
it their own. All properties are bounded enums; no names, nicknames, relay ids,
or dates are sent.

| Event                             | When                                                                                                                                                | Properties                                                                                                                |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `buddy_plan_invite_opened`        | Invite to a Plan opened the Plan form with the buddy preselected.                                                                                   | `source: buddy_detail \| buddy_detail_day`. Saving still sends `plan_created` (`invited_buddies`).                        |
| `buddy_plan_same_time_opened`     | Plan the Same Time opened a prefilled Plan form.                                                                                                    | `source: buddy_detail \| buddy_plans_for_day`, `has_start_time`.                                                          |
| `buddy_invitation_answered`       | The User answered or changed their answer to a buddy's Plan or Follow-up invitation.                                                                | `source: notifications \| buddy_detail \| plan_details \| follow_up_details \| home`, `type: plan \| followUp`, `answer`. |
| `buddy_invitation_answer_retried` | Try Again on an answer that reads Not sent yet, once the send settles. Shows how often answers fail to send and whether retrying gets them through. | `sent` (whether the answer reached the relay).                                                                            |
| `buddy_customized`                | A nickname was saved or a color was chosen (Supporter-only).                                                                                        | `setting: nickname \| color`.                                                                                             |

### Plans from a buddy's invitation

A Plan the User joined by answering Going follows its organizer, and the User
keeps their own hours, reminder, and Type. These answer whether people make
those Plans their own, and whether seeing who's going leads people who meet on
a Plan to pair. Never names, relay ids, Plan details, or how many are going.

| Event                     | When                                                                                                                                                          | Properties                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `buddy_linked_plan_saved` | Save on the Edit form of a Plan that follows a buddy's invitation (hours, reminder, or Type).                                                                 | `own_hours`: the User's hours differ from the organizer's after saving.                                                                                              |
| `buddy_guest_tapped`      | Someone on Who's Going who isn't the User's buddy was tapped (`opened`: the note on how to become buddies showed), or its Show My Buddies Code (`show_code`). | `action: opened \| show_code`. Pairings that follow show as `buddy_paired`; the Buddy Code screen's view has `previous_screen`. Tapping a buddy there sends nothing. |

### Buddies sharing

`buddies_sharing_changed` answers what people withhold from buddies, and from
whom, so the defaults can follow what they actually choose: whether they turn
off their photo, pioneer status, streak, or Plans, hide Plan start times, hide
buddies from the calendar, or pause sharing, and for how long. `scope` says
whether the change was for All Buddies or for one buddy over them, which shows
whether per-buddy settings get used. Committed changes only. Badges keep
`badges_setting_changed` (`setting: share`, now with `scope`), and alerts keep
`buddy_join_request_notifications_changed` and `badges_setting_changed`
(`setting: alerts`), each with `scope`.

`buddies_setting_reset` and `buddies_settings_undone` answer whether the way
back is found: a buddy's setting sent back to All Buddies, and Undo in Buddies
Settings' header.

| Event                     | When                                                                                                                   | Properties                                                                                                                                                                                                                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `buddies_sharing_changed` | A setting changed in Buddies Settings (All Buddies or a buddy's), the Buddies intro, or Resume on the Buddies screen.  | `setting: photo \| tenure \| streak \| plans \| plan_times \| calendar \| pet_visits \| pause`; `scope: all \| buddy`. Switches send `enabled`; `plan_times` sends `value: exact \| timeOfDay \| daysOnly`; `pause` (All Buddies only) sends `value: off \| week \| month \| indefinite`. No names, relay ids, or dates. |
| `buddies_setting_reset`   | The undo arrow beside one of a buddy's settings, or the one at the top that has them follow All Buddies in everything. | `setting`: one of the above, `join_alerts`, `badge_alerts`, `badges`, `pet`, or `all` for the one at the top; `scope: buddy`. Never which buddy.                                                                                                                                                                         |
| `buddies_settings_undone` | Undo in Buddies Settings' header took back a change made there.                                                        | `scope: all \| buddy`: where the change was made.                                                                                                                                                                                                                                                                        |

### Buddies pairing

`buddies_opened` (`source: schedule_row | home_together | profile | sidebar |
plan_form | route_builder`, `has_requests`) counts the ways into Buddies.
`schedule_row` is the Buddies row under Schedule's title (before 1.46.0,
`schedule_header` was its header button), `home_together` is the Together
section Users can add to Home, `profile` is the Buddies row on the Profile, and
`sidebar` is the iPad sidebar's Buddies tab. `plan_form` is Invite Buddies on a
one-time Plan's form before any buddy is confirmed, and `route_builder` is
Invite Buddies in the route builder's Details before then, so they show whether
wanting to invite someone brings people to set Buddies up. ADR 0036 makes
Buddies a tab once the Buddies screen reaches 20% of weekly active Users;
compare the sources to see which entry point brings them.

`buddy_paired` answers which platform pairings complete: iPhone with iPhone,
iPhone with Android, Android with Android. Each side records it once, when the
pairing completes: the inviter after confirming a request (`role: inviter`),
the invitee when that confirmation arrives (`role: invitee`). Count
`role: inviter` for pairings; compare both roles to see confirmations that
never reached the other side. The User's own platform is the event's `$os`.

| Event          | When                         | Properties                                                                                                                                                             |
| -------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `buddy_paired` | A Buddies pairing completed. | `role: inviter \| invitee`, `buddy_platform: ios \| android \| unknown` (`unknown` when the buddy's build predates the field). No names, relay ids, or invite details. |

The buddy's platform travels inside the end-to-end encrypted invite card, claim,
and `pair.confirmed` (see `docs/buddies-protocol.md`); the relay never sees it,
and the app never shows it.

### Buddies on another device

`buddies_device_joined` answers whether Buddies follows people to their other
devices: how many Users with iCloud Sync get Buddies started on a second device
without setting it up, and whether it arrives with their buddies. It's sent
once per device, when Buddies starts there from the key the User already has,
or from the key a handoff just brought (`via: handoff`).

| Event                   | When                                                                                                                                 | Properties                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `buddies_device_joined` | Buddies started by itself on a device with iCloud Sync (or Drive) on, or right after Set Up Another Device brought the account here. | `buddies`: how many buddies it restored (0–5); `via: sync \| handoff`. No names, relay ids, or dates. |

### Invitations not sent

`buddies_share_not_sent` answers how often a Plan or Follow-up invitation
never reaches a buddy, and why: refused while the User's account is suspended
(it isn't held for later), or the pairing had ended before it went (found by a
send or a sync, or the buddy's inbox was gone). Sent once per reason for a burst
of them (half a second), from the device that tried; the User sees an alert and
a "Not sent" row on the Plan.

| Event                    | When                                                            | Properties                                                                                         |
| ------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `buddies_share_not_sent` | Invitations were found that can't be sent and won't be retried. | `reason: suspended \| gone`, `buddies` (how many, 1–5). No names, relay ids, Plan dates, or times. |

### Buddies alerts

`buddies_alerts_shown` answers whether named Buddies alerts work in the field,
and why they fall back to the generic template when they don't (for example, a
Keychain access group missing from a production build would show up as
`noContext`). Alerts are counted on the device: by the iOS Notification Service
Extension in the App Group, and by the Android push task. The app sends the
counts once when it next comes to the foreground with Buddies running, then
clears them. The User's platform is the event's `$os`.

| Event                  | When                                                       | Properties                                                                                                                                                                                                                                                            |
| ---------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `buddies_alerts_shown` | Buddies alerts arrived since the last report (foreground). | `named`, `fallback`, `quiet` (counts; `quiet` is a push muted on this device), `fallback_reasons` (comma-separated, sorted: `noContext`, `noEvent`, `unknownSender`, `unreadable`, `unknownKind`, `fetch`, `timeout`, `error`). No kinds, names, relay ids, or dates. |

### Buddies Alpha feedback

The Buddies screen's Alpha badge, its More menu, and Buddies Settings open the
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

## Account and recovery key

These answer whether people save their recovery key (ADR 0026), whether
recovery keys bring accounts to new phones, and how often using one costs
someone their Buddies data. They're rare by nature: once a session at most for
viewing, and once per action otherwise.

| Event                   | When                                                                                           | Properties                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recovery_key_viewed`   | Settings → Account showed the recovery key. Once per session.                                  | `auth: device \| none` (the device's own authentication ran, or no screen lock is set), `created` (viewing it created the account key).                                                                                                                                                                                                                                                       |
| `recovery_key_exported` | The User copied the key, or the share sheet reported it shared.                                | `method: copy \| share`.                                                                                                                                                                                                                                                                                                                                                                      |
| `recovery_key_used`     | Use a Recovery Key finished, or showed that this device can't be verified.                     | `outcome: replaced \| unchanged \| declined \| failed \| unverified` (`unchanged`: the key was already this device's; `declined`: the User cancelled the warning; `unverified`: this device can never attest, so the form didn't show).                                                                                                                                                       |
| `account_key_replaced`  | This device's account key was replaced, from a recovery key, a handoff, or (dev builds) Tools. | `source: recovery_key \| handoff \| tools`, `buddies_removed` (count), `had_inbox`, `buddies_kept_elsewhere` (the old account's other devices keep its buddies, so only this device signed out of Buddies), `registered` (the new account's session opened right away), `same_account` (the key is the account this device was last on, after its key changed: nothing was left or released). |

Never the key, the recovery key, `accountPub`, the account id, or inbox ids.
Mistyped keys send nothing: the form refuses them before they can be used.

### Changing the account key

These answer whether people who start Change Account Key finish it, and where
it stops when it doesn't (ADR 0039; docs/account-key-change.md). A change is
rare: one of each per change at most. A change stopped at a step retries on
every launch and foreground, so its `resumed` and `failed` events are sent at
most once a day per stage.

| Event                          | When                                                                                                      | Properties                                                                                                                                                                                                                                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `account_key_change_started`   | The checks passed and the new key was made (step 1), before its recovery key shows.                       | `platform: ios \| android \| web`.                                                                                                                                                                                                                                                                                            |
| `account_key_change_completed` | Every step finished and the old key was deleted.                                                          | `platform`.                                                                                                                                                                                                                                                                                                                   |
| `account_key_change_resumed`   | A launch found a change the server committed and carried it on (after a crash or a lost answer).          | `platform`, `stage: committed \| stored \| resealed \| buddies-reset` (where it picked up).                                                                                                                                                                                                                                   |
| `account_key_change_failed`    | The change stopped: another device changed the key first, storing the key failed, or a later step failed. | `platform`, `stage` (the last stage recorded), `reason: conflict \| key_retired \| store \| step` (`conflict` and `key_retired`: another device changed the key first, and this device's new key was discarded; `store`: the platform store refused the key; `step`: re-sealing or the Buddies reset stopped, to be retried). |

Never a key, the recovery key, `accountPub`, the account id, slot or photo
ids, or a device name.

### Account sessions

These answer whether devices can open an attested account session (ADR 0027)
and why they can't. A device opens one when its account first connects, after
90 days, and after a session ends; refreshing the access token sends nothing.

| Event                    | When                                                                                          | Properties                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `account_session_opened` | A session opened.                                                                             | `reason: new \| expired \| ended \| unsaved \| handoff` (`expired`: the last one reached 90 days; `ended`: the server ended it, so refreshing it failed; `unsaved`: the keystore couldn't save a refreshed token, so the stored one was stale; `handoff`: the new phone in Set Up Another Device).                                                                            |
| `account_session_failed` | Opening one failed. Once per UTC day per reason. Offline and cancelled attempts send nothing. | `reason: attestation_device \| attestation_temporary \| attestation_failed \| unavailable \| upgrade \| rateLimited \| server` (`attestation_device`: this device or app can't be verified; `attestation_temporary`: Apple, Google, or the server couldn't check it just then), `server_reason`: ww-api's stable reason, such as `device_integrity_failed`, when it gave one. |

Never the account id, `accountPub`, session ids, tokens, the device label, or
the attestation itself.

### One RevenueCat customer per account

This answers whether a device joins the account's RevenueCat customer through
the sync data, which ADR 0040 §7 adds, or still only through the account file,
and how often a device without RevenueCat does so ahead of it. Adoptions are
rare: one when a device joins, and one when a purchase elsewhere moves the
account to another id.

| Event                | When                                                                                                               | Properties                                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `account_id_adopted` | This device adopted another device's RevenueCat id ([sync](./icloud-sync.md#one-revenuecat-customer-per-account)). | `source: account_file \| sync` (where the winning claim was seen), `revenuecat`: whether RevenueCat is set up on this device (false: Android without an SDK key; the id waits for it). |

Never the RevenueCat id, the account id, or the claim's time.

### Account devices and activity

These answer whether people look at their signed-in devices and account
history (ADR 0028), whether a reused sign-in is ever in front of them, and
whether signing a device out works.

| Event                       | When                                                              | Properties                                                                                               |
| --------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `account_devices_viewed`    | Signed-In Devices listed the account's devices. Once per session. | `devices` (count).                                                                                       |
| `account_activity_viewed`   | Account Activity showed its first page. Once per session.         | `entries` (count on the first page, at most 50), `suspicious` (the page has a `session.refresh_reused`). |
| `account_device_signed_out` | The User confirmed Sign Out on another device.                    | `outcome: ok \| failed`, `platform: ios \| android \| web \| dev \| unknown` (the signed-out device's).  |

Never session ids, device names or labels, entry contents, or the account id.

### Update Required

These answer how many people an app version floor or a 426 from ww-api blocks,
and whether they go update.

| Event                          | When                                                          | Properties                                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `update_required_shown`        | Update Required covered the app. Once per session and source. | `source: config \| server` (`config`: below `minAppVersion` from `GET /app/v1/config`; `server`: ww-api answered 426), `min_version` (when known). |
| `update_required_store_opened` | The User tapped Update WitnessWork.                           | `source`.                                                                                                                                          |

### Account backup

These answer whether people turn on the end-to-end encrypted backup (ADR 0026
§4), why uploads fail, and whether restoring brings people's records to a new
phone. Uploads that succeed send nothing.

| Event                       | When                                                                                    | Properties                                                                                                                                                                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `account_backup_changed`    | Backup was turned on or off on this device.                                             | `enabled`, `source: settings \| restore \| tools` (`restore`: the offer after a restore), `deleted_server_copy` (when turned off: whether this device's slot was deleted too).                                                                                  |
| `account_backup_failed`     | An upload failed. Once per UTC day per reason.                                          | `reason: offline \| unavailable \| too_large \| limit \| rate_limited \| key \| unverified \| verify_later \| update \| server` (`unverified`: this device can't be verified; `verify_later`: verifying it failed for now; `update`: ww-api needs a newer app). |
| `account_backup_deleted`    | The User deleted one slot or every slot.                                                | `scope: slot \| all`, `source: settings \| disable \| tools`.                                                                                                                                                                                                   |
| `account_restore_offered`   | The restore question showed: the account has a backup.                                  | `source: handoff \| recovery_key \| fresh_install \| settings \| tools`, `slots` (count), `local_data` (this device already had records), `cloud_sync_older` (a Cloud Sync copy exists but is older); `cloud_sync: true`, `slots: 0` when Cloud Sync covers it. |
| `account_restore_chosen`    | The User answered it.                                                                   | `choice: replace \| combine \| skip`, `source`.                                                                                                                                                                                                                 |
| `account_restore_completed` | The restore applied.                                                                    | `mode: replace \| combine`, `slots` (read), `skipped` (from a newer app version or unreadable), `source`.                                                                                                                                                       |
| `account_restore_failed`    | Listing or downloading failed, or no slot could be read. Nothing on the device changed. | `reason: offline \| unavailable \| newer \| unreadable \| server`, `source`.                                                                                                                                                                                    |

Never the account id, slot ids, sizes, device names, or anything from inside
a backup. Delete Buddies deleting the backup first sends no backup event.

### Set Up Another Device

These answer whether people use the QR handoff to move phones (ADR 0026), from
where, how far they get, and why it fails. One attempt sends a handful of events
at most; polling sends none.

| Event               | When                                                                                                                                                                                                                                   | Properties                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handoff_started`   | The old phone opened a code (each new code counts), or the new phone started claiming a scanned or opened one.                                                                                                                         | `role: old \| new`, `entry: settings \| onboarding \| link \| tools`.                                                                                                                                                                                                                                                                                                                                                           |
| `handoff_claimed`   | A phone claimed the code: on the old phone when "Allow … to sign in?" shows, on the new one when it shows the code.                                                                                                                    | `role`.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `handoff_answered`  | The User on the old phone answered "Allow … to sign in?": YES (`allow`) or NO (`decline`). YES asks the device's owner first (Face ID, Touch ID, fingerprint, passcode or screen lock); a retry after a failed send doesn't ask again. | `answer: allow \| decline`; on Allow, `auth`: `device` (the owner confirmed), `none` (the device has no lock), `cancelled` or `failed`. The key is sent only for `device` and `none`.                                                                                                                                                                                                                                           |
| `handoff_completed` | The old phone saw `done`, or the new phone stored the key and told the server.                                                                                                                                                         | `role`.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `handoff_failed`    | The attempt stopped without completing.                                                                                                                                                                                                | `role`, `reason`: the protocol's (`offline`, `unavailable`, `expired`, `used`, `conflict`, `cancelled`, `badToken`, `tampered`, `noAccount`, `rateLimited`, `server`), the account session's (`unverified`: this phone can't be verified, including before Sign In with QR Code starts; `verifyLater`: verifying it failed for now; `updateRequired`), or the app's (`left`, `new_code`, `replace_declined`, `replace_failed`). |

Never the channel id, either public key, the code, the device's name or model,
the account key, or the account id. The Tools self-test sends nothing.

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

Expected device states are filtered out, both from these calls and from
automatically captured exceptions (`shouldIgnoreError` in
`src/lib/errorTrackingPolicy.ts`): connection failures (including RevenueCat's
`NETWORK_ERROR`), location that's off, denied or can't get a fix, and a full
device (the OS's own out-of-space errors only; MMKV's `Failed to set` is still
reported, since any failed write throws it). A full device sends
`device_storage_full` instead, with no properties, once per UTC day, so it
stays visible without flooding error tracking.
Automatically captured storage-full exceptions are dropped without it, and so
are uncaught `request()` failures that were only offline, timed out or
cancelled.

Native module failures reach JavaScript as a plain `Error` with no stack
frames, so error tracking can't tell them apart. The module reports them under
their code instead (`ERR_SQLITE_ERROR`, `ERR_NOTIFICATIONS_FAILED_TO_SCHEDULE`;
see `src/lib/codedError.ts`), and RevenueCat's as `PurchasesError:<code>`, so
each kind of failure gets its own issue.

PostHog is the current implementation. Provider configuration, automatic capture,
and source-map/native-symbol uploads belong to the shared implementation and
build setup, so changing providers does not require changing feature call sites.

### Sync payload reports

When a peer's sync file can't be fully read, `pullAndMerge` reports why. Each
distinct report goes out once per launch, however often the file is pulled.
Properties are field paths, codes and error names only: never values, note or
contact text, filenames or device ids. In `issues`, record keys that aren't
field names (years, months, ids) read as `*`.

| Message                                  | Properties                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `iCloudSync: dropped unreadable entries` | `fields`: the dropped records and settings as `store.list.field:code`. Also sent when the file is then rejected.                                                                                                                                                                                                                                           |
| `iCloudSync: invalid remote payload`     | `reason`: `invalid-json` (malformed or partial file), `unsafe-keys`, `invalid-frame` or `threw`. `issues` (`invalid-frame`): up to 5 distinct `path.field:code`. `step` and `error` (`threw`): the parse step that threw and the error's name, never its message. `bytes`: the file's UTF-8 length. Newer payload versions are a breadcrumb, not a report. |

### Form validation

`form_validation_failed` records the first invalid submission per mounted form, with `form` (a fixed form identifier) and `fields` (comma-separated field identifiers). This answers which forms and required inputs prevent completion. It never includes input values, custom field labels, names, notes, or other private data; successful completion uses the existing create/update events. Repeated invalid taps do not send additional events.

### Update Ready

When the launch check downloads an OTA update (or someone leaves the Update
screen after it finished downloading), the notifications tray lists Update
Ready until the app restarts into it. `pending_update_applied` (no properties)
fires when the User taps Update Now, just before the restart; the app flushes
the queue first so the restart doesn't drop it. It answers whether people take
an update right away instead of on the next cold launch: compare it with Hot
Updater Insights' downloaded-bundle reports. Dismissing the item sends nothing
of its own.

### Update delivery diagnostics

Hot Updater Insights sends operational launch, downloaded-bundle, rollback and
failure reports to the matching self-hosted Cloudflare update Worker. Reports
use the SDK's random installation ID and update/platform/channel compatibility
metadata; no account identity is assigned and no contact names, notes, addresses
or service records are sent. Development clients and performance probes do not
run the Insights plugin. These reports diagnose delivery and native rollback;
they are separate from PostHog product events and do not add a per-tap event.

Error context now uses `updateChannel` and `updateBundleId`, replacing
`expoChannel` and `expoUpdateVersion`. The bundle identifier follows Hot
Updater's public selected-update identity.
