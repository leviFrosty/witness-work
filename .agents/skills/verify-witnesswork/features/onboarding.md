# Onboarding

A fresh install greets the user, tours what the app does, offers a restore when there's something to pick up, then personalizes it: publisher type first and the name last. It ends on Home.

## Sub-features

- `onboarding-welcome` shows the hero ("Your field service assistant.") with "Get Started" and a restore path for existing users.
- `onboarding-tour` follows Get Started: a paged tour in the update reveal's style (`FeatureTour`), with "Skip" top right, "Next" below, and "Continue" on the last page. On an iPhone with Buddies on it has 11 pages: "Track your time", "Plan your week", "Remember every visit", "Report in seconds", "Go out with buddies", "Badges to grow", "Follow-ups in Calendar", "On your Apple Watch", "Just ask Siri", "Privacy, by design." and "And so much more". Android drops the Watch and Siri pages; Buddies and Calendar need their flag or module. Leaving it sends `onboarding_tour_closed`.
- `onboarding-steps` walks through publisher type (headed "Let's personalize WitnessWork"), pioneer date, plan month, data protection, notifications, calendar sync, backfill, the name and picture ("One last thing"), and last the founder note, whose "Finish Setup" opens the app. Buddies has no step: the tour introduces it, and it lives at Schedule → Buddies.
- `onboarding-pick-up` ("Pick up where you left off") follows the tour only when the device already sees something to restore: an account key that iCloud Keychain or Block Store brought back, or another device's iCloud sync file (`detectRestoreSource`). Google Drive isn't seen before the user connects it. "I already use WitnessWork" on the welcome opens it for anyone. Leaving the tour settles it; passing it by applies the same sync choice as its "Start fresh".
- `onboarding-restore` restores a backup through the document picker and skips the remaining steps.
- `onboarding-finish` lands on Home with `onboarded: true`.

## How to get to it (user POV)

- First launch after install.
- Settings → More → "Restart onboarding".

## Driving it with ww-verify

Preconditions:

- `wwv seed fresh`. The route is `Onboarding`.

Steps:

- **Welcome.** Run `wwv ad wait text "Your field service assistant."`. The hero is visible, with "Get Started".
- **Start.** Run `wwv ad press 'label="Get Started"' --settle`. The diff shows the next step, and "Get Started" is gone.
- **Step through.** Repeat `wwv ad snapshot -i`, then press the primary button for each step (labels vary by step, for example "Continue"). Choose a publisher type when asked. Use `wwv eval '__WW_DEV__.state().route'` to confirm progress.
- **Restore step.** With nothing to restore, Get Started → Skip (the tour) lands on "Let's personalize WitnessWork", and `__WW_DEV__.stores.preferences.getState().iCloudSyncSetByUser` reads `true`. A verify device can keep an account key from an earlier run (Keychain or Block Store), which offers the step: `wwv eval '__WW_DEV__.account.read()'`, then `wwv eval '__WW_DEV__.account.last'` shows `hasKey`. "I already use WitnessWork" on the welcome reaches it on purpose: the screen headed "Pick up where you left off" opens with "Start fresh" at the bottom.
- **Buddies.** Onboarding has no Buddies step. With `wwv flag buddies on`, the tour has a "Go out with buddies" page; with it off, it doesn't.
- **Finish.** The last step lands on Home. Run `wwv eval '__WW_DEV__.state()'`. It shows `onboarded: true` and a `role` matching the choice.
- **Proof.** Run `wwv shot onboarding-home` and `wwv errors`. The errors list is empty.
- **Scripted.** Run `wwv flow e2e/maestro/onboarding-start.yaml`.

## Gotchas

- Notification and calendar steps trigger system permission prompts. `up` pre-grants location, calendar, contacts and photos, but iOS can't pre-grant notifications. Accept with `wwv ad alert accept`.
- Restoring through the document picker needs a file in the simulator's Files app. Prefer seeding unless the restore path itself is under test.
- `onboardingComplete` is per-device and isn't synced, so a seed of `fresh` always shows onboarding.
- `wwv seed fresh` while onboarding is already showing doesn't remount it: the step it was on and the settled restore answer carry over. Seed `onboarded` first, then `fresh`.
- The flag override doesn't survive a reload, and a relaunch mid-onboarding resumes on the saved step.
- Push taps and links (`wwv link`, Buddies invites, contact shares, the shared-good-news widget link) that arrive during onboarding wait until it's finished, then open on Home (ADR 0021). The same goes for the update reveal: they open once it closes. Badges that onboarding's records reach never take over: the first check after it files them with no welcome or summary (badges.md).
