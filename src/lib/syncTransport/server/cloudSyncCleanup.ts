import { logger } from '@/lib/logger'
import { CLOUD_ACCOUNT_CHANGE_RESET } from '@/lib/iCloudIdentity'
import { bearerOptions } from '@/lib/serverAccount'
import { deleteSyncSlot } from '@/lib/syncTransport/server/syncClient'
import { usesCloudSync } from '@/lib/syncTransport/provider'
import { usePreferences } from '@/stores/preferences'

const WAIT_MS = 5_000

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
