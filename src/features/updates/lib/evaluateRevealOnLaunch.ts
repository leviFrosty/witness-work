import semver from 'semver'

export type RevealAction =
  | 'update-reveal'
  | 'whats-new'
  | 'whats-new-card'
  | 'stamp-only'
  | 'none'

export type ReleaseAnnounce = 'silent' | 'passive' | 'sheet'

const ANNOUNCE_RANK: Record<ReleaseAnnounce, number> = {
  silent: 0,
  passive: 1,
  sheet: 2,
}

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

  revealVersion: string

  revealEngaged: boolean

  releaseAnnounce: ReleaseAnnounce | null
}

export const evaluateRevealOnLaunch = ({
  currentVersion,
  lastAppVersion,
  revealVersion,
  revealEngaged,
  releaseAnnounce,
}: EvaluateRevealOnLaunchInput): RevealAction => {
  if (!currentVersion || !lastAppVersion) return 'none'
  if (currentVersion === lastAppVersion) return 'none'

  const crossingReveal =
    semver.lt(lastAppVersion, revealVersion) &&
    semver.gte(currentVersion, revealVersion)

  if (crossingReveal) {
    return revealEngaged ? 'stamp-only' : 'update-reveal'
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
