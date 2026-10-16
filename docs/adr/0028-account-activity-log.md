---
status: proposed
---

# Account activity: a security history the User can see

## Context

ADR 0027 made the server account the source of truth for who a User is, and
every account feature now runs through attested sessions. A User can have up
to ten of them, on phones they may have sold, lost, or handed off. They can
move their account to another phone, delete backups, and be suspended. None
of that is visible to them. If someone else got their account key (a
recovery key left in a photo, an old phone), the User couldn't tell, and
couldn't sign the stranger out.

Every mainstream account has this: a list of signed-in devices and a history
of security events (Google's "Your devices" and "Recent security activity",
Apple's device list, 1Password's sign-in history). Ours has to keep the
server's privacy promises: no IP addresses, locations, user agents, or
content, and nothing that names a buddy.

## Decision

### 1. One log per account, written by the server

ww-api keeps an `account_activity` table in the accounts database, keyed on
`accountId`. The server writes every entry; no client can add one. It holds
only high-level, security-relevant actions:

| Kind                     | When                                                                 |
| ------------------------ | -------------------------------------------------------------------- |
| `account.created`        | The account was created (opening its first session, or registering)  |
| `session.opened`         | A device signed in (opened a session)                                |
| `session.signed_out`     | A device ended its own session                                       |
| `session.revoked`        | Another of the User's devices signed this one out                    |
| `session.replaced`       | Opening an eleventh session ended this, the oldest                   |
| `session.refresh_reused` | A refresh token was reused after it was replaced; the session ended  |
| `handoff.sent`           | This account's key was sent to a new phone (Set Up Another Device)   |
| `backup.deleted`         | One backup slot was deleted, or all of them                          |
| `backup.downloaded`      | A backup slot was downloaded (at most once a slot, session, and day) |
| `account.suspended`      | The account was suspended                                            |
| `account.reinstated`     | The account was reinstated                                           |
| `buddies.inbox_linked`   | A Buddies inbox was linked to the account                            |
| `buddies.deleted`        | The account's Buddies data was deleted                               |

Not logged: refreshes, reads, uploads, and sessions that just expire. A
`session.refresh_reused` is the one a stolen refresh token leaves behind, so
the app flags it. Suspension entries carry the status only, never the
moderation reason. Buddies entries cover only the account's own inbox:
linking it and deleting it. Writer ops (a buddy writing into the User's
inbox, or the User into a buddy's) log nothing, so the log never ties one
account to another's inbox. They're recorded by the Worker, never in the
inbox's Durable Object.

Downloading a backup is the one read worth logging: it's how someone with a
leaked token would take the User's data. It's deduplicated per slot,
session, and day, so a restore adds one entry per slot.

### 2. Device names stay sealed

Each entry names the session it's about, and the session that did it when
that's a different one (`session.revoked`, `session.replaced`): its id,
platform, and the sealed device label `POST /accounts/v1/sessions` already
carries. The entry keeps its own copy of the label, so the history outlives
the session row (pruned a week after it ends). The server can't read the
label; the User's devices open it and show "iPhone 15 Pro".

### 3. Written with the action

Where the action is a D1 write (opening, closing, revoking, and replacing
sessions; creating the account; changing its status), the entry is written
in the same batch, so neither lands without the other. Where it isn't:

- **Backup delete and download** write the entry first, then touch R2. A
  failed delete or download leaves an entry for something the User will
  retry; it never leaves a deletion unlogged.
- **Handoff** writes the entry once the handoff's Durable Object accepted
  the key. If that write fails, the error is reported and the handoff still
  succeeds: the key has already left.

### 4. Devices and revoking

Two new bearer routes list and end sessions, and one lists activity:

- `GET /accounts/v1/sessions`: the account's live sessions.
- `POST /accounts/v1/sessions/revoke` `{ sessionId }`: ends one of them.
- `GET /accounts/v1/activity?before=&limit=`: newest first, by cursor.

Session ids stay out of URLs (ADR 0027), so revoking is a `POST` with the
id in the body rather than `DELETE /sessions/{id}`.

Revoking needs only the bearer token, unlike deleting backups. A leaked
token could sign the User's devices out, but each one opens a new session
without asking, so nothing is lost; a step-up signature would cost every
revoke a key derivation for little.

**Revoking doesn't take the account key away.** A revoked device that still
holds the key opens a new session the next time it needs one, and that shows
up as a new sign-in. The app says so: signing a device out is for phones the
User no longer has; a phone someone else holds needs a new account key, which
is beyond this ADR.

### 5. Kept for 400 days

Entries older than 400 days are deleted by the hourly cron, the same window
as backup slots: long enough to see a year of history, short enough that the
log isn't a lifetime record. Opening sessions is capped at 20 a day per
account key, so a misbehaving client can't fill the table.

### 6. In the app

Settings → Account gets **Devices** (live sessions, "This device" marked,
Sign Out for any other) and **Activity** (newest first, device names
decrypted on the device, the reused-token entry flagged). An entry whose
label won't open shows its platform ("An iPhone", "An Android phone"), and
an unknown kind is skipped, so the server can add kinds before the app knows
them.

Wire contract: [`docs/accounts-protocol.md`](../accounts-protocol.md)
(Activity and devices).

## Considered options

- **IP-derived location** ("near Austin, TX"), as Google and Apple show.
  Most useful for spotting a stranger, but it's the one thing we promised not
  to keep.
- **Logging every request.** Complete, but noisy and a usage record;
  nobody reading their security history wants to see each sync.
- **The device log on the device only.** Private by construction, but a
  phone someone else holds would have no reason to tell the User.
- **A step-up signature for revoking.** Matches `backup/delete`, but revoking
  loses nothing (see 4).
- **`DELETE /accounts/v1/sessions/{id}`.** More RESTful, but puts the
  session id in production's request logs.

## Consequences

- The User can see every device that signed in, and sign out the ones they
  no longer have.
- A stolen key shows up as a sign-in the User didn't make, but the app can't
  stop it on its own; replacing the account key stays the remedy.
- The server stores a per-account history of security events for 400 days:
  kinds, times, session ids, platforms, sealed device labels, and backup slot
  ids. The privacy policy's account section has to say so.
- New account-level features add a kind and call the recorder; clients skip
  kinds they don't know.
