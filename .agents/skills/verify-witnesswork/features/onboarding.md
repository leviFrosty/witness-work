# Onboarding

A fresh install greets the user, tours what the app does, then personalizes it (a returning user restores their account from Welcome back instead): publisher type first and the name last. It ends on Home.

## Sub-features

- `onboarding-welcome` shows the hero ("Your hours, return visits and plans in one simple place.") with "Get Started" and "I already use WitnessWork". Its headline cycles through "Always know your hours.", "Never lose a return visit." and "Plan your month.".
- `onboarding-welcome-back` ("Welcome back", step id `pickUpWhereLeftOff`) opens from "I already use WitnessWork", or from Get Started when Cloud Sync has the account's records. With the account key on the phone it looks in Cloud Sync and restores on its own once a launch (toast "Welcome back! You're ready to go."), or shows "Your records are in Cloud Sync" with "Restore & keep in sync"; without one it lists passkey, other phone and recovery key sign-in. "Other ways to restore" holds the iCloud/Google Drive backup and a backup file; "I'm new here" continues into setup. A seed marks sync as chosen, so run `__WW_DEV__.cloudSync.forgetChoice()` after `wwv seed fresh` to act like a real install. It needs Cloud Sync records for the phone's account (`sync:entitlement everyone`; see [cloud-sync.md](cloud-sync.md)).
- `onboarding-tour` follows Get Started: a paged tour in the update reveal's style (`FeatureTour`), with "Skip" top right, "Next" below, and "Continue" on the last page. It has 5 pages: "Always know your hours", "Never lose a return visit", "Plan your month", "Report in seconds" and "Everything in one place", a grid of up to six extras (Buddies, Badges, Home Screen widgets, Apple Watch, Calendar sync, Full backups, Mileage and fuel). The grid leaves out what the device lacks: Apple Watch and widgets on Android, Buddies and Calendar without their flag or module. Leaving it sends `onboarding_tour_closed`.
- `onboarding-steps` walks through publisher type (headed "Let's personalize WitnessWork"), for a Kingdom Publisher whether to log hours ("Do you want to log your hours?", Continue off until they pick), pioneer date, plan month, data protection, "Bring in your records" (From Notes, From paper, From MyTime, Skip), Cloud Sync ("Cloud Sync is on", where Cloud Sync will turn itself on after setup), Buddies (with the `buddies` flag on), notifications, calendar sync, preferred maps, backfill, the name and picture ("One last thing"), and last the founder note, whose "Finish Setup" opens the app.
- `onboarding-buddies` explains Buddies with an animated preview, offers **Invite a Buddy** (creates a Buddies Invite and opens the share sheet), and says where Buddies lives later (Schedule → Buddies). **Continue** is always the same size, one tap away. The name step comes later, so with no name set, Invite first shows a "Your name" field ("Add your name so your buddy knows who's inviting them.").
- `onboarding-restore` restores a backup through the document picker and skips the remaining steps.
- `onboarding-finish` lands on Home with `onboarded: true`.

## How to get to it (user POV)

- First launch after install.
- Settings → More → "Restart onboarding".

## Driving it with ww-verify

Preconditions:

- `wwv seed fresh`. The route is `Onboarding`.

Steps:

