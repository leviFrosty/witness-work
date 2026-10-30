import { getRandomBytes } from 'expo-crypto'
import apis from '@/constants/apis'
import { bearerOptions } from '@/lib/serverAccount'
import { activityOptions } from '@/lib/serverAccount/accountDevices'
import { fetchAccountDevices } from '@/lib/serverAccount/activityClient'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import { syncNow } from '@/lib/syncClock'
import {
  askSyncRequest,
  fetchSyncStatus,
  listSyncSlots,
} from '@/lib/syncTransport/server/syncClient'
import type {
  WebCloudSyncSession,
  WebCloudSyncSlot,
} from '@/app/web-cloud-sync/webCloudSyncGate'

/** What the web's Cloud Sync screen reads and asks, as the signed-in account. */
export type WebCloudSyncClient = {
  /** The account's slots (`sync/list`), with who last wrote each. */
  listSlots: () => Promise<WebCloudSyncSlot[]>
  /** The account's signed-in sessions (the devices list). */
  listSessions: () => Promise<WebCloudSyncSession[]>
  /** The standing request's time, or null (`GET /accounts/v1/sync`). */
  readRequestedAt: () => Promise<number | null>
  /**
   * Asks the account's phones (`POST /accounts/v1/sync/request`, Bearer and the
   * account key's envelope); the request's time.
   */
  requestCloudSync: () => Promise<number>
}

/**
 * The client for one account key's session: every call goes through the
 * attested session in `serverAccount`, as Bearer; asking is signed by the
 * account key too, as `backup/delete` is.
 */
export function createWebCloudSyncClient(
  accountKey: Uint8Array
): WebCloudSyncClient {
  const options = () => bearerOptions(accountKey)
  return {
    listSlots: async () => (await listSyncSlots(options())).slots,
    // The list as it is: a browser's own session may be missing from it,
    // which is no reason to sign in again (`readAccountDevices` would).
    listSessions: async () =>
      (await fetchAccountDevices(activityOptions(accountKey)())).map(
        ({ platform, appVersion }) => ({ platform, appVersion })
      ),
    readRequestedAt: async () => (await fetchSyncStatus(options())).requestedAt,
    requestCloudSync: () =>
      askSyncRequest({
        ...options(),
        sign: {
          baseUrl: apis.accounts,
          key: deriveAccountSigningKey(accountKey),
          now: syncNow,
          randomBytes: getRandomBytes,
        },
      }),
  }
}
