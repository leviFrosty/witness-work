import type { MytimeRawTables } from '@/features/mytime-import/lib/mytimeSchema'
import {
  MYTIME_MAX_FILE_BYTES,
  readMytimeSqlite,
} from '@/features/mytime-import/lib/readMytimeSqlite'
import { MytimeImportError } from '@/features/mytime-import/lib/readMytimeTables'

export * from '@/features/mytime-import/lib/readMytimeTables'

/** The web reads the backup in memory (`readMytimeSqlite`). */
export const canReadMytimeDb = true

/**
 * Opens the `.mytimedb` the User picked from a file input and reads it into raw
 * MyTime rows, in memory. A file over 25 MiB is turned away without being read.
 * Surfaces a `MytimeImportError` for a file that isn't a MyTime backup.
 */
export async function readMytimeDb(
  _uri: string,
  file?: Blob
): Promise<MytimeRawTables> {
  if (!file) throw new Error('MyTime import needs the picked file')
  if (file.size > MYTIME_MAX_FILE_BYTES)
    throw new MytimeImportError(
      'openFailed',
      `File is larger than ${MYTIME_MAX_FILE_BYTES} bytes.`,
      'unknown'
    )
  return readMytimeSqlite(
    new Uint8Array(await file.arrayBuffer()),
    (name) => `/${name}`
  )
}