- **Welcome.** Run `wwv ad wait text "Your hours, return visits and plans in one simple place."`. The hero is visible, with "Get Started".
- **Start.** Run `wwv ad press 'label="Get Started"' --settle`. The diff shows the next step, and "Get Started" is gone.
- **Step through.** Repeat `wwv ad snapshot -i`, then press the primary button for each step (labels vary by step, for example "Continue"). Choose a publisher type when asked. Use `wwv eval '__WW_DEV__.state().route'` to confirm progress.
- **Buddies step.** Needs Buddies on (iOS or Android). From a non-onboarding screen (`wwv seed onboarded`), run `wwv seed fresh`, then `wwv flag buddies on --platform ios` before tapping past the first steps (the step's visibility is held once you reach its place, so turning the flag on later doesn't add it). Tap Get Started → Skip (the tour) → "Continue as Kingdom Publisher" → "No, just check off each month" → Continue (the hours question) → Continue (data protection) → Skip (Bring in your records) → Continue (Cloud Sync, when the local worker offers it) → the Buddies step. A pioneer also passes the pioneer date and plan steps. `wwv eval '__WW_DEV__.stores.preferences.getState().onboardingStepId'` reads `buddies`. The order runs planMonth → dataProtection → importRecords → cloudSync → buddies → notifications.
  - **Skip.** Press "Continue". The step id becomes `notifications`, and `__WW_DEV__.stores.buddies.getState().registeredInboxId` stays `null`. Scripted: `wwv flow e2e/maestro/_onboarding-buddies.yaml --platform ios` (opt-in; see its header).
  - **Invite.** Uses the local relay `wwv up` starts. Without a profile name, the first press shows the name field; fill it and press again (or set `__WW_DEV__.stores.profile.getState().set({ name: 'Maya Torres' })` as setup). Seeding doesn't reset Buddies, so clear a previous run with `__WW_DEV__.stores.buddies.setState({ registeredInboxId: null, outgoingInvites: [], onboardingComplete: false })`. Press "Invite a Buddy": the share sheet opens with the Buddies Invite message. Read back `outgoingInvites.length` (1), `registeredInboxId` (set) and `onboardingComplete` (true, so Schedule → Buddies opens on its list with the pending invite). The share sheet is a remote view agent-device can't see into: tap "Copy" by coordinates from a screenshot (points = pixels × 402 / 646 on an iPhone shot), then `wwv ad clipboard read` returns the message with the `https://ww-proxy.leviwilkerson.com/b#1…` link (`https://witnesswork.app/buddies/invite#1…` once new links move to the apex). The step then shows "Invite shared…" and Continue becomes the filled button. Dismissing the sheet (`wwv ad press 'label="dismiss popup"'`) and pressing again re-offers the same invite instead of making another.
  - **Errors.** With no relay reachable, "Invite a Buddy" shows "You're offline. Try again when you're connected." Continue works there too.
  - **Absent.** With `wwv flag buddies off`, data protection → notifications with no Buddies step, and the tour's last page has no Buddies tile.
- **Cloud Sync step.** Shows when Cloud Sync is offered and its default applies: run `__WW_DEV__.cloudSync.refresh()` after `wwv seed fresh` so `cloudSyncConfig` is loaded, and open the local worker's entitlement to `everyone` (cloud-sync.md). A seed sets `iCloudSyncSetByUser: true` (`resetLocalData`), so on a seeded device the switch (`onboarding-cloud-sync-switch`) starts off; a real install starts on. Turning it on clears the flag; off flips the title to "Cloud Sync is off" and sets `iCloudSyncSetByUser: true`, so Cloud Sync stays off after setup (`__WW_DEV__.cloudSync.state().option` is `off`). Left on, it turns on after "Finish Setup".
- **Hours question.** A Kingdom Publisher gets "Do you want to log your hours?" right after their status. Continue does nothing until "Yes, log my hours" or "No, just check off each month" is picked. Read back `logsHours` (the answer) and `hoursLoggingAsked` (`true`) on `__WW_DEV__.stores.preferences.getState()`. Hours-mode roles skip it. Scripted: `wwv flow e2e/maestro/onboarding-hours-logging.yaml`. Anyone set up before the question gets it once in the notifications tray instead: `wwv flow e2e/maestro/hours-logging-tray.yaml`.
- **Finish.** The last step lands on Home. Run `wwv eval '__WW_DEV__.state()'`. It shows `onboarded: true` and a `role` matching the choice.
- **Proof.** Run `wwv shot onboarding-home` and `wwv errors`. The errors list is empty.
- **Scripted.** Run `wwv flow e2e/maestro/onboarding-start.yaml`.

## Gotchas

- Notification and calendar steps trigger system permission prompts. `up` pre-grants location, calendar, contacts and photos, but iOS can't pre-grant notifications. Accept with `wwv ad alert accept`.
- Restoring through the document picker needs a file in the simulator's Files app. Prefer seeding unless the restore path itself is under test.
- `onboardingComplete` is per-device and isn't synced, so a seed of `fresh` always shows onboarding.
- `wwv seed fresh` while onboarding is already showing doesn't remount it: the step it was on and the held Buddies answer carry over. Seed `onboarded` first, then `fresh`.
- The flag override doesn't survive a reload, and a relaunch mid-onboarding resumes on the saved step. If the Buddies step should show, flip the flag before reaching it.
- Push taps and links (`wwv link`, Buddies invites, contact shares, the shared-good-news widget link) that arrive during onboarding wait until it's finished, then open on Home (ADR 0021). The same goes for the update reveal: they open once it closes. Badges that onboarding's records reach never take over: the first check after it files them with no welcome or summary (badges.md).
