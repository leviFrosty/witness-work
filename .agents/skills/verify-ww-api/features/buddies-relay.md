# Buddies relay

Buddies lets two publishers share upcoming Plans through a blind relay. Each person owns an inbox signed with their Ed25519 key. A buddy writes cards and events into the other inbox through a per-pair writer key. Pairing runs invite → fetch → claim → confirm, and `inbox/sync` reads everything back. The wire contract is in `docs/buddies-protocol.md`.

Every op takes two forms. A **bearer request** (`Authorization: Bearer` from an account session; app versions with sessions) sends owner ops as plain JSON and is authorized by the account the inbox is linked to; writer ops still carry the writer envelope. A **legacy request** (no header; shipped builds) is the signed envelope, until KV `auth:legacy` is `off`.

## Sub-features

- `register` makes `inbox/register` idempotent per key and returns `conflict` for a different key, even after the inbox was wiped.
- `device` makes `device/register` upsert a device and its push templates. Pushes are skipped locally because there are no APNs keys.
- `invite` runs `invite/create` → `invite/fetch` (`status:"open"`) → `invite/claim` → `invite/fetch` (`status:"claimed"`) → `invite/delete` → `invite/fetch` (404).
- `claim-event` appends an `invite.claimed` event (`slotId:""`, `eventId` = inviteId, the claim blob) to the creator's inbox.
- `writes` covers `card/put` and `event/put` through a writer slot. `event/put` is deduped by `eventId` and returns the original `seq`.
- `sync` makes `inbox/sync(since)` return slots plus cards, events, and roster with `seq > since`. `roster` is `null` when unchanged.
- `auth` rejects a foreign key with 401 `bad_signature`, a reused nonce with 409 `replay`, a `ts` outside ±5 min with 401 `stale` (with `serverTime` and a `Date` header), and an unknown slot with 410 `gone`.
- `claim-retry` answers the winning claimer's identical retry with 200 `{ok:true}` (no second event or push); any other claim on a claimed invite is 409 `conflict`.
- `limits` caps open invites at 3 and slots plus invites at 5, and rate-limits every op per caller (client IP, IPv6 by /64) in four tiers, answering 429 `rate_limited` with `Retry-After: 60`. Stored events per slot and per inbox are capped too (`BUDDIES_ABUSE_LIMITS` in `src/buddies/limits.ts`). Five wrong claim secrets burn an invite.
- `leave` removes the slot, its card, and its events from both inboxes through `slot/remove` and `slot/leave`.
- `seal` (`slot/seal`, after an account key change): the writer seals its own slot, after which `card/put` and `event/put` from it are 403 `sealed` in both forms, the owner's `inbox/sync` lists it with `sealed: true`, and `slot/leave` and `slot/remove` still work. Leaving a sealed slot keeps its events (not its card) until they expire; the owner's `slot/remove` of that id clears them. `pnpm test:e2e src/e2e/slotSeal.e2e.test.ts` shows the old key's holder writing before the seal and refused after it.
- `delete` wipes the inbox with `inbox/delete`. Sync then returns 404 `not_found`, and only the same key can register the inbox again.
- `kill-switch` makes every op return 503 `disabled` when KV `buddies:enabled` is `false`, except `inbox/delete`, `slot/remove`, `slot/leave`, and `slot/seal`.
- `photos` stores encrypted note photos: `blob/put` (raw sealed bytes, owner-signed envelope in `x-buddies-payload`/`x-buddies-signature`, `blobId` = SHA-256 of the bytes, at most 1 MiB) writes R2 object `v1/<inboxId>/<blobId>`; `blob/get` (unsigned `{payload}` with `inboxId`, `blobId`, `token`) streams it back with `Cache-Control: no-store`, and every miss is the same 404; `blob/delete` (owner) removes them. `inbox/sync` reports `capabilities.photos`. KV `buddies:photos` (`BUDDIES_PHOTOS=on` in dev) switches them, answering 503 `photos_disabled` when off.
- `live` upgrades `GET /buddies/v1/inbox/live` (signed headers `x-buddies-payload`/`x-buddies-signature`) to a WebSocket that sends `hello`, then `changed` with the inbox `seq` after each write, answers `ping` with `pong`, and closes with 4001 `gone` on `inbox/delete`. A plain GET gets 426 and the kill switch 503.
- `bearer` runs every op class as a bearer request: `inbox/register` with the token and a required `account` proof for the token's account (403 `forbidden` otherwise); owner ops as plain JSON (`inbox/live` and `blob/put` in `x-buddies-payload`, no signature header), 403 `forbidden` for another account's inbox and 409 `not_linked` for one registered before accounts; writer ops with the token plus the writer envelope; invite and blob reads with the token plus today's body. A bad token is 401 `unauthorized` with `WWW-Authenticate`, never a fallback. Bearer limits count against a hash of the account, not the IP.
- `legacy-off` answers every legacy request with 426 `upgrade_required` (no `Retry-After`) once KV `auth:legacy` is `off`, leaving ops included, while bearer requests keep working.

