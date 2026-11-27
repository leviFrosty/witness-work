---
status: accepted
---

# Data Protection Mode is chosen for the account, and each device asks to follow

## Context

Data Protection Mode (EU / GDPR mode, `preferences.dataProtectionMode`) was a
device-local preference: `syncPreferencePolicy.ts` listed it among the keys
that never sync. A User who turned it on on one phone left their other devices
unprotected. Calendar Sync made the gap concrete: on iOS only the Primary
device writes the calendar, so Data Protection Mode on any other device kept
nothing out of it.

The owner decided that the mode becomes account wide. When it's turned on on
one device, every other device signed in to the same account and syncing with
it asks, the next time it's used, to move to Data Protection Mode, with a way
to stay out on that device. The default is to follow.

The server must not learn that an account uses the mode.

## Decision

1. **The choice travels as an ordinary synced preference.**
   `preferences.dataProtectionAccount` holds `{ on, at }`: the account's choice
   and when it was made. It rides inside the preferences payload of Cloud Sync,
   iCloud Sync and Google Drive sync, all end-to-end encrypted (ADR 0030,
   0067), and merges last writer wins on its `preferenceUpdatedAt` stamp like
   any other preference. ww-api never sees it, and no new route or field
   exists.
2. **The device's own flag stays device local.** `dataProtectionMode` still
   never syncs. Each device records the `at` of the account choice it has
   followed or declined in `dataProtectionAccountAnswered`, which never syncs
   either. A device asks when the account's choice has an `at` it hasn't
   answered and differs from its own flag. When the flag already matches, it
   records the `at` without asking.
3. **Turning it on or off in Settings, or in onboarding, is the account's
   choice.** `chooseDataProtectionMode` sets the device's flag, writes
   `{ on, at: now }` and marks it answered here. The onboarding step's guess
   from the region isn't a choice and publishes nothing.
4. **An opt-out sticks.** Declining records the `at` and leaves the flag. Later
   syncs carry the same `at`, so the device doesn't ask again until someone
   makes a new choice on any device. Settings shows "On for your other devices"
   (or "Off") under the switch on a device that opted out.
5. **Turning it off also asks, and never turns it off silently.** The other
   devices ask "Turn off EU / GDPR mode here too?" with **Keep it on** as the
   cancel choice. Turning off is the less protective direction, so it is never
   applied by syncing alone.
6. **Following runs the local flow.** Following "on" runs the same steps as the
   Settings switch (`applyDataProtectionOn`): territory privacy follows the
   mode unless the User set it, so it asks before deleting house-by-house
   records, and declining that counts as opting out. The prompt replaces the
   Settings switch's first confirmation and carries its description, so the
   User isn't asked twice.
7. **The prompt is a Takeover.** It waits its turn in the arbiter
   (`data-protection-follow`, after the update intros and before
   celebrations), so it never covers a sheet, a pushed screen or the app in the
   background, and it waits for onboarding. A change asks right away only when
   it arrives within a minute of a launch or foreground, which is when sync
   pulls; one that arrives later in a session waits for the next foreground.
8. **The calendar follows the account.** Calendar Sync is one output for the
   whole account, so it leaves names and addresses out while the account's
   choice is on, even on a Primary device that opted out, as well as while the
   device's own flag is on. The Calendar Sync screen hides **Include names and
   addresses** under the same rule.
9. **Existing installs publish only "on".** Preferences migration 19 writes
   `{ on: true }` for a device that has the mode on, so the User's other
   devices ask to follow after they update. A device with the mode off writes
   nothing, so updating never asks anyone to turn it off.

## Consequences

- A device that doesn't sync keeps its own setting, and account wide means
  nothing there until it starts syncing. When it does, it asks about the
  account's choice like any other device.
- Restoring a backup that carries an account choice asks the same way.
- Two devices that change it at nearly the same time settle on the later one;
  the other device asks to follow it.
- App versions from before this change keep the mode per device and ignore the
  synced choice.
- A device that opted out still shows the switch's real state for that device.
  The account's choice can only be changed by toggling the switch, which makes
  that device's choice the account's.

## Considered options

- **Sync `dataProtectionMode` itself.** Rejected: the next sync would turn a
  device that opted out back on, and turning it off would spread silently.
- **Store the choice on the account in ww-api.** Rejected: the server would
  learn which accounts use the mode, and devices on iCloud or Google Drive sync
  would still need their own path.
- **Ask with a notification-bell item instead of a Takeover.** Rejected: the
  owner wants the device to ask the next time it's used, and a bell item is
  easy to never open.
