# Cloud sync (iCloud on iOS, Google Drive on Android)

Supporters keep their devices in step: each device that turns sync on shares its contacts, visits, time, plans, categories, mileage, profile and shared preferences with the user's other devices of the same platform, and can restore them on a new install. iOS syncs through iCloud; Android syncs through the hidden Google Drive folder of a Google Account the user connects. Photos sync only on devices that opt in.

## Sub-features

- `sync-enable` turns sync on from Settings ("iCloud Sync" / "Google Drive Sync" → "Sync with iCloud" / "Sync with Google Drive"). On Android it first shows Google's account picker and consent screen.
- `sync-transfer` sends edits to the cloud a few seconds after they're made and brings other devices' edits in on foreground, on "Sync now", and (Android, while open) within about a minute.
- `sync-first-enable` asks how to combine ("Keep this device's data", "Restore from …", "Merge both") when both this device and the cloud have records.
- `sync-restore` restores during onboarding: "Pick up where you left off" → "From iCloud backup" / "From Google Drive".
- `sync-lapse` pauses transfer while Supporter access is gone ("Paused until Supporter access returns") and resumes on its own.
- `sync-account` (Android) shows the connected Google Account state, "Use a different Google Account", "Disconnect Google Drive", and "Reconnect" after Google withdraws access.
- `sync-photos` uploads and downloads photos when "Include images in sync" is on.
- `sync-devices` lists and removes other devices' copies (Settings → … → "Devices").

## How to get to it (user POV)

- Settings → App → "iCloud Sync" (iOS) / "Google Drive Sync" (Android). Non-Supporters see the Supporter paywall there.
- Onboarding → "Pick up where you left off" → the cloud option.
- The notification bell, after another device rebuilt the data or when a choice is needed.

## Driving it with ww-verify

Preconditions:

- iOS: simulators aren't signed in to iCloud, so only the screens and their copy can be checked; cross-device iCloud sync is a Limit.
- Android without a Google Account: start the fake Drive server and point the dev build at it.

  ```bash
  node scripts/verify/fake-google-drive-server.mjs 8795 &
  adb -s <serial> reverse tcp:8795 tcp:8795
  wwv eval '__WW_DEV__.fakeGoogleDrive({ origin: "http://localhost:8795", account: "family" })'
  wwv eval '__WW_DEV__.setSupporter(true)'
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
- **Lapse.** `wwv eval '__WW_DEV__.setSupporter(false)'`; the status reads "Paused until Supporter access returns"; set it back and the status returns to "Last synced …".
- **Restore.** `wwv seed fresh` on a new user/device, choose "From Google Drive", then "Connect Google Drive" and "Restore from Google Drive". The restored contacts appear on Home.
- **Proof.** `wwv shot <label>` for each screen and `wwv errors`.

## Gotchas

- On a secondary Android user, `wwv ad snapshot` works but `wwv ad press` doesn't reach the app. Tap the element's center from `wwv ad snapshot -i --json` bounds with `adb shell input tap <x> <y>`.
- Only `wwv` commands refresh the lease. A long stretch of raw `adb` commands lets it go idle and get reaped, so run `wwv doctor` now and then.
- Taking a device "offline" from the fake: `adb reverse --remove tcp:8795`; edits stay pending and the status reads "Sync needs another attempt". Restore the forward to go back online.
- The fake skips Google's consent screen. A real connect needs a device signed in to a Google Account and an Android OAuth client for the build's package and signing key (ADR 0019); without one Google returns `DEVELOPER_ERROR`, shown as "Couldn't connect Google Drive".
- Android has no background sync: edits made while the app is closed arrive the next time it opens.
- `wwv seed` resets sync settings. Turn sync on again after seeding.
