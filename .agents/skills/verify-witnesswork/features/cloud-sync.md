# Cloud sync (Cloud Sync, iCloud on iOS, Google Drive on Android)

Each device syncs through one option (ADR 0030): Cloud Sync (end-to-end encrypted through ww-api, iOS and Android together, the default), iCloud/Google Drive, or off. Devices on different options don't sync with each other. With iCloud or Drive, users keep their devices in step: each device that turns sync on shares its contacts, visits, time, plans, categories, mileage, profile and shared preferences with the user's other devices of the same platform, and can restore them on a new install. iOS syncs through iCloud; Android syncs through the hidden Google Drive folder of a Google Account the user connects. Cloud Sync always carries photos (sealed per photo, 2 GB per account); iCloud and Drive carry them only on devices that opt in.

## Sub-features

- `cloud-sync-option` is Settings → Sync's "Sync With" rows (Cloud Sync, iCloud / Google Drive, Off), the security footer, and the switch confirmations.
- `cloud-sync-offer` is the one-time "Switch to Cloud Sync?" card on a device that already used iCloud/Drive.
- `cloud-sync-default` turns Cloud Sync on by itself for a device that never chose, after onboarding.
- `cloud-sync-request` switches a phone to Cloud Sync, once, when a browser on its account asked (the web's "Turn on Cloud Sync" screen).
- `cloud-sync-tray-offer` is the one-time notifications-tray item offering Cloud Sync to an existing install ("Cloud Sync is now free", or the Supporter "Thank you for supporting WitnessWork"), with Turn On.
- `cloud-sync-live` pulls within seconds of another device's change through the account's sync socket, in the foreground.
- `sync-enable` turns sync on from Settings ("iCloud Sync" / "Google Drive Sync" → "Sync with iCloud" / "Sync with Google Drive"). On Android it first shows Google's account picker and consent screen.
- `sync-transfer` sends edits to the cloud a few seconds after they're made and brings other devices' edits in on foreground, on "Sync now", and (Android, while open) within about a minute.
- `sync-first-enable` asks how to combine ("Keep this device's data", "Restore from …", "Merge both") when both this device and the cloud have records.
- `sync-restore` restores during onboarding: "Pick up where you left off" → "From iCloud backup" / "From Google Drive".
- `sync-account` (Android) shows the connected Google Account state, "Use a different Google Account", "Disconnect Google Drive", and "Reconnect" after Google withdraws access.
- `sync-photos` uploads and downloads photos: always on Cloud Sync, and on iCloud/Drive when "Include images in sync" is on. On Cloud Sync, a photo the account has no room for shows "Not synced: storage full", and Settings → Account shows the photo storage.
- `sync-devices` lists and removes other devices' copies (Settings → … → "Devices").

## How to get to it (user POV)

- Settings → App → "iCloud Sync" (iOS) / "Google Drive Sync" (Android). Sync is free (ADR 0040): no Supporter gate on any option.
- Onboarding → "Pick up where you left off" → the cloud option.
- The notification bell, after another device rebuilt the data or when a choice is needed.

## Driving it with ww-verify

### Cloud Sync

Needs the sync routes on the local worker: `WW_API_DIR=<ww-api checkout>` on `wwv up` until they're on `origin/main`. The local worker has Cloud Sync on; its entitlement is `supporter` until you open it to everyone, from the ww-api checkout:

```bash
node scripts/verify/dev.mjs kv put sync:entitlement everyone   # free for everyone
node scripts/verify/dev.mjs kv put sync:enabled false           # kill switch
node scripts/verify/dev.mjs kv delete sync:enabled              # back on
```

The status is cached about a minute per device; `__WW_DEV__.cloudSync.refresh()` reads it again.

- **Two devices on one account.** iOS and Android in the same worktree (`wwv up --platform ios`, then `--platform android`), then Set Up Another Device (see [account.md](account.md)) so both hold the account key. The new phone says "Cloud Sync is bringing your records…" instead of offering a restore.
- **State.** `wwv eval '__WW_DEV__.cloudSync.state()'`: `option`, `entitled`, `config`, `offer`, `canSync`, `slotId`, `lastSeq`, the last socket events (`liveEvents`), and the contact count. `cloudSync.list()`, then `cloudSync.last`, lists the account's slots.
- **Realtime.** Add a contact through the UI on one device, then `wwv ad wait text "<name>"` on the other's Contacts tab without touching it. `liveEvents` shows `changed`.
- **Switching.** Settings → Sync → "Sync With" → iCloud / Google Drive, confirm; `state().option` is `platform`, and `list()` from the other device no longer shows this slot. Back to Cloud Sync, confirm: no duplicates (contact counts), nothing deleted comes back.
- **Upgraded device.** `__WW_DEV__.cloudSync.simulateUpgradedPlatformDevice()`, then `remount()` and open Settings → Sync: the offer card (`cloud-sync-offer`) shows once; "Not Now" (`cloud-sync-offer-dismiss`) hides it for good.
- **Photos.** `cloudSync.photoState()` (bookkeeping, usage, `fullAt`), `cloudSync.photos()` (the account's listed photos), `cloudSync.photoUsage()`. Add a contact or note photo on one device, then read it back on the other with `photoState()` and the screen. Full storage: start the worker with a tiny limit (`node scripts/verify/dev.mjs down`, then `up --photo-limit-bytes <N>` from the ww-api checkout, before `wwv up`); the photo shows "Not synced: storage full" and Settings → Account says "Storage full". `cloudSync.photoBenchmark(10)` seals and uploads a 10 MB photo and reports the timings. A slot must exist before photos (`no_slot` otherwise): let the first sync finish. Without the picker: `cloudSync.setContactPhoto("verify-contact-0")` gives a contact a new photo revision (`last` has it), and `removeContactPhoto(id)` removes it.
- **A photo deleted on another device stays deleted.** With the photo on both devices, background the Android one (`adb -s <serial> shell input keyevent KEYCODE_HOME`; its socket stops), remove the photo on iOS, then on Android run `cloudSync.photoPass()` (the upload pass a foreground or freed room runs, on records that haven't read the removal): `cloudSync.photos()` stays without it. Bring Android back: it pulls, and the photo is gone from both devices and from `photoUsage()`.
- **Default.** `__WW_DEV__.cloudSync.forgetChoice()`, then `remount()`: with the entitlement open, Cloud Sync turns on by itself (`cloud_sync_default_outcome` in the Metro log). A seed makes the device a new install; that's the case that gets it whatever its Supporter status.
- **Existing install.** `__WW_DEV__.cloudSync.setInstalledBeforeFreeSync(true)` makes the device one from before sync was free (`state().installedBeforeFreeSync`). With `forgetChoice()`, `setSupporter(false)` and `remount()`, sync stays off even with the entitlement `everyone`; as a Supporter it still turns on.
- **The account's Cloud Sync request** (ADR 0040 §5; `cloud-sync-request`). `__WW_DEV__.cloudSync.request()` asks as the web's Turn On does (`false` withdraws it); `cloudSync.last` has `{ requestedAt }`. The phone answers at its next status read: `cloudSync.refresh()`, or a return to the foreground at least a minute after the last read. A phone on iCloud/Drive or Off switches and shows "Cloud Sync is on"; one already on Cloud Sync does nothing. `state().requestAnswered` is the request it acted on; it acts once per request. ww-api clears the request itself once every live phone session has written a slot since (`refresh()`, then `last.requestedAt`).
- **The web's Cloud Sync screen** on a phone: Tools → Web Cloud Sync. "Turn on", "Waiting" and "Update your phone" each hold one state; "Live" reads this phone's account as a browser with no slot would, so Turn On sets the real request and the wait ends (an `onReady` toast) once a live phone session's slot is there.
- **Tray offer.** Off Cloud Sync (`cloudSync.switchTo('off')` or `simulateUpgradedPlatformDevice()`), run `__WW_DEV__.cloudSync.showTrayOffer('free')` (or `'thanks'` for the Supporter version; also in Tools → Notifications → Tray), then open the Home bell. Turn On switches in place and shows "This device now uses Cloud Sync"; `state().trayOffer` reads `answered` afterwards. Swiping it away answers it too.

### iCloud and Google Drive

Preconditions:

- iOS: simulators aren't signed in to iCloud, so only the screens and their copy can be checked; cross-device iCloud sync is a Limit.
- Android without a Google Account: start the fake Drive server and point the dev build at it.

  ```bash
  node scripts/verify/fake-google-drive-server.mjs 8795 &
  adb -s <serial> reverse tcp:8795 tcp:8795
  wwv eval '__WW_DEV__.fakeGoogleDrive({ origin: "http://localhost:8795", account: "family" })'
  ```

  The fake setting persists across launches and seeds. Inspect what's stored with `curl localhost:8795/__fake/files?account=family`.

- A second Android "device" without a second emulator lease: a secondary Android user on the leased emulator is a separate install with its own `ANDROID_ID` and data.
  - Create it with `adb shell pm create-user ww-device-b` and `adb shell settings put --user <id> secure user_setup_complete 1`.
  - Install the app and agent-device's helpers for it: `pm install-existing --user <id>` for `com.leviwilkerson.jwtimedev`, `com.callstack.agentdevice.snapshothelper` and `com.callstack.agentdevice.imehelper`.
  - Switch with `adb shell am switch-user <id>`, then open the dev client for that user: `am start --user <id> -a android.intent.action.VIEW -d "exp+jw-time://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A<metro port>" com.leviwilkerson.jwtimedev`. Hide the splash with `wwv eval 'globalThis.expo.modules.ExpoSplashScreen.hide()'`.
  - Keep only one user's app running (`am force-stop --user <other> com.leviwilkerson.jwtimedev`), so `wwv eval` reaches the right runtime.
  - Remove the user afterwards (`am switch-user 0`, then `pm remove-user <id>`).

Steps:

- **Enable.** `wwv nav PreferencesiCloud`, press "Sync with Google Drive". With the fake, no Google screen appears. Read back `wwv eval '__WW_DEV__.stores.preferences.getState().iCloudSyncEnabled'` and the server's file list (one `witness-work-<id>.json`).
- **Transfer.** Add a contact through the UI on device A, wait ~6 s, then on device B open Settings → "Sync now" (or relaunch). Read the contact back on B from Contacts.
- **Conflict merge.** Edit the same contact on A and B while the other is stopped, then open each in turn and read both edits back.
- **Opt-out.** Turn the switch off on B ("Pause on this device"); A's next edit doesn't reach B, and the fake file list shows B's file unchanged.
- **No lapse.** `wwv eval '__WW_DEV__.setSupporter(false)'`; sync keeps going and the status still reads "Last synced …".
- **Restore.** `wwv seed fresh` on a new user/device, choose "From Google Drive", then "Connect Google Drive" and "Restore from Google Drive". The restored contacts appear on Home.
- **Proof.** `wwv shot <label>` for each screen and `wwv errors`.
- **Scripted.** With `sync:entitlement everyone` on the local worker, run `wwv flow e2e/maestro/_cloud-sync.yaml` (Settings → Sync → Cloud Sync → "Last synced"). Delete the key afterwards.

## Gotchas

- On a secondary Android user, `wwv ad snapshot` works but `wwv ad press` doesn't reach the app. Tap the element's center from `wwv ad snapshot -i --json` bounds with `adb shell input tap <x> <y>`.
- Only `wwv` commands refresh the lease. A long stretch of raw `adb` commands lets it go idle and get reaped, so run `wwv doctor` now and then.
- Taking a device "offline" from the fake: `adb reverse --remove tcp:8795`; edits stay pending and the status reads "Waiting for connection". For the OS to report offline too (the "You're offline" Sync now alert), also run `adb shell svc wifi disable` and `svc data disable`; Metro and the fake still work over `adb reverse`. Restore the forward and turn both back on; pending edits push on their own.
- Drive errors from the fake: `curl -XPOST 'localhost:8795/__fake/fail?path=/drive/v3/about&status=403&reason=userRateLimitExceeded&count=4'` fails the next matching requests (`/__fake/fail?clear=1` drops the rest). A throttled about.get must not show "Reconnect Google Drive"; throttled list/upload requests show "Google Drive is busy — retrying soon". `GET /__fake/log` lists the requests served, to count uploads per foreground.
- Cost of a foreground: after the launch publish, coming back to the app with no edits lists the folder once and uploads nothing (`sync:push-skipped`); returns within 30 s of the last catch-up don't even list (`sync:catchUp-throttled`).
- The fake skips Google's consent screen. A real connect needs a device signed in to a Google Account and an Android OAuth client for the build's package and signing key (ADR 0019); without one Google returns `DEVELOPER_ERROR`, shown as "Couldn't connect Google Drive".
- Android has no background sync: edits made while the app is closed arrive the next time it opens.
- `wwv seed` resets sync settings. Turn sync on again after seeding.
