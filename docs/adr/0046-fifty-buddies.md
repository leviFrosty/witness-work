---
status: accepted
---

# Fifty buddies

## Context

Buddies allowed five spots per User, buddies and pending invites together
([buddies-recommendations.md](../buddies-recommendations.md) §1). ADR 0037 left
raising it open as a product decision. The User asked to raise it to 50.

Several things were sized for five:

- the relay's caps: 5 slots plus open invites, 5 open invites, 20 invite
  creations a day, a 32 KiB roster, 32 push templates per device;
- an account key change invites every buddy to the new inbox at once (ADR 0039
  §5), so it needs an open invite per buddy;
- each device registers one `join.request.<tag>` template per buddy, so that
  muting one buddy's Ask to Join alerts needs no relay change;
- the roster carries every buddy, and its schema allowed at most five;
- `colorIndex` picked the lowest free index below the limit, from five colors.

## Decision

1. **Fifty spots, five waiting invites.** A User has at most 50 buddies and
   pending invites together, and at most 5 invites waiting to be accepted. The
   app enforces both; the relay enforces 50.
2. **The relay allows what a key change needs.** 50 slots plus open invites, 50
   open invites (one reconnect invite per buddy), and 100 invite creations per
   rolling day. Hand-made invites stay at 5 open because the app holds them
   there, not the relay.
3. **Per-buddy join templates stay.** The relay takes 96 templates per device:
   10 fixed kinds, 50 join kinds, 2 badge and 2 Shared Cars kinds make 64. A
   wildcard template would need a relay change and lose per-buddy muting.
4. **A 128 KiB roster.** Fifty buddies with the longest names and nicknames
   take about 46 KB, and a worst-case roster about 73 KB. The app's plaintext
   cap stays the relay's sealed cap minus the seal's 29 bytes. A full roster
   still fits the relay's 256 KiB request, legacy envelope included.
5. **Colors go to the least-used of the five.** A new buddy gets an unused
   index whose color the fewest buddies have, so ten buddies share each color
   at 50, and a User can still pick a color of their own.
6. **ww-api ships first**, as every release does (`scripts/release-api.sh`).

## Consequences

- Older builds still stop at five on their own device. A User whose other
  device runs an older build and who has more than five buddies: that device
  can't read the roster (its schema allows five) and skips it whole until
  it's updated. It keeps its own buddies, and a roster it writes is replaced by
  an updated device's on that device's next sync.
- A Buddy Card publish makes one `card/put` per buddy, one after another, so up
  to 50 requests. That's within the per-account write budget (600 a minute).
- A first sync downloads every buddy's card, up to 50.
- Relay cost grows with fan-out, so about in step with the average number of
  buddies. The cost notes in buddies-recommendations.md assume about five.
