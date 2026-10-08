# Buddies

Buddies lets two publishers connect through an end-to-end encrypted relay (ww-api). Once connected, they see each other's shared plans, ask to join, and exchange invites through a link or code. It sits behind the `buddies` remote flag.

## Sub-features

- `buddies-entry` shows the "Buddies" header button on the Schedule screen, once enabled.
- `buddies-invite` creates an invite link (`https://ww-proxy.leviwilkerson.com/b#1…`) or code and shares it.
- `buddies-accept` claims an invite on the second device, which then appears on both rosters.
- `buddies-plans` marks shared plans on the calendar, and lets the user ask to join.
- `buddies-plan-details` shows a plan's invited buddies and replies, requests to join (Invite adds them in place), Invite Buddies, and for a plan from a buddy's invitation the organizer and a Going / Can't Make It switch. Can't Make It keeps the page open on the invitation so Going can bring the plan back.
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

## Live updates and relay diagnostics

While the app is in the foreground, Buddies keeps a WebSocket to the relay (`inbox/live`, see `docs/buddies-protocol.md`) and syncs on every `changed` signal. To prove it, or to debug a buddy's change that didn't arrive:

- **Read the live state.** `wwv eval '__WW_DEV__.stores.buddiesDiagnostics.getState().live'` returns the status (`open`, `connecting`, `reconnecting`, `stopped`), the last hello and changed seq, ping round trip, last close code, counts, and the last 100 events.
- **Check the relay.** `wwv eval '__WW_DEV__.checkBuddiesRelay()'` starts a check. Read it back a second later with `wwv eval '__WW_DEV__.stores.buddiesDiagnostics.getState().relayCheck'`. It checks `/health`, a signed read-only inbox read, and a separate live socket's hello and ping, with timings and relay error codes (for example `relay disabled (HTTP 503)` when the kill switch is off).
- **In the app.** Tools → Buddies shows the same data, plus Ping now, Reconnect now, Sync now, Re-register push, and a copyable debug dump with no names or content.
- **Timing a live update.** Have the other side write (accept, invite, reply, ask to join), then poll the store with `wwv eval` until the change lands. Over the local relay it takes under a second. The relay's `.verify/wrangler.log` shows the `event/put` followed right away by this device's `inbox/sync`.
- **Kill switch.** `node scripts/verify/dev.mjs kv put buddies:enabled false` in ww-api turns Buddies off. The value is cached for 60 s.

## Gotchas

- Buddies is iOS-only for now: its Keychain module isn't in Android builds, where the invite screen fails with "Buddies Keychain requires a newer native binary". A worktree also holds only one iOS device (`--ipad` hands back the iPhone). For a second person, pair the app with a headless engine against the local relay; [streaks.md](./streaks.md) has the recipe.

- The flag override only applies to dev builds and survives remote flag refreshes. `wwv flag buddies clear` restores the remote value.
- Buddies needs the Keychain native module. On a binary without it, the feature stays hidden even with the flag on.
- Pushes are skipped locally, because APNs keys aren't passed to the isolated worker. Refresh by reopening the screen.
- The relay's rate limit is 30 requests per minute per IP. Avoid tight loops.
- For screens that only read Buddies state (Plan Details, the bell), seed made-up buddies, `shareReplies`, `joinRequests`, and `incomingShares` through `__WW_DEV__.stores.buddies.setState(...)` instead of pairing devices. Re-run `wwv flag buddies on` after a reload; the override doesn't survive one.
- Universal links always point at the production host. Drive invites with `wwv link`, which the app parses locally, rather than a browser.
