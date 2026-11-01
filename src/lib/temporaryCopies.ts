import * as FileSystem from 'expo-file-system/legacy'

export const BACKUP_EXPORT_FILE_NAME = 'witness-work-backup.json'

const isTemporaryCopy = (name: string) =>
  name === BACKUP_EXPORT_FILE_NAME ||
  name.endsWith('.witnesswork') ||
  name === 'ImagePicker' ||
  name === 'ImageManipulator'

export async function deleteTemporaryCopies(): Promise<void> {
  try {
    const cache = FileSystem.cacheDirectory
    if (!cache) return
    const names = await FileSystem.readDirectoryAsync(cache)
    await Promise.all(
      names
        .filter(isTemporaryCopy)
        .map((name) =>
          FileSystem.deleteAsync(`${cache}${name}`, { idempotent: true }).catch(
            () => {}
          )
        )
    )
  } catch {}
}
