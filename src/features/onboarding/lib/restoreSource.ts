import { hasRemoteBackup } from '@/app/sync/iCloudSync'
import { hasAccountKey } from '@/lib/serverAccount'

/**
 * How long the iCloud listing may take to become trustworthy. The check starts
 * on the welcome and is needed only once the tour ends, so it can wait longer
 * than the restore step's own read.
 */
const SCAN_TIMEOUT_MS = 15_000

/**
 * Whether this device already sees something to restore, without asking the
 * user for anything: an account key that iCloud Keychain or Block Store brought
 * back from another install (ADR 0026), or another device's sync file in
 * iCloud. Google Drive needs the user to connect it first, so on Android only
 * the key counts. A check that fails counts as nothing found.
 */
export async function detectRestoreSource(): Promise<boolean> {
  const [key, cloud] = await Promise.all([
    hasAccountKey().catch(() => false),
    hasRemoteBackup(SCAN_TIMEOUT_MS).catch(() => false),
  ])
  return key || cloud
}
