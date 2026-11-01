import semver from 'semver'

export interface BelowMinVersion {
  currentVersion: string

  minVersion: string
}

export const belowMinVersion = (
  currentVersion: string | null | undefined,
  minVersion: string | null | undefined
): BelowMinVersion | null => {
  const current = semver.valid(currentVersion ?? null)
  const min = semver.valid(minVersion ?? null)
  if (!current || !min) return null
  return semver.lt(current, min)
    ? { currentVersion: current, minVersion: min }
    : null
}
