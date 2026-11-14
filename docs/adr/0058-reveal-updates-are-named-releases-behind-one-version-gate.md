---
status: accepted
supersedes: [0001]
---

# Reveal updates are named releases behind one version gate

## Context

ADR 0001 gave each Reveal update its own reveal, its own `seen…` flag, and its own version gate in `HomeTabStack`. The 1.44 update reveal replaced the Milestone Update on launch, and a second set of gates and flags would have grown with every Reveal update.

## Decision

The 1.44 update reveal replaced the Milestone Update on launch; its overlay and showcase stay only as replays in Developer Tools → Special updates. The reveal's gate is now a single `UPDATE_REVEAL_VERSION` (`src/features/updates/constants/updateReveal.ts`), and engagement is stored against that version in `updateReveal` instead of per-reveal `seen…` booleans, so a future Reveal update only raises the constant. Reveal updates are named releases: `UPDATE_REVEAL_NAME` (The Together Update for 1.44) titles the reveal, its tray replay item, and the release's What's New badge. The suppression rule from ADR 0001 stays: crossing the version shows the reveal instead of `WhatsNewSheet` or the passive tray item, and release notes stay in Settings → What's New.

## Consequences

- A future Reveal update only raises `UPDATE_REVEAL_VERSION` and renames `UPDATE_REVEAL_NAME`; it adds no new flag or gate.
- The Milestone Update's overlay and showcase are replays only, in Developer Tools → Special updates.
