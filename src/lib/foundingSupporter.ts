/**
 * Start of the day the Supporter tier launched (1.38.2, The Milestone Update).
 * Anyone supporting before it did so before Supporter perks existed.
 */
export const FOUNDING_SUPPORTER_CUTOFF = new Date('2026-05-21T00:00:00Z')

/**
 * Founding Supporter recognition, derived from the Supporter `since` date (see
 * `supporterSinceDate`): a current Supporter whose earliest qualifying
 * entitlement predates the cutoff. `since` is null for non-Supporters, so a
 * lapsed Founding Supporter loses the recognition along with all other
 * Supporter UI and regains it if they resubscribe with their original purchase
 * date. See `docs/adr/0015-founding-supporter-from-since-date.md`.
 */
export const isFoundingSupporter = (since: Date | null): boolean =>
  since !== null && since.getTime() < FOUNDING_SUPPORTER_CUTOFF.getTime()
