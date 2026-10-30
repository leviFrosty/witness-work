# Backup files

Settings → Backup → Create Backup writes `witness-work-backup.json` and hands it to the share sheet. Restore From Backup, Settings → Import Data and onboarding's "Pick up where you left off" read it back (`src/app/sync/useBackupImport.tsx`). WitnessWork never keeps a copy.

Since 1.46 the file is locked, and the User picks how:

- **My Account** locks it to the account key (ADR 0026). It opens on any device holding that key: the User's devices signed in to the account, or one where they entered the recovery key. It's for the User's own copies. Locking creates the account key on a device that has none yet. Hidden on builds that can't store one.
- **Password** locks it with a password of at least 8 characters. It opens on any device with the password, for sharing a copy (with support, for example). WitnessWork can't recover a forgotten password.

Older versions can't open a locked file, and say it's invalid. Files written before 1.46 aren't locked, and still restore.

## Format

The file is UTF-8 JSON (`src/lib/backupFileLock.ts`):

```json
{
  "format": "witnesswork-encrypted-backup",
  "v": 1,
  "lock": "password",
  "kdf": {
    "alg": "argon2id",
    "m": 19456,
    "t": 2,
    "p": 1,
    "salt": "<b64u, 16 bytes>"
  },
  "data": "<b64u blob>"
}
```

An `account` file has `"lock": "account"` and no `kdf`.

- **Key.** `account`: `HKDF-SHA256(accountKey, "", "ww-account/v1/backup-file", 32)`. `password`: Argon2id (RFC 9106, v0x13) of the NFKC-normalized password's UTF-8, with the file's salt and cost, 32 bytes. Each file gets a fresh salt.
- **Blob.** The account backup's format (`sealPlaintext` in `backupCrypto.ts`; [accounts protocol, Backup](./accounts-protocol.md)): `0x01 ‖ nonce[24] ‖ XChaCha20-Poly1305(key, nonce, gzip(plaintext), aad)`. The plaintext is `{ v: 1, deviceName, platform, createdAt, payload }`, and `payload` is the unlocked backup JSON, exactly as builds before 1.46 wrote it, `version` included.
- **AAD** binds the header: UTF-8 of `ww-backup-file/v1`, `lock` and, for `password`, `alg`, `m`, `t`, `p` and `salt`, joined with `\n`. A file whose lock or cost was changed doesn't open.
- **Limits.** A file is anyone's to write, so reading refuses a cost above 64 MiB, 8 passes or 4 lanes, and a salt under 16 or over 64 bytes, as unreadable, before spending anything on it. A newer `v` is "update WitnessWork first".

## Cost

The cost is OWASP's Argon2id minimum (19 MiB, 2 passes). `@noble/hashes` runs it in JS, so it takes about 2.5 s with the release Hermes engine on an Apple M-series CPU (3.5 s in a simulator's debug build, 4.5 s on an Android emulator), more on older phones; the sheets show progress. A native Argon2id would open the same files faster, since each file records its own cost, and could raise the cost for new ones. scrypt at OWASP's minimum took 14 s, so it isn't used.

## Verify

`__WW_DEV__.backupFile` in dev builds times Argon2id here (`bench()`), locks and opens the current stores (`lock`, `unlock`), and writes or shares test files (`save`, `share`: `locked`, `plain`, `otherAccount`). See `.agents/skills/verify-witnesswork/features/account.md`.
