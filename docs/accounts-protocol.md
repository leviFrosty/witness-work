# Server account protocol

The wire contract for the server account between the WitnessWork app (`src/lib/serverAccount`) and ww-api (`ww-api/src/accounts`). Why it exists and what it will grow into is in [ADR 0024](./adr/0024-anonymous-server-accounts.md).

The server account is not ADR 0011's account id. That one is the RevenueCat identity, shared through a file in iCloud Drive. This one is a row ww-api owns, so it can suspend someone for abuse.

## Keys

| Key                 | What it is                                                            | Where it lives                                                           |
| ------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Account key         | 32 random bytes; today the Buddies root seed                          | The User's devices only (iCloud Keychain on iOS, Block Store on Android) |
| Account signing key | Ed25519, seed `HKDF-SHA256(accountKey, "", "ww-account/v1/sign", 32)` | Derived on each device; never stored                                     |
| `accountPub`        | The signing key's public key, `b64u` (43 chars)                       | The server's `accounts.account_pub`                                      |
| `accountId`         | 16 random bytes, `b64u` (22 chars), minted by the server              | The server, and each device's MMKV                                       |

Every feature derives its own keys from the account key with its own HKDF label (Buddies uses `ww-buddies/v1/*`), so the server can't tell that `accountPub` and a feature's public keys belong together. Only signatures the User's devices make link them.

## Requests

`POST {BASE}/accounts/v1/{op}` with the Buddies envelope `{ "p": b64u(UTF-8 JSON), "s": b64u(Ed25519) }`. The signature covers `UTF-8("ww-account/v1\n" + op + "\n")` followed by the decoded bytes of `p`. The context differs from Buddies' `ww-buddies/v1`, so no signature counts for both. Errors use the Buddies error envelope and codes, including `stale` with `serverTime`.

### `account/register`

| Payload                     | Response                    |
| --------------------------- | --------------------------- |
| `accountPub`, `ts`, `nonce` | `{ ok, accountId, status }` |

- Self-signed by the account signing key. `status` is `active` or `suspended`.
- Idempotent: the same `accountPub` always gets the same `accountId`, so a replay learns nothing new and there's no nonce cache.
- Counts against the Buddies register edge limit and a per-caller daily quota.
- `disabled` (503) when the worker has no accounts database. The app then asks again about once a day.

## Linking a Buddies inbox

`inbox/register` ([Buddies protocol](./buddies-protocol.md)) takes `account: { accountId, signature }`, where `signature` is the account signing key's Ed25519 signature over:

```
UTF-8("ww-account/v1\ninbox/link\n" + accountId + "\n" + inboxId + "\n" + ownerPub)
```

The whole payload is also signed by the inbox's owner key, so a link takes both keys. The relay checks the account and the signature, registers the inbox, and only then writes the link. An inbox already linked to another account is `conflict`. The answer's `accountId` names the account the inbox belongs to, with or without a proof.

The app sends a proof on every registration once it has an account, and links an inbox registered before accounts on the first sync after it gets one (once per launch). Without an account (offline, or accounts off) it registers unlinked, as before.

## Suspension

A suspended account's inboxes refuse every owner op except `inbox/delete` and `slot/remove` with `403 suspended`, close their live sockets with `4003 "suspended"`, and refuse `inbox/register`, with or without a proof. Buddies writing into the suspended User's inbox, and the User's own writes into buddies' inboxes (writer ops), still work: a buddy who wants them gone removes them. The app shows the `buddies_errorSuspended` message and backs off like the kill switch.

Moderation is maintainer-only: `POST /admin/accounts/lookup` and `/admin/accounts/status` with `x-ww-admin-token` (ww-api `AGENTS.md`, Accounts). A report names the buddy's `inboxId`, which finds the account.

## Privacy

The accounts database holds the account id, `accountPub`, the status and its history (reason codes only), and which inboxes each account owns. No name, email, phone number, or private key, and nothing the User shares in Buddies. The inbox links mean the server knows which inbox belongs to which account, but not who that is or who their buddies are.
