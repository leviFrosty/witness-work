import {
  belowMinVersion,
  type BelowMinVersion,
} from '@/lib/appUpdate/versionGate'

export type NotesImportUpdateRequired = BelowMinVersion

/**
 * Decides whether this build is too old for Notes Import, from the floor `GET
 * /notes-import/status` advertises. Fail open, like the app-wide gate
 * (`@/lib/appUpdate/versionGate`): the proxy enforces nothing server-side, so a
 * false positive here would lock a working feature.
 */
export const notesImportUpdateRequired = belowMinVersion