## How to get to it (user POV)

- In the app: Buddies → Invite a buddy creates an invite and shares `https://ww-proxy.leviwilkerson.com/b#1<secret>` (`/buddies/invite#1<secret>` once the app generates the readable path).
- The buddy taps the link. The app opens, fetches and claims the invite, and the inviter confirms.
- Opening the Buddies tab or the calendar syncs the inbox, and editing Plans writes a card. Removing a buddy runs leave. Deleting Buddies data deletes the inbox.

## Driving it with verify-ww-api

Preconditions:

- `doctor` passes, including `ok    buddies relay enabled`.
- `.verify/state.json` exists, so the e2e helpers resolve the URL.

- **Pair two people.** Run `pnpm test:e2e src/e2e/buddies.e2e.test.ts -t "pairing happy path"`. This registers Levi and Maria, creates, fetches, and claims an invite, confirms, and exchanges cards, a roster, leave, and delete. It passes with a read-back after every write.
- **Ownership after delete-all.** Run `pnpm test:e2e src/e2e/buddies.e2e.test.ts -t "delete-all"`. Other keys racing and following `inbox/delete` get 409 `conflict`, the buddy's `card/put` gets 404 `not_found`, the owner's key registers again (200, empty sync), and the buddy then gets 410 `gone` until the slot is restored. The 180-day wipe can't be reached over HTTP; unit tests in `src/buddies/relay.test.ts` cover it.
- **Unsigned probe.** Fetch an unknown invite. Run `curl -s -X POST $URL/buddies/v1/invite/fetch -H "cf-connecting-ip: 198.18.3.1" -d "{\"p\":\"$(printf '{"inviteId":"AAAAAAAAAAAAAAAAAAAAAA"}' | base64 | tr '+/' '-_' | tr -d '=')\"}"`. The body is `{"ok":false,"error":"not_found","code":"not_found"}` with status 404.
- **Malformed envelope.** Run `curl -s -X POST $URL/buddies/v1/inbox/sync -H "cf-connecting-ip: 198.18.3.2" -d '{"payload":"!!"}'`. The body is `{"ok":false,"error":"bad_request","code":"bad_request"}` with status 400.
- **Limits and abuse.** Run `pnpm test:e2e src/e2e/buddies.e2e.test.ts -t "relay limits"`. Past 120 `invite/fetch` a minute from one IPv6 /64 (rotating addresses), and past 60 `inbox/register` from one caller, requests get 429 `rate_limited` with `Retry-After: 60`; a flood of bad-signature syncs at someone's inbox gets 429 while its owner still syncs; the 4th open invite gets 429; unknown ops get 404. The stored-event caps, the 2,000-a-day registration quota, and the per-signer budgets need hours or days of writes, so unit tests cover them (`src/buddies/limits.test.ts`).
- **Live socket.** Run `pnpm test:e2e src/e2e/buddies.e2e.test.ts -t "live socket"`. It opens a socket with `openLive` (a raw handshake in `src/test/e2e.ts`, so refusals keep their status and body), reads `hello` and `changed` back against `inbox/sync`, checks `ping`/`pong`, the 4001 close, and the 426/401/409/400 refusals.
- **Photo blobs.** Run `pnpm test:e2e src/e2e/buddies.e2e.test.ts -t "photo blobs"`. A 200 KiB blob round-trips byte for byte; a retry keeps the first token and only a later expiry moves it; a wrong token, an unknown blob, and an unknown inbox all get the same 404; mismatched bytes are 400, `bytes` or a body past 1 MiB 413 `too_large`, a stranger's signature 401, a resent envelope 409 `replay`; `blob/delete` and `inbox/delete` make reads 404. To see objects really leave R2, count rows in `<persist dir>/v3/r2/miniflare-R2BucketObject/*.sqlite` (`SELECT COUNT(*) FROM _mf_objects`) after a run. Caps (300 blobs, 150 MiB, 100 uploads a day), expiry by the alarm, and R2 failures are unit-tested in `src/buddies/blobs.test.ts`.
- **Photos switch.** Run `pnpm test:e2e src/e2e/buddies.e2e.test.ts -t "photos switch"`. With KV `buddies:photos` `off`, the three blob ops return 503 `photos_disabled` (with `Retry-After: 60`) and `inbox/sync` says `capabilities.photos: false`; the stored blob reads again once the key is deleted.
- **Kill switch.** Run `pnpm test:e2e src/e2e/buddies.e2e.test.ts -t "kill switch"`. `inbox/register` and `inbox/sync` return 503 `disabled`, `inbox/delete` still returns `{"ok":true}`, and the switch is restored afterwards.
- **Bearer requests.** Run `pnpm test:e2e src/e2e/buddiesSessions.e2e.test.ts`. Two sessions open through the dev bypass; the owner registers with a proof, adds a slot, the buddy writes an event with its own token, the owner syncs it back (twice: no replay without a nonce), a photo round-trips, an invite is fetched and claimed, and the live socket says `hello`, `changed`, and `pong`, then closes 4001 on `inbox/delete`. It also checks `not_linked` until a legacy-registered inbox links, `forbidden` for another account's token (sync, live, `blob/put`, a proof for another account), and 401 for a bad token. With the local launcher it flips `auth:legacy` off (every legacy form 426, bearer still 200) and spends one account's 120 unsigned requests from fresh addresses (429), while another account and a legacy caller from that address still pass.
- **Fuzz.** Run `pnpm fuzz:buddies --runs 300`. The last lines read `fuzz: canary intact, bearer canary intact, … health after ok` and `fuzz: ok`.
- **Proof.** Keep `.verify/artifacts/e2e-buddies-*.json` and `e2e-buddies-sessions-*.json` (every envelope and response; tokens by header name only) and `.verify/artifacts/fuzz-*.json`, which must have `failures: []`, `canary.intact: true`, and `bearerCanary.intact: true`.

