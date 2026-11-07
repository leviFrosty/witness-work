import type { MytimeRawTables } from '@/features/mytime-import/lib/mytimeSchema'
import {
  MYTIME_MAX_FILE_BYTES,
  readMytimeSqlite,
} from '@/features/mytime-import/lib/readMytimeSqlite'
import { MytimeImportError } from '@/features/mytime-import/lib/readMytimeTables'

export * from '@/features/mytime-import/lib/readMytimeTables'

export const canReadMytimeDb = true

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
