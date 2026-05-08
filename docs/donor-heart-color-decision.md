# Donor heart color — decision note

**Date:** 2026-05-08
**Status:** Decided. No code change.

## TL;DR

The home-header donor heart stays **red** (`theme.colors.errorAlt`) when
filled, **outline + neutral** when never contributed. Active supporters
keep getting `SyncPopover` in that slot (iOS-only app). Don't change it
to gold; don't add a supporter pill; don't visually distinguish tipper
vs lapsed.

## Two-color rule

The app uses two distinct visual signals around contribution. Keep them
separate:

- **Gold** (`theme.colors.supporter`, `#ffc228`) = **active supporter
  status**. Used by `SupporterBadge`, `SupporterInfoSheet`, paywall
  benefits, and gated feature rows. If a UI element is gold, it means
  "this is a supporter feature" or "this user is currently a supporter."
- **Red** (`theme.colors.errorAlt`) = **gratitude for past contribution**.
  Used by the donor heart in the home-screen header. Universal "thanks
  for donating" semantics (GitHub Sponsors, Twitter likes, Apple Heart).

These don't conflict because they encode different things — _current
status_ vs _past gratitude_. Mixing them (e.g. a gold filled heart for
past contributors) re-introduces the ambiguity it would seem to solve.

## Why this came up

The original concern was that a filled red heart shown to _any_ past
contributor (one-time tipper, lapsed subscriber, active subscriber) felt
inconsistent with the gold supporter brand used elsewhere. Recoloring
the heart gold seemed like the obvious fix.

It isn't. Two reasons:

1. **The structural conflation is already gone on iOS.** Active
   supporters never see the heart — `DrawerNavigator` swaps in
   `SyncPopover` for them (`isSupporter && Platform.OS === 'ios'`). The
   only users who see the filled heart are people who tipped or whose
   subscription lapsed. So the red heart is _only_ a "thank you" signal,
   never a status signal — which is exactly what red+heart conventionally
   means.
2. **A gold filled heart re-creates the ambiguity it tries to fix.** Gold
   is the active-supporter color. Putting a gold heart in the header for
   non-active users invites a "wait, am I a supporter?" misread. Any
   modifier we'd add to disambiguate (dim, dot, outline-only, accent
   tint) costs design surface for a distinction users barely register at
   icon size.

## What was considered and rejected

- **Recolor filled heart to `theme.colors.supporter` (gold).** Rejected:
  conflates with active-supporter brand.
- **Two-tier: gold supporter pill for active + heart for past.** Dead code
  on iOS-only — `SyncPopover` always wins the active-supporter slot.
- **Distinguish lapsed vs tipper visually** (e.g. outline gold for
  lapsed, filled gold for tipper). Visual delta too small at header icon
  size; lapsed reminder may also feel hostile to users who deliberately
  cancelled.
- **Adding `wasEverSubscriber` / `hasOnlyTipped` to `CustomerCtx`.**
  Rejected as YAGNI. Add them only when a non-header surface (Settings
  row, profile area) actually needs them.
- **Tinting `SyncPopover` gold for active supporters.** Plausible polish
  for later if you want supporter brand color in the header for active
  users. Not part of this decision.

## If you ever revisit this

If you want explicit supporter recognition for active supporters in a
visible place, put it somewhere deliberate — a row in Settings, a
thank-you card on the home screen body, a chip near the avatar — not
extra chrome in the header. The header slot already does its job: a
single icon whose role depends on contribution status, plus
`SyncPopover` carrying the active-supporter affordance.

If you want to distinguish lapsed subscribers (e.g. for a re-engagement
nudge), do it via a one-time card or banner with a clear dismiss, not a
permanent header indicator.
