# Account and recovery key

Settings → Account shows the User's anonymous server account (its number and whether it's active, suspended, not set up, unavailable, or offline) and its recovery key. Show Recovery Key asks for the device's own authentication when a screen lock is set, then shows the key (`WW1-` and eleven groups of five) with Copy and Share; viewing it creates the account key when there's none. Use a Recovery Key checks a key as it's typed, refuses a typo by its checksum, does nothing for the key the device already has, and replaces the account for a different key, warning first (and running Delete Buddies) when Buddies has data on the device. On iOS the warning also says it reaches the User's other Apple devices.

## Sub-features

- `account-status` is the Account section: Account Number (selectable, with an info popover) and Status.
- `recovery-key-show` is Show Recovery Key and its sheet (Copy, Share, the warning and its info popover).
- `recovery-key-use` is Use a Recovery Key: the entry sheet, its live validation line, the replace confirmation, and the result alert.
- `account-tools` is Tools → Account: key facts, cached account, `account/info`, Register now, Forget, the inbox link, a recovery key validator, Copy (dev), and Replace with a random key.

## How to get to it (user POV)

- Settings → Account (the row under Profile), on compact and wide layouts. Hidden on binaries whose Buddies Keychain module is older than version 3.
- Tools → Account.

## Driving it with ww-verify

Preconditions: `wwv seed pioneer`. The local ww-api from `wwv up` answers `account/register` and `account/info`.

Steps:

- **Read the account back.** `wwv eval '__WW_DEV__.account.read()'`, then a moment later `wwv eval '__WW_DEV__.account.last'`: `hasKey`, `accountPub`, `recoveryKey`, `inboxId`, `registeredInboxId`, `accountLinkedInboxId`, `buddies`, and the cached MMKV account.
- **Open it.** `wwv nav Account`, or Settings → Account. Status settles on Active once the account registered (`account-status`).
- **Show the key.** Press Show Recovery Key. Simulators and emulators without a screen lock skip authentication. The sheet's key (`recovery-key`) matches `account.last.recoveryKey`. Copy shows "Recovery key copied"; read it with `wwv ad clipboard get` on iOS.
- **Same key.** Use a Recovery Key, type the key (`wwv ad fill`), Use Key: "Already using this key", and `account.last` is unchanged.
- **Bad key.** Change one character: the line under the field says "This key has a typo…", and Use Key stays disabled. A `U` says the character doesn't belong.
- **Different key.** `wwv eval '__WW_DEV__.account.randomRecoveryKey()'` gives a valid key. With Buddies started (and a buddy), Use Key asks "Use this recovery key?", naming the buddies; on iOS it adds the Apple devices line. Confirm: "Recovery key added", `account.last.recoveryKey` is the new key, `registeredInboxId` is null, and the cached account has a new `accountPub`. A paired buddy's roster drops this User on its next sync.

## Gotchas

- Typing into the multiline field on iOS can drop characters when typed fast; `wwv ad fill` replaces the whole value.
- The native module's `replaceRootSeed` needs a build from this tree (`buddiesKeychainVersion` 3); with an older binary the Settings row is hidden.
- On iOS the key is a synchronizable Keychain item; the simulator keeps it across app reinstalls and `wwv seed`, so `hasKey` can be true on a fresh seed.
