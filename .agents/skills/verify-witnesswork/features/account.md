# Account and recovery key

Settings → Account shows the User's anonymous server account (its number and whether it's active, suspended, not set up, unavailable, or offline) and its recovery key. Show Recovery Key asks for the device's own authentication when a screen lock is set, then shows the key (`WW1-` and eleven groups of five) with Copy and Share; viewing it creates the account key when there's none. Use a Recovery Key checks a key as it's typed, refuses a typo by its checksum, does nothing for the key the device already has, and replaces the account for a different key, warning first (and running Delete Buddies) when Buddies has data on the device. On iOS the warning also says it reaches the User's other Apple devices.

## Sub-features

- `account-status` is the Account section: Account Number (selectable, with an info popover) and Status.
- `recovery-key-show` is Show Recovery Key and its sheet (Copy, Share, the warning and its info popover).
- `recovery-key-use` is Use a Recovery Key: the entry sheet, its live validation line, the replace confirmation, and the result alert.
- `account-tools` is Tools → Account: key facts, cached account, `account/info`, Register now, Forget, the inbox link, a recovery key validator, Copy (dev), and Replace with a random key.
- `handoff-offer` is Set Up Another Device on the phone with the account: the QR code with its countdown and Make a New Code, then "Allow … to sign in?" with the six-digit code, Allow / Don't Allow, and the result.
- `handoff-claim` is Sign In with QR Code on the new phone: the scanner (or an opened `/h` link), the code to compare, the replace warning when this phone has Buddies data, and "Signed in". Use a Recovery Key Instead sits under it.
- `handoff-tools` is Tools → Account → Handoff: the current or last session with its request log, Copy QR link (dev), Simulate expiry or cancel, Show a QR code, Open the scanner, Run self-test, and a link parser with Sign in with this link.
- `backup-settings` is Settings → Account → Backup: the WitnessWork Backup switch (off by default), Last Backup with its size or failure, Back Up Now, and the photos `InfoPopover`.
- `backup-slots` is the Backups list under it: "This phone" / "Another device" rows with date and size, deleting one, Restore from Backup, and Delete Backup.
- `backup-restore` is the restore offer after Sign In with QR Code, after Use a Recovery Key, and once on a fresh install whose key came back: Restore when there's nothing here, otherwise Replace / Combine / Not Now, then Turn On Backup.
- `backup-tools` is Tools → Account → Backup: slot id, schedule (pending, last result and code, last hash, next attempt), the raw server list, the log, Upload now, Decrypt a slot, Restore dry run, Delete a slot, Simulate a corrupt download, and Reset backup state.

## How to get to it (user POV)

