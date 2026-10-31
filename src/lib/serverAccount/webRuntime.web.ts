import { getRandomBytes } from 'expo-crypto'
import apis from '@/constants/apis'
import { webAccountKey } from '@/lib/accountKey/webAccountKey'
import { analytics } from '@/lib/analytics'
import { appVersion } from '@/lib/appUpdate'
import { fromUtf8, utf8 } from '@/lib/bytes'
import { syncNow } from '@/lib/syncClock'
import { sealDeviceLabel } from '@/lib/serverAccount/deviceLabel'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import type { SessionStore } from '@/lib/serverAccount/session'
import {
  closeSession,
  sendWebSessionOpen,
} from '@/lib/serverAccount/sessionClient'
import {
  createWebAccount,
  type WebAccount,
} from '@/lib/serverAccount/webAccount'
import { webDeviceLabel } from '@/lib/serverAccount/webDeviceLabel'
import type { WebRuntime } from '@/lib/serverAccount/webRuntime'
import { reloadPage, sessionTabs } from '@/lib/serverAccount/webTabs'
import {
  clearAllWebData,
  DATA_OWNER_KEY,
  markWipePending,
  webStorageBoot,
} from '@/lib/webStorage/boot'
import { sealedSecrets } from '@/lib/webStorage/sealedSecrets'
import { secureKv } from '@/lib/webStorage/secureKv'

const SESSION_SECRET = 'session'
const STALE_SESSION_KEY = 'session-stale'
const REFRESH_IN_FLIGHT_KEY = 'session-refresh-in-flight'

/** A plain `secureKv` entry: a hash or an id, never a secret. */
const kvEntry = <T>(key: string) => ({
  read: async () => (await secureKv.get<T>(key)) ?? null,
  write: (value: T | null) =>
    value === null ? secureKv.delete(key) : secureKv.set(key, value),
})

/**
 * A browser's session record, sealed in IndexedDB under the same
 * non-extractable key as the account key (docs/passkeys-protocol.md, "On the
 * web"). The access token stays in memory.
 */
const sessionStore: SessionStore = {
  read: async () => {
    const sealed = await sealedSecrets.read(SESSION_SECRET)
    return sealed ? fromUtf8(sealed) : null
  },
  write: (value) =>
    sealedSecrets.write(SESSION_SECRET, value === null ? null : utf8(value)),
  stale: kvEntry<string>(STALE_SESSION_KEY),
}

let account: WebAccount | null = null

export const webRuntime: WebRuntime | null = {
  sessionStore,
  // A browser opens sessions only from a sign-in, and shares them with its
  // other tabs.
  sessionDeps: {
    exclusive: sessionTabs.exclusive,
    publish: sessionTabs.publish,
    onEnded: (reason, from) => account?.ended(reason, from),
    inFlight: kvEntry<string>(REFRESH_IN_FLIGHT_KEY),
  },
  deviceLabel: () => webDeviceLabel(),
  accountKey: webAccountKey,
  bind: (sessions) =>
    (account ??= createWebAccount({
      sessions,
      accountKey: webAccountKey,
      tabs: sessionTabs,
      owner: kvEntry<string>(DATA_OWNER_KEY),
      hasLocalData: webStorageBoot.hasLocalData,
      open: (ticket, accountKey, signed) => {
        const key = deriveAccountSigningKey(accountKey)
        let device: string | undefined
        try {
          device = sealDeviceLabel(
            accountKey,
            key.publicKey,
            webDeviceLabel(),
            getRandomBytes(12)
          )
        } catch {
          // A label is optional; never fail a sign-in over it.
        }
        return sendWebSessionOpen(
          { ticket, device, appVersion: appVersion() ?? undefined },
          {
            baseUrl: apis.accounts,
            key,
            now: syncNow,
            randomBytes: getRandomBytes,
          },
          signed
        )
      },
      closeOpened: (accessToken) =>
        closeSession(accessToken, { baseUrl: apis.accounts }),
      markWipePending,
      wipe: clearAllWebData,
      reload: reloadPage,
      onEnded: (reason, outcome) =>
        analytics.capture('web_session_ended', { reason, outcome }),
    })),
}
