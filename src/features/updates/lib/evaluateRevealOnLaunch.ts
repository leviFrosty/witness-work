import semver from 'semver'

/**
 * Pure decision function that decides, on app launch, whether to fire The
 * Milestone Update grand-reveal overlay, the `WhatsNewSheet`, the passive Home
 * `WhatsNewCard`, neither (but still stamp `lastAppVersion`), or do nothing at
 * all.
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
 * - `'whats-new'` — show the `WhatsNewSheet` AND stamp. Reserved for releases
 *   announced as `'sheet'`.
 * - `'whats-new-card'` — mark the release notes unread (Home card + Settings dot)
 *   AND stamp. The default for releases with notes.
 * - `'stamp-only'` — only stamp; suppress every intro for this transition. Used
 *   when the user is in the Reveal update's audience but has already engaged
 *   with the reveal, and for silent/note-less releases.
 * - `'none'` — do nothing.
 */
export type RevealAction =
  | 'milestone-reveal'
  | 'whats-new'
  | 'whats-new-card'
  | 'stamp-only'
  | 'none'

/**
 * How loudly a release is announced on first launch after updating.
 *
 * - `'silent'` — no launch UI; the notes only live in Settings → What's New.
 * - `'passive'` — a dismissible Home card and a dot on the Settings row. Never
 *   blocks the user's quick "open app, add time" flow.
 * - `'sheet'` — the `WhatsNewSheet` over the app. Keep for genuinely big
 *   releases.
 */
export type ReleaseAnnounce = 'silent' | 'passive' | 'sheet'

const ANNOUNCE_RANK: Record<ReleaseAnnounce, number> = {
  silent: 0,
  passive: 1,
  sheet: 2,
}

/**
 * Loudest `announce` level among the releases in `(lastAppVersion,
 * currentVersion]`, or `null` when there are none. Releases without an explicit
 * level count as `'passive'`.
 */
export const getReleaseAnnounceBetween = (
  notes: { version: string; announce?: ReleaseAnnounce }[],
  lastAppVersion: string,
  currentVersion: string
): ReleaseAnnounce | null =>
  notes
    .filter(
      (note) =>
        semver.gt(note.version, lastAppVersion) &&
        semver.lte(note.version, currentVersion)
    )
    .map((note) => note.announce ?? 'passive')
    .reduce<ReleaseAnnounce | null>(
      (loudest, announce) =>
        loudest && ANNOUNCE_RANK[loudest] >= ANNOUNCE_RANK[announce]
          ? loudest
          : announce,
      null
    )

export type EvaluateRevealOnLaunchInput = {
  currentVersion: string | null | undefined
  lastAppVersion: string | null
  milestoneRevealVersion: string
  seenMilestoneUpdateReveal: boolean
  dismissedMilestoneRevealOnce: boolean
  /**
   * Loudest announce level among the static `releaseNotes` entries whose
   * version is `> lastAppVersion` and `<= currentVersion` (see
   * `getReleaseAnnounceBetween`), or `null` when there are none. Computed by
   * the caller so this function stays independent of the notes asset.
   */
  releaseAnnounce: ReleaseAnnounce | null
}

export const evaluateRevealOnLaunch = ({
  currentVersion,
  lastAppVersion,
  milestoneRevealVersion,
  seenMilestoneUpdateReveal,
  dismissedMilestoneRevealOnce,
  releaseAnnounce,
}: EvaluateRevealOnLaunchInput): RevealAction => {
  if (!currentVersion || !lastAppVersion) return 'none'
  if (currentVersion === lastAppVersion) return 'none'

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

  switch (releaseAnnounce) {
    case 'sheet':
      return 'whats-new'
    case 'passive':
      return 'whats-new-card'
    default:
      return 'stamp-only'
  }
}