- Settings → Account (the row under Profile), on compact and wide layouts. Hidden on binaries whose Buddies Keychain module is older than version 3.
- Settings → Account → Devices: Set Up Another Device, and Sign In with QR Code.
- Onboarding: "I already use WitnessWork" → From your other phone opens Sign In with QR Code.
- A `https://ww-proxy.leviwilkerson.com/h#1…` link (the QR code's) opens Sign In with QR Code, during onboarding too.
- Tools → Account.
- Settings → Account → Backup.

## Driving it with ww-verify

Preconditions: `wwv seed pioneer`. The local ww-api from `wwv up` answers `account/register` and `account/info`.

Steps:

- **Read the account back.** `wwv eval '__WW_DEV__.account.read()'`, then a moment later `wwv eval '__WW_DEV__.account.last'`: `hasKey`, `accountPub`, `recoveryKey`, `inboxId`, `registeredInboxId`, `accountLinkedInboxId`, `buddies`, and the cached MMKV account.
- **Open it.** `wwv nav Account`, or Settings → Account. Status settles on Active once the account registered (`account-status`).
- **Show the key.** Press Show Recovery Key. Simulators and emulators without a screen lock skip authentication; one with a passcode set asks for it, which a flow can't enter. The sheet's key (`recovery-key`) matches `account.last.recoveryKey`. Copy shows "Recovery key copied"; read it with `wwv ad clipboard read` on iOS.
- **Same key.** Use a Recovery Key, type the key (`wwv ad fill`), Use Key: "Already using this key", and `account.last` is unchanged.
- **Bad key.** Change one character: the line under the field says "This key has a typo…", and Use Key stays disabled. A `U` says the character doesn't belong.
- **Different key.** `wwv eval '__WW_DEV__.account.randomRecoveryKey()'` gives a valid key. With Buddies started (and a buddy), Use Key asks "Use this recovery key?", naming the buddies; on iOS it adds the Apple devices line. Confirm: "Recovery key added", `account.last.recoveryKey` is the new key, `registeredInboxId` is null, and the cached account has a new `accountPub`. A paired buddy's roster drops this User on its next sync.

### Set Up Another Device (two devices)

Simulators and emulators can't scan a real camera. The old phone shows the QR, and the new phone gets its link through `wwv link` (the real `/h` deep-link path) or Tools → Account → Handoff → paste → Sign in with this link.

- Bring up iOS and Android one at a time in the same worktree (`wwv up --platform ios`, then `--platform android`), with `WW_API_DIR=<ww-api checkout>` when the handoff backend isn't on `origin/main` yet. `wwv flag buddies on` on each.
- **Old phone.** `wwv nav "Set Up Another Device"` (or Settings → Account → Set Up Another Device). Once the QR shows, `wwv eval '__WW_DEV__.handoff.link()'` returns its link (dev builds only).
- **New phone.** `wwv link '<that link>' --platform <other>`: the route is `Sign In With QR Code` and it shows "Confirm on your other phone" with a code (`handoff-code`).
  - On iOS, `wwv link` (`simctl openurl`) opens the app only for paths in the production host's `apple-app-site-association`. Until a ww-api with `/h` in it is deployed, the link opens Safari instead; hand the link to the screen with `wwv nav "Sign In With QR Code" '{"entry":"onboarding","link":"<link>"}'` (what `HandoffLinkListener` does) or Tools → Account → Handoff → paste → Sign in with this link. Android's `wwv link` goes through the app's own intent filter either way.
- **Compare.** Within 1.5 s the old phone shows "Allow … to sign in?" with the same code. `wwv eval '__WW_DEV__.handoff.state()'` on each phone gives `role`, `step`, `status`, `code`, and the request log.
- **Allow.** The new phone asks first when it has Buddies data ("Sign in with this account?", naming the buddies). Confirm: "Signed in", and the old phone shows "… is signed in". `__WW_DEV__.account.read()` then `account.last` on both: the same `accountPub` and `inboxId`, and the new phone's `registeredInboxId` is that inbox once Buddies started (only when the account had Buddies).
- **Don't Allow** on the old phone: the new phone says "Your other phone stopped or didn't allow it". Declining the new phone's warning cancels: the old phone says "Your other phone stopped signing in".
- **Expiry and cancel.** Tools → Account → Handoff → Simulate expiry or Simulate cancel (server). Make a New Code cancels the old one.
- **Self-test.** `wwv eval '__WW_DEV__.handoff.selfTest()'`, then `__WW_DEV__.handoff.selfTestResult`: every step `ok`, ending with `Status → done (old)`.
- **A buddy to lose or keep.** A headless Buddies engine on the local relay (see `relay.interop.test.ts` for the setup) can create an invite: open it with `wwv link`, Accept, then have the engine confirm.

### WitnessWork Backup

Needs the backup ops on the local worker (`WW_API_DIR=<ww-api checkout>` until they're on `origin/main`). The upload is debounced 30 s after a data change, and the server takes one put a slot a minute.

- **Turn it on.** Settings → Account → WitnessWork Backup, or `wwv eval '__WW_DEV__.backup.enable()'`. Scripted: `wwv flow e2e/maestro/account-backup.yaml` (it turns backup off in setup, then on from the switch). `wwv eval '__WW_DEV__.backup.state()'` gives `enabled`, `slotId`, `schedule` (`lastResult`, `lastSize`, `lastHash`, `pending`, `nextAttemptAt`) and the newest-first `log` (`enabled: uploaded N bytes`).
- **The server copy.** `__WW_DEV__.backup.list()`, then `__WW_DEV__.backup.last`: the account's slots. `inspect()` then `last` decrypts every slot to counts; `dryRun()` previews what Combine would add.
- **Restore on another phone.** Hand the account over (above) or Use a Recovery Key with the first phone's key. The offer follows "Signed in" / "Recovery key added". With seeded data it asks Replace / Combine / Not Now; read the store back afterwards (`wwv eval` on the stores, or the screens). `__WW_DEV__.backup.offerRestore()` runs the offer again.
- **A corrupt slot.** `__WW_DEV__.backup.simulateCorruptDownload()` before the restore: it restores the rest and says one couldn't be read.
- **Delete Backup.** The Backups list → Delete Backup → confirm: `list()` from either phone is `[]` and backup is off.
- **Delete Buddies.** With backup on, Buddies Settings → Delete My Buddies Data says the backup is deleted and the recovery key changes. After it, the old account's `list()` is `[]` (check from another phone on that account), the log says `deleted every slot before the account key changed`, and within about a minute the phone uploads under a new `accountPub`.

## Gotchas

- `wwv up` hashes `app.config.ts` only when it loads. In a worktree without `.env`, it can fail to (`EXPO_PUBLIC_HOT_UPDATER_API_KEY is required`), and the fingerprint silently leaves the config out, so a changed intent filter reuses an old binary. Copy the main checkout's `.env` and `.env.local` into the worktree first.
- Handing an account to a phone that already has the same key changes nothing there; reset the iOS simulator's keychain (`xcrun simctl keychain <udid> reset`, then `wwv up`) to stand in for a new iPhone.

- Typing into the multiline field on iOS can drop characters when typed fast; `wwv ad fill` replaces the whole value.
- The native module's `replaceRootSeed` needs a build from this tree (`buddiesKeychainVersion` 3); with an older binary the Settings row is hidden.
- On iOS the key is a synchronizable Keychain item; the simulator keeps it across app reinstalls and `wwv seed`, so `hasKey` can be true on a fresh seed.
- Backup state lives in MMKV (`server-account` → `backup`), so `wwv seed` keeps it; Tools → Account → Backup → Reset backup state clears it.
