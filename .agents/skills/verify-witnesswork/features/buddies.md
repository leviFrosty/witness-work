# Buddies

Buddies lets two publishers connect through an end-to-end encrypted relay (ww-api). Once connected, they see each other's shared plans, ask to join, and exchange invites through a link or code. It sits behind the `buddies` remote flag. It runs on iOS and Android, and every pairing (iOS↔iOS, iOS↔Android, Android↔Android) must work; see ADR 0020 for what differs on Android.

## Sub-features

- `buddies-entry` shows the "Buddies" header button on the Schedule screen, once enabled.
- `buddies-onboarding` is the setup step before Badges: an animated explainer with an optional **Invite a Buddy** (share sheet) and Continue. See [`onboarding.md`](onboarding.md).
- `buddies-invite` creates an invite link (`https://ww-proxy.leviwilkerson.com/b#1…`) or code and shares it.
- `buddies-accept` claims an invite on the second device, which then appears on both rosters.
- `buddies-plans` marks shared plans on the calendar, and lets the user ask to join.
- `buddies-plan-details` shows a plan's invited buddies and replies, requests to join (Invite adds them in place), Invite Buddies, and for a plan from a buddy's invitation the organizer and a Going / Can't Make It switch. Can't Make It keeps the page open on the invitation so Going can bring the plan back.
- `buddies-follow-up-invitation` opens a buddy's Follow-up invitation in a sheet ("Follow-up"): "Anna Brooks is going back to see Maria Monday at 7:30 PM" (or "You're going with…" once Going), how far off it is, the topic, the place, then the organizer and a Going / Can't Make It switch. It opens from the bell, the title of a "Needs your answer" row on the buddy's page, an incoming follow-up on the buddy's page, and a follow-up the User joined on Schedule's day sheet. Without pairing, seed `incomingShares` with a `type: "followUp"` share (`details: { d, s, firstName, topic, location }`) and `wwv nav "Follow-Up Invitation" '{"from":"…","shareId":"…"}'`.
- `buddies-settings` covers Buddies Settings and Feedback.
- `buddies-bell` lists Buddies items in the Home bell. Invitations, replies, requests to join and pairings count toward its red number like any item. Buddies' news (a buddy's new badge, a reaction to yours) sits below them under "From your buddies", never counts (only a quiet dot), and offers Encourage inline. See `badges-bell-news` in [`badges.md`](badges.md).

## How to get to it (user POV)

- Schedule tab → "Buddies".
- Opening an invite link, which leads to the Buddy Invite screen.
- During setup, the Buddies step (iOS, flag on). Inviting there registers the inbox, creates the invite, and marks the Buddies intro as seen, so Schedule → Buddies opens on the list with the pending invite.

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
- **Named alerts.** A push carries the sealed event, and each device words the alert itself ("Anna invited you to a Plan" / "Sat, Oct 10 · 10:00 AM"; see `docs/buddies-protocol.md` → Named alerts). Prove it on both platforms with the two devices paired:
  - **Android, real FCM.** Run the relay from a ww-api checkout that sends named-alert pushes, with the FCM key (above). Background the Android app, have the iPhone write (invite to a Plan, reply, ask to join, earn a badge, react), and read the shade: `adb shell dumpsys notification --noredact | grep -E "android.(title|text)="`. Badge news is posted in the low-importance `buddies_news` channel, everything else in `buddies`. Expand the shade for a screenshot with `adb shell cmd statusbar expand-notifications`.
  - **iOS, the extension's own code.** A local relay can't reach APNs, and `xcrun simctl push` hands a notification straight to SpringBoard without starting a service extension. So have the Android device write, then build the relay's payload for the iPhone's newest inbox event: `wwv eval '__WW_DEV__.prepareBuddiesPush()'`, then a moment later `wwv eval 'JSON.stringify(__WW_DEV__.buddiesPushPayload())'` into a file. Then run `node scripts/verify/buddies-alert-harness.mjs <udid> <file>`. It runs the extension's `NotificationService` inside the simulator, with the extension's Keychain group and App Group, against the snapshot the app wrote, and prints the alert it would show. `prepareBuddiesPush({ inline: false })` leaves the event out, so the extension fetches it from the relay (an event too big for a push). For a screenshot, `xcrun simctl push <udid> <file>` shows the template, which is what builds before named alerts show (the "before"); a copy of the file with the harness's title and body shows the "after".
  - **Outcomes.** The extension (and the harness) counts how its alerts turned out in the App Group: `plutil -p "$(xcrun simctl get_app_container <udid> com.leviwilkerson.jwtimedev group.com.leviwilkerson.jwtimedev)/Library/Preferences/group.com.leviwilkerson.jwtimedev.plist"` lists `buddiesAlertOutcomes` (`named`, `quiet`, `fallback.<reason>`). The app reports and clears them in the foreground (`buddies_alerts_shown`).
  - **Swift parity.** `pnpm test:buddies-alerts-native` checks the extension's Swift against `cryptoVectors.json` and `alertVectors.json`.
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

- A worktree holds only one iOS device (`--ipad` hands back the iPhone). For a second person, use the Android emulator, or pair the app with a headless engine against the local relay; [streaks.md](./streaks.md) has the recipe.

- The flag override only applies to dev builds and survives remote flag refreshes. `wwv flag buddies clear` restores the remote value.
- Buddies needs the Keychain native module (Keystore and Block Store on Android). On a binary without it, the feature stays hidden even with the flag on.
- APNs pushes are skipped locally, because `wrangler dev` can't reach APNs. Refresh by reopening the screen, or replay the push (Named alerts, above). Android alerts work locally with the FCM key (above).
- The relay's rate limit is 30 requests per minute per IP. Avoid tight loops.
- For screens that only read Buddies state (Plan Details, the bell), seed made-up buddies, `shareReplies`, `joinRequests`, and `incomingShares` through `__WW_DEV__.stores.buddies.setState(...)` instead of pairing devices. Set `registeredInboxId` (the bell lists Buddies items only once it's set) and a future `lastSyncAt`, or the bell shows "Couldn't check for new Buddies activity" after its sync to that made-up inbox fails. Re-run `wwv flag buddies on` after a reload; the override doesn't survive one.
- Universal links and App Links always point at the production host. Drive invites with `wwv link`, which the app parses locally, rather than a browser.
- Enter Invite Link uses `Alert.prompt` on iOS and reads the clipboard on Android (there's no prompt there). Android 16 emulators have no clipboard shell command (`wwv ad clipboard write` refuses), so stand in for "copied from Messages" through the app: `wwv eval "globalThis.expo.modules.ExpoClipboard.setStringAsync('Join me: <link>', {})"` (the options argument is required), then tap Enter Invite Link.
- A link opened while the `buddies` flag override is off (it doesn't survive `up` relaunching the app) waits in `BuddyInviteListener`; `wwv flag buddies on` releases it.
- After opening any `ww-proxy.leviwilkerson.com` link on Android, check the app didn't re-open it: `adb logcat -c`, open the link, then `adb logcat -d | grep -c 'START u0 {act=android.intent.action.VIEW dat=https://ww-proxy'` must be 1. Handing an own link to `Linking.openURL` loops on Android, where the app owns the host.
