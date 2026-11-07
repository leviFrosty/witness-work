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

export type WebCloudSyncClient = {
  listSlots: () => Promise<WebCloudSyncSlot[]>

  listSessions: () => Promise<WebCloudSyncSession[]>

  readRequestedAt: () => Promise<number | null>

  requestCloudSync: () => Promise<number>
}

export function createWebCloudSyncClient(
  accountKey: Uint8Array
): WebCloudSyncClient {
  const options = () => bearerOptions(accountKey)
  return {
    listSlots: async () => (await listSyncSlots(options())).slots,

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
