# Buddies

Buddies lets two publishers connect through an end-to-end encrypted relay (ww-api). Once connected, they see each other's shared plans, ask to join, and exchange invites through a link or code. It sits behind the `buddies` remote flag. It runs on iOS and Android, and every pairing (iOS↔iOS, iOS↔Android, Android↔Android) must work; see ADR 0020 for what differs on Android.

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

## Cross-platform pairings

- **Two Android devices.** Leases are per worktree and platform, so the second emulator comes from a second checkout of the same commit: `git worktree add --detach <path> HEAD`, `pnpm install`, then `WW_API_DIR=<ww-api> WW_VERIFY_MAX_ANDROID=2 wwv up --platform android --api local` there. The same native fingerprint reuses the cached build, and `dev.mjs up` reuses the running relay. Raise `WW_VERIFY_MAX_ANDROID` on both checkouts' commands only.
- **Real Android alerts locally.** FCM works from `wrangler dev` (APNs doesn't). Start the relay first with the FCM key (verify-ww-api skill, `--secrets-from`), then `WW_API_DIR=<that ww-api checkout> wwv up --api local` reuses it. The emulator image has Google Play services, so `__WW_DEV__.stores.buddies.getState().pushRegisteredAt` turns non-zero once Buddies starts with notifications allowed, and the relay's log shows `device/register`. Background the app (`adb shell input keyevent KEYCODE_HOME`) on the receiving device, have the other side write, and read the shade: `adb shell dumpsys notification --noredact | grep -A3 com.leviwilkerson.jwtimedev`. The background task's sync shows as that device's `inbox/sync` in the relay log right after the `event/put`, before the app is opened.
- **Invite links on Android.** `wwv link` works on both platforms. To prove the App Link itself, let the dev package open the host (`adb shell pm set-app-links-user-selection --user cur --package com.leviwilkerson.jwtimedev true ww-proxy.leviwilkerson.com`), then `adb shell "am start -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d '<invite link>'"`. The route must be `Buddy Invite`, with the fragment intact.
- **A scripted buddy.** When only one device is free, the app's own engine can play the other person against the same relay from vitest (see `relay.interop.test.ts` for the setup): create an invite, accept a link, confirm, remove, or sync. The device under test still drives the real UI.
- **Crypto parity.** `wwv eval '__WW_DEV__.checkBuddiesCryptoVectors()'` on each platform must return `{ ok: true, mismatches: [] }`, the same vectors vitest checks under Node.
- **Seed backup (Android).** Tools → Buddies shows Seed backup: `cloud`, `device`, `restored`, `pending`, or `unavailable`. Read it with `wwv eval` through the debug dump if needed. Emulators without a screen lock report `device`.

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
- Buddies needs the Keychain native module (Keystore and Block Store on Android). On a binary without it, the feature stays hidden even with the flag on.
- APNs pushes are skipped locally, because `wrangler dev` can't reach APNs. Refresh by reopening the screen. Android alerts work locally with the FCM key (above).
- The relay's rate limit is 30 requests per minute per IP. Avoid tight loops.
- For screens that only read Buddies state (Plan Details, the bell), seed made-up buddies, `shareReplies`, `joinRequests`, and `incomingShares` through `__WW_DEV__.stores.buddies.setState(...)` instead of pairing devices. Re-run `wwv flag buddies on` after a reload; the override doesn't survive one.
- Universal links and App Links always point at the production host. Drive invites with `wwv link`, which the app parses locally, rather than a browser.
- Enter Invite Link uses `Alert.prompt` on iOS and reads the clipboard on Android (there's no prompt there). Android 16 emulators have no clipboard shell command (`wwv ad clipboard write` refuses), so stand in for "copied from Messages" through the app: `wwv eval "globalThis.expo.modules.ExpoClipboard.setStringAsync('Join me: <link>', {})"` (the options argument is required), then tap Enter Invite Link.
- A link opened while the `buddies` flag override is off (it doesn't survive `up` relaunching the app) waits in `BuddyInviteListener`; `wwv flag buddies on` releases it.
- After opening any `ww-proxy.leviwilkerson.com` link on Android, check the app didn't re-open it: `adb logcat -c`, open the link, then `adb logcat -d | grep -c 'START u0 {act=android.intent.action.VIEW dat=https://ww-proxy'` must be 1. Handing an own link to `Linking.openURL` loops on Android, where the app owns the host.
