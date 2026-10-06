# Onboarding

A fresh install greets the user, asks what kind of publisher they are and what they want help with, optionally restores a backup, and then lands on Home.

## Sub-features

- `onboarding-welcome` shows the hero ("Your field service assistant.") with "Get Started" and a restore path for existing users.
- `onboarding-steps` walks through the founder note, privacy, publisher type, intent, profile, pioneer date, plan preview, notifications, calendar sync and defaults.
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
- **Finish.** The last step lands on Home. Run `wwv eval '__WW_DEV__.state()'`. It shows `onboarded: true` and a `role` matching the choice.
- **Proof.** Run `wwv shot onboarding-home` and `wwv errors`. The errors list is empty.
- **Scripted.** Run `wwv flow e2e/maestro/onboarding-start.yaml`.

## Gotchas

- Notification and calendar steps trigger system permission prompts. `up` pre-grants location, calendar, contacts and photos, but iOS can't pre-grant notifications. Accept with `wwv ad alert accept`.
- Restoring through the document picker needs a file in the simulator's Files app. Prefer seeding unless the restore path itself is under test.
- `onboardingComplete` is per-device and isn't synced, so a seed of `fresh` always shows onboarding.
