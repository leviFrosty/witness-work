---
status: accepted
---

# Shared territories are scoped record spaces, with browser guest links and server-held hand-offs

> Hosts updated since: Beta calls its own Beta API (`api-beta.witnesswork.app`), not production's, and development guest links open on `localhost:8081`, see [readme.md#environments](../../readme.md#environments).

## Context

Territories (behind the `territories` flag) is an on-device prototype: one
zustand store, with other people simulated by a dev harness. Its screens
already show the product the User wants:

- a car group works one territory live, everyone recording doors and seeing
  each other's records as they happen;
- sharing only some streets, with buddies or with people who don't have the
  app, who record in a browser with no sign-in or install, through a link or
  QR code that lasts 24 hours and that the owner can end at once;
- handing one street off to one buddy, who works it in their own time, may
  share it onward, may give it back, and may never hand it off again; the
  giver sees who it's shared with and can take it back;
- do-not-calls that keep only a place and a date;
- returning a territory ends everything;
- free, no AI.

Shared Spaces (ADR 0056, Shared Cars) already gives blind, end-to-end
encrypted, per-record sync with live updates, joined through Buddies. But
every member of a space reads and writes every record, any member can invite,
ownership passes on when the owner leaves, and every op needs an attested
session. None of that fits street-only sharing, hand-offs, or guests without
an account.

This ships to the owner's Beta app first (production ww-api), and is expected
to change a lot after that.

## Decision

1. **One scoped space per shared territory.** A territory becomes a Shared
   Space the first time it's shared, linked, or handed off, and stays one
   until it's returned or deleted. `create` takes `mode: "scoped"`; spaces
   without it (cars) don't change.

2. **Streets are scopes the server can see but not read.** A street's
   records carry its scope id (its UUID's bytes, `b64u`) in their record ids
   (`s.<S>`, `s.<S>.<id>`). The server stores members' and links' scopes and
   filters `sync` and checks `put` by them. Street records are sealed under a
   per-scope key derived from the space key, so a holder of one street's
   key can't read another street.

3. **Roles are server state.** The owner never changes in a scoped space (no
   `leave`, only `delete`). Only the owner and street holders invite or make
   links, and only within what they may write. A handed-off street is
   read-only for the owner, whole-territory members and the owner's links.

4. **A hand-off is a hold.** The owner makes a buddy the holder of one street
   (`invite/create` with `handoff`, or `handoff/create` for someone already
   on it). Only the owner may do either, and the owner never changes, so a
   holder can't hand a street off again: the server refuses it, not just the
   app. `handoff/end` takes it back or gives it back, and with it removes the
   holder's onward people and ends their links.

5. **Guest links are capability URLs on the web app.** The link secret is
   derived from the creator's root seed and travels only in the URL fragment
   (`/territories/guest#…` on the app variant's web host). From it the guest
   page derives a token (the server keeps its hash) and a key that opens one
   record holding just its streets' scope keys. Two public ops,
   `guest/sync` and `guest/put`, take the token instead of a session, behind
   their own kill switch (`spaces:guests`), per-IP and per-link limits, and
   caps. The guest page polls instead of holding a live socket.

6. **A guest's name is a record.** The guest page makes a guest id, puts a
   `guest` record with the name in the link's first street, and stamps every
   door with `by` and `byName`.

7. **Privacy mode.** The owner's privacy mode applies to the whole territory
   (`houseRecords: false`: no door records for anyone, only worked streets
   and do-not-calls). A member's applies to their own device.

8. **Merge rules stay `lib/sharing.ts`'s.** Newest stamp wins per record;
   tombstones win ties; two records for one house fold in the view, with the
   do-not-call winning, and fold on the server at the next edit.

9. **Unshared territories travel in the User's own sync and backups.** First
   shipped without it; now the User's own territories that aren't in a space
   go in the sync payload as flat records (the space's record shapes, with
   `updatedAt` and tombstones), so every sync option, the account Backup, Set
   Up Another Device and backup files carry them. A deleted territory or
   street is deleted for good; a territory that moves into a space is marked
   `shared` rather than deleted, and the space is its source of truth until
   the share ends. Older versions leave the slice out, which never deletes.
   Card photos stay on the device. Details:
   [Unshared territories](../territories-protocol.md#unshared-territories-sync-and-backup).

10. **Guest links don't need Buddies.** A space needs only the account key
    and session, so a User without Buddies can make, show and end links. The
    member record's `tag` uses the inbox id Buddies derives from the same
    key, so setting up Buddies later keeps the same member. The `shared` mark
    in personal sync names the space (`space: { id, owner, at }`), so the
    owner's other devices find it without the roster. Sharing with buddies
    and hand-offs still need Buddies. Details:
    [Without Buddies](../territories-protocol.md#without-buddies).

11. **Prototype data is cleaned, not migrated.** Everything the harness
    simulated (received territories, people, shares, hand-offs) is removed;
    the User's own territories stay.

The wire contract is [`territories-protocol.md`](../territories-protocol.md).

## Considered options

- **A space per street.** Membership would be exact, but a 25-street
  territory means 26 spaces, sockets, invites and rekeys per person, past the
  20 spaces a day an account may create.
- **A separate space per share, bridged by the owner's device.** Guests and
  street-only buddies would only see each other's records while the owner's
  phone is online.
- **Per-member street keys** (wrapping only some streets' keys to street-only
  members). Stronger, but it doubles the key machinery for buddies the owner
  already trusts. Deferred; guests get it through decision 2.
- **Guests as accounts, or Turnstile on every guest op.** The User asked for
  no sign-in, and Turnstile isn't configured in production yet. A 256-bit
  capability with caps and a kill switch bounds the risk to one territory.
- **The guest link on the website apex, served by ww-api.** The apex is for
  app links (ADR 0042), and the page needs the web app's recorder anyway.
- **A token in the URL path** (the prototype's `witnesswork.app/t/<token>`).
  Paths reach server logs; fragments don't.
- **Every territory a private space from creation.** It would sync and
  restore every territory, but put a User's territories on our server without
  their choosing it (against ADR 0030 §3) and need Buddies on every device.
- **Unshared territories in the sync payload from the start.** Left for after
  sharing reached Beta, since it needs flat records and tombstones in the
  payload; it's now decision 9.

## Consequences

- People sharing a territory see each other's records within seconds, on
  iPhone and Android; guests within about 15 seconds.
- ww-api learns, per territory, how many streets there are, which scope each
  person or link has, record counts and times per street, and when guests
  write. It never learns names, streets, addresses, outcomes, or accounts.
- The production API gets its first write surface without a session. It's
  reachable only with a link's secret, and bounded per link, per IP, and per
  space.
- A street-only member colluding with the server could read other streets;
  guests can't.
- A guest link works only on the web host of the app variant that made it,
  so production links need the web app live on `app.witnesswork.app`; Beta
  links use `beta.app.witnesswork.app`.
- Shared Spaces is off in production today; Beta testing needs
  `spaces:enabled` and `spaces:guests` on there.
- Unshared territories come back on a new device through sync or a backup,
  except their card photos, which stay on the device that took them.
- New work: scoped mode, hand-off and link ops and the guest ops in ww-api;
  the territory engine, Buddies events, and the guest web route in the app;
  the Help Center, analytics, and the feature flag for Beta.
