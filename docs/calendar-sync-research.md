# Calendar integration recommendation for issue #265

Researched 2026-09-23. Recommendation only; no application code changed and no device prototype run.

**Recommendation: an opt-in, one-way mirror of selected Follow-ups into a dedicated WitnessWork calendar, using EventKit through `expo-calendar`.** WitnessWork owns scheduling; Calendar displays it alongside the user's other commitments. Start with Follow-ups, then consider Day Plans and Recurring Plans separately.

The [original request](https://github.com/leviFrosty/witness-work/issues/265) asks for a checkbox when scheduling a Follow-up, especially for visits outside normal service days. This smaller scope directly addresses it. The existing [calendar-sync plan](calendar-sync-plan.md) is an earlier proposal, not an implemented feature. This research recommends revising it before implementation; material corrections appear below.

## The dedicated calendar is the right model

Create a separate calendar named WitnessWork with its own color. Users can choose which calendars appear together in Apple Calendar. Keep the user's default calendar unchanged, and always specify the chosen destination when writing an event. Hiding WitnessWork changes visibility; it should not disable the app's export preference. [Apple: multiple calendars](https://support.apple.com/guide/iphone/use-multiple-calendars-iph3d1110d4/ios)

“On the device” needs a distinction: EventKit accesses the iPhone's calendar database, but a calendar can belong to a remote account. Recommend an **iCloud-backed WitnessWork calendar**, with the account shown during setup. This allows the calendar provider to replicate saved events to the user's other devices. Offer a local calendar only when supported, with an explicit explanation that it stays on that device. Neither means using WitnessWork's backend. [Apple: accessing the event store](https://developer.apple.com/documentation/eventkit/accessing-the-event-store)

Do not assume a Local source always exists or is permanent. Apple's archived guidance describes local calendars being hidden or migrated when server accounts are enabled; verify the exact behavior on current devices. Treat source disappearance as a repair state, not permission to start writing elsewhere. [Apple QA1926](https://developer.apple.com/library/archive/qa/qa1926/_index.html)

## Permissions are the main tradeoff

Maintaining this mirror requires **Full Calendar Access**. Write-only access cannot read even the app's previous events, enumerate calendars, or create a dedicated calendar. It is unsuitable for reliable updates, deletions, or duplicate recovery. iOS does not offer an “only this app's calendar” permission; constrain reads and writes in our implementation and explain the scope honestly before the system prompt. Request access only when the user enables the feature. [Apple: Calendar and EventKit](https://developer.apple.com/videos/play/wwdc2023/10052/)

If access is denied, leave sync off. A separate “Add a copy to Calendar” action is a possible fallback: iOS 17+ EventKitUI can present Apple's event editor without granting calendar access. That is a one-time export and cannot promise later updates. It need not be part of the first release. [Apple: Calendar and EventKit](https://developer.apple.com/videos/play/wwdc2023/10052/)

## Apple Calendar, Google Calendar, and Outlook

A calendar account and a calendar app are different things. Creating an iCloud calendar does not automatically publish a calendar into Google or Microsoft accounts.

| Destination        | Recommended handling                                                                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iCloud             | Default managed calendar; verify creation and writability on a device.                                                                                                 |
| Local              | Explicit fallback when available; device-only visibility.                                                                                                              |
| Google             | Let the user select an existing dedicated Google calendar exposed through iOS Calendar Accounts. Have them create that secondary calendar in Google first.             |
| Outlook / Exchange | Allow selection of an existing dedicated writable calendar exposed by the account, after device verification. Do not promise calendar creation for every account type. |

Google documents account integration with Apple Calendar, but explicitly excludes creating new Google calendars. Therefore provider event sync is useful, while automatic dedicated-calendar provisioning is not universal. Some secondary calendars may also need enabling for device sync. [Google: Apple Calendar integration](https://support.google.com/calendar/answer/99358?co=GENIE.Platform%3DiOS&hl=en), [Google: secondary calendar visibility](https://workspaceupdates.googleblog.com/2026/01/automatic-addition-owned-secondary-calendars.html)

Microsoft documents connecting an Outlook account to iPhone Calendar. Outlook mobile needs the relevant account configured to see that account's events; do not imply it automatically reads every local calendar. [Microsoft: connecting calendars](https://support.microsoft.com/en-US/Outlook/connect-outlook-and-apple-iphone-calendars), [Microsoft: calendar sync troubleshooting](https://support.microsoft.com/en-US/Outlook/can-t-sync-calendar-and-contacts-with-my-phone-or-tablet)

**Product rule:** offer dedicated destinations only in the managed-sync flow. Never silently fall back to the primary calendar. Do not identify an existing calendar as ours merely because its title matches. Ask the user to adopt an existing destination when ownership is uncertain.

## Suggested first-release experience

1. Add **Show in Calendar** beside the Follow-up controls. First use opens a short setup explaining the destination, one-way behavior, permission, and event details that will leave WitnessWork.
2. Create/select the dedicated calendar after permission. Existing Follow-ups remain unexported unless the user explicitly includes them. Offer an optional preference to include new Follow-ups by default.
3. Persist the per-Follow-up inclusion choice with the Visit. It represents user intent, independently of `notifyMe`. Store device calendar IDs and event mappings separately.
4. Use the Follow-up timestamp and an editable duration, initially 30 minutes. Duration is a new product choice: the current Follow-up schema has no end time. Preserve an explicit per-event duration so changing the default does not unexpectedly resize existing appointments.
5. Start with a generic localized event title and an “Open in WitnessWork” link. Offer contact name/address inclusion explicitly; omit Visit notes and Follow-up topics by default. A separate calendar is an organizational boundary, not a privacy boundary. Details may appear on shared calendars, widgets, and other devices.
6. Keep current WitnessWork reminders independent. Add no calendar alarms by default to avoid duplicate notifications; verify provider defaults on devices.
7. Preferences shows destination/account, status, **Sync now**, and **Disconnect**. Disconnect offers to keep existing copies or remove app-owned events. Removing a whole calendar is appropriate only if its ownership is established, no unrelated events remain, and the user chose removal.

This is a proposed UX, not an assertion that these controls already exist. Keep device calendar export free, consistent with the domain rule that only WitnessWork's iCloud Sync is Supporter-gated. Provider replication of exported calendar events is distinct from replication of the app's data. [Domain glossary](../CONTEXT.md)

## Define lifecycle behavior before implementation

| Change                                                                    | Calendar behavior                                                                                                                |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Save an included future Follow-up                                         | Create one event, after the Visit save succeeds.                                                                                 |
| Reschedule or edit exported fields                                        | Update the existing event.                                                                                                       |
| Turn off inclusion, remove/dismiss Follow-up, or delete its Visit/Contact | Remove the owned event; do not modify unrelated entries.                                                                         |
| Time passes                                                               | Keep the historical calendar event; do not turn a forecast into a logged Visit.                                                  |
| Log a later Visit                                                         | Preserve the historical appointment; existing app logic decides whether a Follow-up is overdue.                                  |
| Edit/delete an event directly in Calendar                                 | Under the documented mirror contract, restore app-owned fields or recreate it at reconciliation while inclusion remains enabled. |
| Delete the entire calendar, lose its account, or revoke permission        | Pause and show repair instructions. Do not repeatedly recreate a calendar the user removed.                                      |
| Uninstall WitnessWork                                                     | Saved events may remain; explain how to remove the dedicated calendar.                                                           |

Calendar edits cannot modify WitnessWork in v1. The event link should take the user to the corresponding Follow-up for changes. Limit maintenance to verified app-owned events in the chosen calendar; if an event is moved outside that destination, surface a repair choice instead of chasing it into the primary calendar or silently creating another copy.

“Future-only initial export” must not block later maintenance of a known mapping. If a previously exported event moves into the past, or its source is deleted, still process that change. Retain mapped history and pending cleanup records until handled; don't let a date cutoff strand obsolete events.

## How this fits the current code

The app already has most of the domain inputs:

- [Visit](../src/types/visit.ts): stable Visit ID, `updatedAt`, optional Follow-up, timestamp, reminder choice, dismissal. Add inclusion and duration as domain fields, not EventKit identifiers.
- [Visit store](../src/stores/conversationStore.ts): mutation actions and deletion tombstones.
- [Visit form](../src/features/visits/screens/VisitFormScreen.tsx) and [reschedule screen](../src/features/visits/screens/RescheduleVisitScreen.tsx): existing creation, removal, dismissal, and reactivation behavior.
- [Follow-up helpers](../src/lib/conversations.ts): deliberate Follow-up presence is meaningful even without a topic or reminder. Do not accidentally reapply the legacy-placeholder predicate to current records.
- [iCloud payload](../src/app/sync/payload.ts) and [legacy normalization](../src/app/sync/payloadFollowUps.ts): preserve domain inclusion/duration across app-data sync while excluding local EventKit mappings. Check older-client round trips.
- [Widget appointments](../src/app/widgets/buildAppointments.ts): useful domain precedent, but its display window and item cap must not become export limits.

Use a small calendar adapter, pure Follow-up-to-event mapping, and an app-level reconciler mounted after storage hydration. Store subscriptions should catch changes from forms, imports, and iCloud pulls. Reconcile after a complete data merge, not transient partially applied stores. Native failures should leave the Visit saved and export queued for retry.

Use `expo-calendar` behind the adapter; the app currently uses Expo 57 and has no calendar dependency. The current Expo documentation recommends 57.0.4 and uses a new object API. Several old `*Async` exports throw unless imported through `/legacy`; do not paste the old plan's calls unchanged. Resolve the compatible version during implementation and pin its exact patch. Configure permissions in `app.config.ts` and build a new native binary. [Expo Calendar](https://docs.expo.dev/versions/latest/sdk/calendar/), [package.json](../package.json), [app.config.ts](../app.config.ts)

Follow the [current architecture](architecture-features.md): lifecycle composition belongs under `src/app/`; pure shared mapping and storage can remain in shared tiers; Preferences UI belongs in settings. All display strings use i18n, with only `en-US.json` changed without translation approval.

## Reliability and multiple devices

Persist a local mapping from a namespaced logical key, such as `datasetId/followUp/visitId`, to the event identifier, last known date range, and exported-field fingerprint. Also embed a recoverable app marker in the event URL. Register the corresponding deep-link route; a URL-shaped marker alone does not create navigation behavior.

Treat EventKit identifiers as local lookup aids. Apple warns that event identifiers can change when events move calendars, and a full calendar sync can invalidate calendar-item identifiers. Recover by scanning only the selected calendar in relevant date windows and inspecting ownership markers. Provider preservation of those markers must be verified; ambiguity should trigger repair, not deletion by title/time matching. [Apple: eventIdentifier](https://developer.apple.com/documentation/eventkit/ekevent/eventidentifier), [Apple: calendarItemIdentifier](https://developer.apple.com/documentation/eventkit/ekcalendaritem/calendaritemidentifier)

**Accepted decision (2026-09-23): only one device may publish, and the user chooses the primary device in iCloud Sync settings.** This is configurable, not permanently assigned to the first installation. Other devices see the calendar through its provider. If they edit WitnessWork data, those edits reach the calendar after the primary device receives app-data sync and runs reconciliation. Enabling calendar permission on another device must not start another publisher.

The proposed settings behavior is:

- Add a **Primary device** selector in iCloud Sync settings, showing known devices and identifying the current device. Explain that the primary device publishes calendar updates; this designation does not make its app data override edits from other devices.
- Show the selected device and publishing status in Calendar Sync preferences, with a route to change the primary in iCloud Sync settings. Non-primary devices can edit Follow-ups but cannot write calendar events, including through **Sync now** or cleanup actions.
- Persist the selected device identity as shared coordination state. Keep each installation's own `iCloudDeviceId`, EventKit identifiers, and mappings local. The existing [iCloud preferences screen](../src/features/settings/screens/preferences/screens/PreferencesiCloudScreen.tsx) and [device identity](../src/stores/preferences.ts) are integration points; a selectable registry of all devices still needs implementation.
- Treat a primary-device change as a handoff: the old publisher stops, the new device validates permission and access to the existing dedicated calendar, receives current app data, recovers event mappings, then reconciles. Show a pending state until the handoff is safe. Do not create a second calendar merely because local mappings are empty.
- If the chosen device cannot access the destination, keep publishing paused and guide setup. A genuinely local calendar cannot be adopted on another device; changing its publisher requires an explicit destination migration.

**Engineering requirement:** a synced `primaryDeviceId` preference alone cannot enforce this rule. An offline former primary can retain stale ownership. The handoff protocol must prevent overlapping writes, including in-flight writes, through acknowledged release or a validated ownership mechanism with expiration and safe takeover. Do not activate a replacement while the previous device can still publish under stale authority. Offline publishing must pause when authority cannot be established. The existing iCloud file-replication mechanism is not itself a distributed lock; the exact coordination protocol and lost-device recovery are required design work before implementation.

Two offline writers can both observe “no event” and create duplicates; immediate post-create scans cannot see the other's unreplicated copy. Deterministic event keys support recovery but do not replace exclusive publishing authority. Multi-writer publishing is outside the agreed scope.

Keep this setting discoverable for calendar users even when Supporter-only app-data sync is disabled. Do not accidentally gate the free calendar feature by placing its primary-device control inside a paid-only screen. How ownership coordination operates independently of app-data sync must be resolved as part of implementation.

Reconcile on app changes, launch/foreground, and manual sync. Do not promise continuous sync while WitnessWork is terminated: iOS schedules background tasks opportunistically, and force-quitting prevents their execution until restart. Provider replication of already-saved events is separate. [Expo BackgroundTask](https://docs.expo.dev/versions/latest/sdk/background-task/)

EventKit change notifications can prompt a rescan while running, but no public change listener was found in the current Expo documentation or the inspected native module. Foreground reconciliation is sufficient for v1; verify the pinned package or add a small native bridge before promising live detection of external edits. [Apple: event-store notifications](https://developer.apple.com/documentation/EventKit/updating-with-notifications?language=objc), [Expo source inspected](https://github.com/expo/expo/blob/0c0b51af0de9ab0087d73eeec860cdf42c7c86d9/packages/expo-calendar/ios/Next/CalendarNextModule.swift)

## Alternatives and rollout

| Approach                     | Assessment                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Managed dedicated calendar   | Best fit for the proposed experience; maintained appointments, with full-access and lifecycle complexity.                                   |
| One-time system event editor | Smallest implementation and lighter permissions; copies can become stale after rescheduling. Useful optional fallback.                      |
| Hosted ICS subscription      | Read-only presentation is attractive, but adds private feed hosting/access and client refresh delays. Poor first fit for a local-first app. |
| Direct Google/Microsoft APIs | Consider only if provider-specific requirements justify account authorization, credentials, and backend work.                               |
| Two-way editing              | Defer; needs a conflict model for calendar deletions, dates, contact data, and app-owned scheduling.                                        |

Before feature implementation, run a small device spike: create/update/delete one event in a dedicated iCloud calendar; deny/revoke access; test a pre-created Google secondary calendar and Outlook destination; verify custom URL persistence, alarms, account removal, and reinstall recovery. This research verifies documented feasibility, not provider behavior on hardware.

Then ship Follow-ups with reconciliation tests for rescheduling, inclusion removal, dismissal, deletion, partial failures, imported data, permission loss, marker recovery, and device handoff. Include timezone/DST cases; a stored Follow-up timestamp should retain its instant rather than be reconstructed in the current timezone. Add Day Plans later; defer native recurring rules and overrides until their editing/exception semantics are designed and tested.

## Corrections to the earlier plan

- Remove the write-only degraded-sync path; it cannot implement the promised feature.
- Replace “Google support comes free” with existing writable-account support plus provider-specific calendar setup.
- Replace “multi-device-safe dedup” with the accepted configurable primary-device rule, controlled from iCloud Sync settings, and design the ownership/handoff mechanism needed to enforce it.
- Update Expo API names and file locations for the current repository.
- Do not auto-recreate a missing calendar or assume a local source is always available.
- Add the per-Follow-up inclusion requested in the issue; the earlier type-level toggles alone do not supply it.
- Export fewer contact details by default, and make inclusion explicit.
- Separate initial future-event selection from updates/deletions of already-exported events.
- Defer Recurring Plans so the first release stays focused on the requested Follow-up workflow.
