# Onboarding

A fresh install greets the user, asks what kind of publisher they are and what they want help with, optionally restores a backup, and then lands on Home.

## Sub-features

- `onboarding-welcome` shows the hero ("Your field service assistant.") with "Get Started" and a restore path for existing users.
- `onboarding-steps` walks through the founder note, privacy, publisher type, intent, profile, pioneer date, plan preview, Buddies (with the `buddies` flag on), badges, notifications, calendar sync and defaults.
- `onboarding-buddies` explains Buddies with an animated preview, offers **Invite a Buddy** (creates a Buddies Invite and opens the share sheet), and says where Buddies lives later (Schedule → Buddies). **Continue** is always the same size, one tap away.
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
- **Buddies step.** Needs Buddies on (iOS or Android). From a non-onboarding screen (`wwv seed onboarded`), run `wwv seed fresh`, then `wwv flag buddies on --platform ios` before tapping past the first steps (the step's visibility is held once you reach its place, so turning the flag on later doesn't add it). Tap Get Started → Continue ×3 → "Start fresh" → "Kingdom Publisher" → "Continue as Kingdom Publisher" → Continue (profile; tap "Add your name and a picture." first if the keyboard is up) → the Buddies step. A pioneer also passes the pioneer date and plan steps. `wwv eval '__WW_DEV__.stores.preferences.getState().onboardingStepId'` reads `buddies`. The order ends planMonth → buddies → badges → notifications.
  - **Skip.** Press "Continue". The step id becomes `badges`, and `__WW_DEV__.stores.buddies.getState().registeredInboxId` stays `null`. Scripted: `wwv flow e2e/maestro/_onboarding-buddies.yaml --platform ios` (opt-in; see its header).
  - **Invite.** Needs a relay (`--api local`) and a profile name (`__WW_DEV__.stores.profile.getState().set({ name: 'Maya Torres' })` is fine as setup). Seeding doesn't reset Buddies, so clear a previous run with `__WW_DEV__.stores.buddies.setState({ registeredInboxId: null, outgoingInvites: [], onboardingComplete: false })`. Press "Invite a Buddy": the share sheet opens with the Buddies Invite message. Read back `outgoingInvites.length` (1), `registeredInboxId` (set) and `onboardingComplete` (true, so Schedule → Buddies opens on its list with the pending invite). The share sheet is a remote view agent-device can't see into: tap "Copy" by coordinates from a screenshot (points = pixels × 402 / 646 on an iPhone shot), then `wwv ad clipboard read` returns the message with the `https://ww-proxy.leviwilkerson.com/b#1…` link. The step then shows "Invite shared…" and Continue becomes the filled button. Dismissing the sheet (`wwv ad press 'label="dismiss popup"'`) and pressing again re-offers the same invite instead of making another.
  - **Errors.** With no relay reachable, "Invite a Buddy" shows "You're offline. Try again when you're connected." Without a profile name it shows "Add your name to your profile first…". Continue works in both.
  - **Absent.** With `wwv flag buddies off` (or on Android, where the Keychain module doesn't exist), profile → badges (or plan → badges) with no Buddies step.
- **Finish.** The last step lands on Home. Run `wwv eval '__WW_DEV__.state()'`. It shows `onboarded: true` and a `role` matching the choice.
- **Proof.** Run `wwv shot onboarding-home` and `wwv errors`. The errors list is empty.
- **Scripted.** Run `wwv flow e2e/maestro/onboarding-start.yaml`.

## Gotchas

- Notification and calendar steps trigger system permission prompts. `up` pre-grants location, calendar, contacts and photos, but iOS can't pre-grant notifications. Accept with `wwv ad alert accept`.
- Restoring through the document picker needs a file in the simulator's Files app. Prefer seeding unless the restore path itself is under test.
- `onboardingComplete` is per-device and isn't synced, so a seed of `fresh` always shows onboarding.
- `wwv seed fresh` while onboarding is already showing doesn't remount it: the step it was on and the held Buddies answer carry over. Seed `onboarded` first, then `fresh`.
- The flag override doesn't survive a reload, and a relaunch mid-onboarding resumes on the saved step. If the Buddies step should show, flip the flag before reaching it.
- Push taps and links (`wwv link`, Buddies invites, contact shares, the shared-good-news widget link) that arrive during onboarding wait until it's finished, then open on Home (ADR 0021). The same goes for the update reveal: they open once it closes. After onboarding, the badges welcome is a takeover too: it never follows an update reveal in the same launch (badges.md).
