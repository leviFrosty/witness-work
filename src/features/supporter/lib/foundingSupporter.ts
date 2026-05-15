/**
 * Pure predicate for Founding Supporter recognition. A user is a Founding
 * Supporter iff they are **currently** a Supporter AND the sticky one-shot
 * `seenFoundingSupporterReveal` flag is set — i.e. they dismissed the Founding
 * reveal modal on this device.
 *
 * Strictly flag-gated, **never** derived from `since` date alone — see
 * `docs/adr/0001-reveal-updates-and-founding-supporter.md` for the rationale
 * (the badge would otherwise silently appear for lapsed-then-resubscribed users
 * without explanation).
 */
export const isFoundingSupporter = (input: {
  isSupporter: boolean
  seenFoundingSupporterReveal: boolean
}): boolean => input.isSupporter && input.seenFoundingSupporterReveal
