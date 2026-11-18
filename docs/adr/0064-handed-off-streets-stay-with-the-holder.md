---
status: accepted
supersedes: [0047]
---

# Handed-off streets stay with the holder when the territory is returned

## Context

ADR 0047 made returning a territory end everything: the owner deletes the space, every share, link and hand-off ends, and everyone else keeps a read-only copy without door records.

A hand-off isn't like a share, though. The owner gives one street to a buddy to work in their own time. Once it's handed off, the street is the holder's to finish, and the owner can't even write to it. If the owner hands the card back first, the holder loses the street halfway through, with the doors they recorded.

The holder's device couldn't tell a return from being removed. ww-api answered both with the same `gone`, so the app treated every ending the same way.

## Decision

1. **A member's `gone` on a deleted space says so.** ww-api adds `reason: "deleted"` when the whole space was deleted. A member who left or was removed from a space that still exists gets `gone` with no reason, as before. It's an added field, so older apps ignore it.
2. **On `deleted`, the holder keeps their streets.** The holder's device copies the streets it holds, with their doors and do-not-calls, into a new personal territory of their own: checked out, not returned, and no longer linked to the owner. They work it and return it like any territory, and can share it again.
3. **The id is derived from the space id**, so every one of the holder's devices makes the same territory and personal sync merges it. A device that already has it (from another device) leaves it alone, so stale data never overwrites newer work.
4. **Everything else stays as ADR 0047 says.** Removal and take-back still end the hold. Whole-territory members still get a read-only copy without door records, minus any streets they hold. Deleting a shared territory runs a return first, so it keeps the holder's streets too.

## Consequences

- The holder finishes the street after the owner returns the card, with every door recorded on it.
- The owner's returned territory has the doors recorded up to the return. The holder's later work doesn't reach the owner.
- The holder's onward shares and guest links on that street end with the space. They can share their new territory again.
- A holder who is offline when the owner returns the territory keeps the street the next time their device syncs, because the deleted space keeps its tombstone.

## Considered options

- **Keep the space open for handed-off streets after a return.** The holder's onward shares would keep working and the owner would keep seeing progress. But it needs a new server operation, a state that is half returned and half shared on the owner's device, and rules for when the space finally closes.
- **The owner writes a "returned" record before deleting.** A holder who was offline at the time would never read it, because the space and its records are gone.
