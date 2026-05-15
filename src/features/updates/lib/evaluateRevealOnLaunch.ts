/**
 * Pure decision function that decides, on app launch, whether to fire The
 * Milestone Update grand-reveal overlay, the standard `WhatsNewSheet`, neither
 * (but still stamp `lastAppVersion`), or do nothing at all.
 *
 * Extracted from `HomeTabStack` so the gate is unit-testable and so the rules
 * for crossing a Reveal-update version live in one place. See
 * `docs/adr/0001-reveal-updates-and-founding-supporter.md` for the rationale
 * around suppressing `WhatsNewSheet` for users in a Reveal update's audience.
 *
 * The caller is responsible for the side effects implied by each action:
 *
 * - `'milestone-reveal'` — request the grand-reveal overlay AND stamp
 *   `lastAppVersion` to `currentVersion`.
 * - `'whats-new'` — show the standard `WhatsNewSheet` AND stamp.
 * - `'stamp-only'` — only stamp; suppress every intro for this transition. Used
 *   when the user is in the Reveal update's audience but has already engaged
 *   with the reveal (so a re-launch shouldn't surface either UI).
 * - `'none'` — do nothing.
 */
export type RevealAction =
  | 'milestone-reveal'
  | 'whats-new'
  | 'stamp-only'
  | 'none'

export type EvaluateRevealOnLaunchInput = {
  currentVersion: string | null | undefined
  lastAppVersion: string | null
  milestoneRevealVersion: string
  seenMilestoneUpdateReveal: boolean
  dismissedMilestoneRevealOnce: boolean
  /**
   * Whether the static `releaseNotes` list contains any entry whose version is
   * `> lastAppVersion` and `<= currentVersion`. Computed by the caller rather
   * than this function because the notes asset is feature-tier and importing it
   * here would invert the boundary.
   */
  hasReleaseNotesBetween: boolean
}

import semver from 'semver'

export const evaluateRevealOnLaunch = ({
  currentVersion,
  lastAppVersion,
  milestoneRevealVersion,
  seenMilestoneUpdateReveal,
  dismissedMilestoneRevealOnce,
  hasReleaseNotesBetween,
}: EvaluateRevealOnLaunchInput): RevealAction => {
  if (!currentVersion || !lastAppVersion) return 'none'

  const crossingMilestone =
    semver.lt(lastAppVersion, milestoneRevealVersion) &&
    semver.gte(currentVersion, milestoneRevealVersion)

  if (crossingMilestone) {
    const isFreshReveal =
      !seenMilestoneUpdateReveal && !dismissedMilestoneRevealOnce
    // Crossing the Reveal version but the overlay has already been engaged
    // (showcase seen OR overlay skipped → recovery icon). Suppress every intro;
    // the caller still stamps `lastAppVersion` so a subsequent launch falls
    // through to the standard release-notes path.
    return isFreshReveal ? 'milestone-reveal' : 'stamp-only'
  }

  if (currentVersion !== lastAppVersion && hasReleaseNotesBetween) {
    return 'whats-new'
  }

  return 'none'
}