## Gotchas

- Signed payloads need `ts` within ±5 min of the worker clock and a fresh 22-char `nonce`. Resending a captured envelope is a replay, so build a new one per attempt.
- Unknown inbox ids return 404 before the signature check, so a "wrong key" test needs a registered inbox to prove 401.
- The Worker refuses a stale `ts` (401 `stale`) and a badly signed `inbox/register` (401 `bad_signature`) before any Durable Object, so a stale request to an unknown inbox answers `stale`, not `not_found`.
- Each slot allows 60 `card/put` and `event/put` writes per hour, and each inbox allows 20 invite creations per day. Long manual sessions on one identity hit `rate_limited` (429), so use fresh identities.
- Under `wrangler dev` only, the request after a cancelled chunked upload gets a canned proxy 503 (or hangs, for a GET). The fuzzer drains and retries it and counts it as `devProxyRetries`; it is not a worker bug.
- The kill-switch and photos-switch tests edit shared local KV. Don't run e2e and the fuzzer at the same time.
- A `blob/put` refused before its body is read (over 1 MiB) can trip the same `wrangler dev` proxy quirk as a cancelled upload; the e2e test and the fuzzer send a resendable POST afterwards to drain it.
- After the server closes a live socket, `wrangler dev` keeps the TCP connection about 10 s, so a standard WebSocket client fires `close` late even though the close frame arrived at once. `openLive` resolves `closed` on the frame.
- A bearer owner body is the plain fields; an envelope (`payload`/`signature`) with a token is 400, not a fallback. Bearer `inbox/live` and `blob/put` take only `x-buddies-payload`: a signature header (either naming) or only the short `x-buddies-p` is 400.
- Access tokens last 15 minutes. Long manual sessions open a new one (`openSession` in `src/test/e2e.ts`; the same account key gets the same account).
- The legacy-switch tests edit shared local KV (`auth:legacy`); restore it with `kv delete auth:legacy` after flipping it by hand.
