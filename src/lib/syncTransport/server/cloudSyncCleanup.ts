import { logger } from '@/lib/logger'
import { CLOUD_ACCOUNT_CHANGE_RESET } from '@/lib/iCloudIdentity'
import { bearerOptions } from '@/lib/serverAccount'
import { deleteSyncSlot } from '@/lib/syncTransport/server/syncClient'
import { usesCloudSync } from '@/lib/syncTransport/provider'
import { usePreferences } from '@/stores/preferences'

/** Longest the cleanup waits on the server, so it never blocks the User. */
const WAIT_MS = 5_000

/**
 * Delete Buddies on the account's last device deletes the account key, so it
 * first deletes every Cloud Sync slot of the account (ADR 0030 §5), as it does
 * backups. Best effort: a slot left behind is deleted by the server's
 * retention, 30 days after its device's session ends. A device on Cloud Sync
 * then decides again under the next key's account, as one that never chose.
 */
export async function deleteCloudSyncBeforeKeyLoss(
  accountKey: Uint8Array
): Promise<void> {
  try {
    await Promise.race([
      deleteSyncSlot(bearerOptions(accountKey)),
      new Promise((resolve) => setTimeout(resolve, WAIT_MS)),
    ])
  } catch (error) {
    logger.warn('[cloudSync] deleting the account’s slots failed', error)
  }
  if (usesCloudSync())
    usePreferences.setState({
      ...CLOUD_ACCOUNT_CHANGE_RESET,
      cloudSyncAccountToken: null,
    })
}
