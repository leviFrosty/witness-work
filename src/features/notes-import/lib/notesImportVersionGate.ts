import semver from 'semver'

export interface NotesImportUpdateRequired {
  /** The running app's `app.config.ts` version. */
  currentVersion: string
  /** The floor the proxy advertised. */
  minVersion: string
}

/**
 * Decides whether this build is too old for Notes Import. Fail open: any
 * missing or unparseable version (no floor configured, dev build without a
 * version, garbage from the wire) means "not gated" — the proxy enforces
 * nothing server-side, so a false positive here would lock a working feature.
 */
export const notesImportUpdateRequired = (
  currentVersion: string | null | undefined,
  minVersion: string | null | undefined
): NotesImportUpdateRequired | null => {
  const current = semver.valid(currentVersion ?? null)
  const min = semver.valid(minVersion ?? null)
  if (!current || !min) return null
  return semver.lt(current, min)
    ? { currentVersion: current, minVersion: min }
    : null
}
