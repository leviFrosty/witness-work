# WitnessWork verification map

This folder is the maintained source for verifying WitnessWork's user-facing behavior. Read this index before driving the app, then use the matching feature file as the recipe. Commands assume `alias wwv="node scripts/verify/ww-verify.mjs"` from the worktree root.

## Baseline preconditions

- `wwv up --platform <ios|android>` has printed its JSON summary.
- `wwv doctor` passes.
- Seed the scenario the feature file names, using `wwv seed <scenario>`. Never reuse state left over from another recipe.
- Run `wwv ad snapshot -i` after every seed, before using selectors. A seed can re-layout the screen, and stale geometry sends taps to the wrong control.
- The device locale is en-US, so labels match `src/locales/en-US.json`.

## Driving conventions

- UI actions go through `wwv ad …`, using agent-device with this run's session. Prefer `label="…"` selectors, and add `role="button"` when a text label and a control share a name (e.g. "Hours").
- State setup goes through `wwv seed`, `wwv flag`, `wwv nav` and `wwv eval`. Setup is never the proof.
- A flow worth re-running belongs in `e2e/maestro/` as a supported Maestro subset (`scripts/verify/flows.mjs`). Add `# seed:` and `# assert:` headers.

## Proof and skip reporting

- Capture the user action and the resulting state: the settled diff or `wwv ad wait text`, plus `wwv shot <label>`.
- Mutation proof needs a read-back. Either use `wwv eval` on the store, or reopen the record from a second screen.
- `wwv errors` must be empty at the end of every recipe.
- Record the platform, device, scenario and entry point with each artifact.
- Report an unreachable path with the command attempted and the unmet precondition. Never report a skipped entry point as verified through a different one.

## Feature entry contract

Each feature file starts with an H1 and one paragraph of user-visible behavior, then exactly four H2s in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with ww-verify`, and `Gotchas`. Keep implementation details out. Name only user paths, stable labels, required state, commands, and observable proof.

## Features

- [Onboarding](./onboarding.md) covers the fresh install welcome, the publisher-type choice, the Buddies step and finishing setup.
- [Time entry](./time-entry.md) covers logging time from the Home card, the Quick Action menu and the `add-time` deep link, with read-back.
- [Contacts and visits](./contacts-visits.md) covers creating a contact, logging a visit and follow-ups, and the `contact/:id` deep link.
- [Schedule and plans](./schedule-plans.md) covers the month calendar, creating a plan, Plan Details and the `day` deep link.
- [Progress and goals](./progress-goals.md) covers the Month, Year and All-time tabs, pace and projection for pioneers, and the checkbox report for publishers.
- [Buddies](./buddies.md) covers the flagged feature, which needs the local ww-api relay, two-device invites, and the onboarding entry point.
- [Service Streaks](./streaks.md) covers the Home streak chip and countdown, the milestone celebration, streak reminders, buddies' streaks over the local relay, and the Schedule intro.
- [Calendar Sync](./calendar-sync.md) covers connecting a calendar, publishing Follow-ups, disconnecting, and Android's calendar provider read-back.
- [Cloud sync](./cloud-sync.md) covers iCloud Sync screens on iOS and Google Drive Sync on Android through a local fake Drive, including two Android users as two devices.
- [Badges](./badges.md) covers the profile overlay's badges section, the Badges screen and badge sheet, earning a badge live (a celebration after the User's own action, or the Home "New badge" card otherwise) and the history summary, takeovers one at a time (ADR 0021), the Show badges switch, a buddy's badges and badge alerts, and the onboarding and update reveal pages.

Not mapped yet: supporter route planning, saved contact views, Notes Import (Scribe) on Android, the supporter pause offer, and Settings → About and Advanced. Map one with `maintain-verification-skill` before relying on this index for it.
