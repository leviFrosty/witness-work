# Reveal updates and Founding Supporter recognition

A **Reveal update** is an app version that earns its own dedicated full-screen reveal on first launch and **suppresses `WhatsNewSheet` entirely** for that version transition — the reveal IS the update intro for users in its audience. A Reveal update can chain multiple audience-specific reveals (e.g. the universal `MilestoneRevealOverlay` followed by `FoundingSupporterRevealScreen` for users who were active Supporters at upgrade). Each reveal owns its own `seen…` preference flag for one-shot semantics; non-audience users (e.g. non-Supporters on a Supporter-targeted Reveal update) still get `WhatsNewSheet` because they still need to know about the version.

**Founding Supporter** recognition is **strict and flag-gated**, not derived from `since` date alone. The Founding badge variant and the privilege of having "seen the reveal" both key off a single sticky preference flag (`seenFoundingSupporterReveal`) that is set exactly once — on dismissal of the Founding reveal modal. A User who was technically Founding-eligible by `since` date but was lapsed at upgrade time never gets the flag and is therefore not a Founding Supporter; they are simply a Supporter. This makes the mental model "Founding = was present at the Reveal" and avoids the awkward case of a silent Founding badge appearing months later for someone who re-subscribes.

## Considered alternatives

- **Sequence `WhatsNewSheet` after the reveal**: rejected. Three potential interruptions on a single launch (MilestoneReveal → Founding → WhatsNew) is too many; release notes remain reachable from Settings.
- **Inline release notes inside the Founding reveal**: rejected. Mixes celebratory framing with administrative content and bloats the screen.
- **Derive Founding recognition purely from `since <= cutoff`**: rejected. A lapsed-then-resubscribed User would silently get the badge without explanation; coupling the badge to the reveal flag makes the recognition self-explaining.
- **Reveal-queue Zustand store**: deferred. With 1–2 reveals in flight, the callback chain in `HomeTabStack` is small enough that a generic queue would be premature abstraction. Revisit if a third Reveal update lands.

## Consequences

- Future Reveal updates must explicitly opt into the suppression rule by adding their own gate alongside `MILESTONE_UPDATE_VERSION` / `FOUNDING_SUPPORTER_REVEAL_VERSION` in `HomeTabStack`.
- TestFlight users who installed a build with the Reveal version _before_ this work shipped have `lastAppVersion` already stamped at the target version; they will not cross the gate. Replay via the dev-tools "Reset reveals" control is the documented workaround.
- The Founding flag is **never cleared**. A re-subscribing Founding Supporter regains their badge automatically; an erroneously-granted flag cannot be revoked without a migration.
