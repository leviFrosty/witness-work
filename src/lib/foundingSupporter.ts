export const FOUNDING_SUPPORTER_CUTOFF = new Date('2026-05-21T00:00:00Z')

export const isFoundingSupporter = (since: Date | null): boolean =>
  since !== null && since.getTime() < FOUNDING_SUPPORTER_CUTOFF.getTime()
