import * as FileSystem from 'expo-file-system/legacy'

/** The backup Settings → Backup hands to the share sheet. */
export const BACKUP_EXPORT_FILE_NAME = 'witness-work-backup.json'

/**
 * Copies the app leaves in its cache folder that can hold householder records
 * or photos: exported backups and contact files (the share sheet reads them
 * after it closes, so they can't go straight away), and the working files of
 * the photo picker and image editing (`ImagePicker/`, `ImageManipulator/`),
 * which keep the full-size original of a photo after it's been saved.
 */
const isTemporaryCopy = (name: string) =>
  name === BACKUP_EXPORT_FILE_NAME ||
  name.endsWith('.witnesswork') ||
  name === 'ImagePicker' ||
  name === 'ImageManipulator'

/**
 * Deletes those copies, so they don't outlive the records they came from. Runs
 * once per launch and with every permanent delete. Never throws.
 */
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
  } catch {
    // Nothing to clear, or the cache can't be read; the next launch retries.
  }
}
