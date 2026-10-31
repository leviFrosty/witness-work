import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import type { ExportFile } from '@/lib/files/exportFile.types'

export type { ExportFile } from '@/lib/files/exportFile.types'

/** A file written and ready to hand to the User. */
export type PreparedExport = { uri: string; file: ExportFile }

/** Whether this device can hand the User a file. */
export const canExportFiles = (): Promise<boolean> => Sharing.isAvailableAsync()

/**
 * Writes `file` to the cache folder. The share sheet reads it by reference
 * after it opens, so it can't be deleted right away (`deleteTemporaryCopies`
 * clears the folder's copies on launch).
 */
export async function prepareExport(file: ExportFile): Promise<PreparedExport> {
  const uri = `${FileSystem.cacheDirectory}${file.fileName}`
  if ('base64' in file)
    await FileSystem.writeAsStringAsync(uri, file.base64, {
      encoding: FileSystem.EncodingType.Base64,
    })
  else await FileSystem.writeAsStringAsync(uri, file.text)
  return { uri, file }
}

/**
 * Opens the share sheet for a prepared file. Resolves on sharing and on
 * cancelling alike, so it's not proof the User kept the file.
 */
export async function deliverExport({
  uri,
  file,
}: PreparedExport): Promise<void> {
  await Sharing.shareAsync(uri, {
    mimeType: file.mimeType,
    ...(file.uti ? { UTI: file.uti } : {}),
    ...(file.dialogTitle ? { dialogTitle: file.dialogTitle } : {}),
  })
}
