import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import type { ExportFile } from '@/lib/files/exportFile.types'

export type { ExportFile } from '@/lib/files/exportFile.types'

export type PreparedExport = { uri: string; file: ExportFile }

export const canExportFiles = (): Promise<boolean> => Sharing.isAvailableAsync()

export async function prepareExport(file: ExportFile): Promise<PreparedExport> {
  const uri = `${FileSystem.cacheDirectory}${file.fileName}`
  if ('base64' in file)
    await FileSystem.writeAsStringAsync(uri, file.base64, {
      encoding: FileSystem.EncodingType.Base64,
    })
  else await FileSystem.writeAsStringAsync(uri, file.text)
  return { uri, file }
}

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
