# Buddies

Buddies lets two publishers connect through an end-to-end encrypted relay (ww-api). Once connected, they see each other's shared plans, ask to join, and exchange invites through a link or code. It sits behind the `buddies` remote flag.

## Sub-features

- `buddies-entry` shows the "Buddies" header button on the Schedule screen, once enabled.
- `buddies-invite` creates an invite link (`https://ww-proxy.leviwilkerson.com/b#1…`) or code and shares it.
- `buddies-accept` claims an invite on the second device, which then appears on both rosters.
- `buddies-plans` marks shared plans on the calendar, and lets the user ask to join.
- `buddies-settings` covers Buddies Settings and Feedback.

## How to get to it (user POV)

- Schedule tab → "Buddies".
- Opening an invite link, which leads to the Buddy Invite screen.

## Driving it with ww-verify

Preconditions:

- A local relay. Run `wwv up --platform ios --api local` and `wwv up --platform android --api local`. Both devices share one Metro and one isolated ww-api (`$WW_API_DIR`, default `~/dev/ww-api`, which must contain `scripts/verify/dev.mjs`).
- Flag on for each device: `wwv flag buddies on --platform ios` and `wwv flag buddies on --platform android`.
- `wwv seed pioneer` on each device.
- `wwv doctor` shows the `api` check as `local … 200`.

Steps:

- **Entry.** On iOS, run `wwv ad press 'label="Schedule"' --settle`, then `wwv ad press 'label="Buddies"' --settle`. The route is `Buddies`.
- **Invite.** Create an invite, then read the link with `wwv eval` (from the screen, or the clipboard via `wwv ad clipboard get`).
- **Accept on Android.** Run `wwv link '<invite link>' --platform android`. The route is `Buddy Invite`. Accept it.
- **Both rosters.** Each device's Buddies screen lists the other. Run `wwv eval '__WW_DEV__.state()'` per platform.
- **Backend proof.** In ww-api, `.verify/wrangler.log` shows the `invite/claim` and `inbox/sync` calls.
- **Proof.** Run `wwv shot buddies-ios --platform ios` and `wwv shot buddies-android --platform android`, then `wwv errors` on both.

## Gotchas

- The flag override only applies to dev builds and survives remote flag refreshes. `wwv flag buddies clear` restores the remote value.
- Buddies needs the Keychain native module. On a binary without it, the feature stays hidden even with the flag on.
- Pushes are skipped locally, because APNs keys aren't passed to the isolated worker. Refresh by reopening the screen.
- The relay's rate limit is 30 requests per minute per IP. Avoid tight loops.
- Universal links always point at the production host. Drive invites with `wwv link`, which the app parses locally, rather than a browser.
