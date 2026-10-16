import semver from 'semver'

/** This build is below a floor ww-api set. */
export interface BelowMinVersion {
  /** The running app's `app.config.ts` version. */
  currentVersion: string
  /** The floor the server advertised. */
  minVersion: string
}

/**
 * Whether this build is below `minVersion`. Fail open: any missing or
 * unparseable version (no floor configured, a dev build without a version,
 * garbage from the wire) means "not gated", since a false positive would lock a
 * working app.
 */
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
