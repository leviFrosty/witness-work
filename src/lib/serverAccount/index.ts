import { Platform } from 'react-native'
import { getRandomBytes } from 'expo-crypto'
import * as Device from 'expo-device'
import { MMKV } from 'react-native-mmkv'
import * as BuddiesKeychain from '../../../modules/buddies-keychain'
import * as DeviceSecrets from '../../../modules/device-secrets'
import apis from '@/constants/apis'
import { analytics } from '@/lib/analytics'
import { updateRequiredByServer } from '@/lib/appUpdate'
import { deviceAttestation } from '@/lib/attestation'
import { errorTracking } from '@/lib/errorTracking'
import { fromB64u } from '@/lib/bytes'
import { logger } from '@/lib/logger'
import { syncNow } from '@/lib/syncClock'
import {
  type BearerAccountOptions,
  fetchAccountInfo,
  type ServerAccountInfo,
} from '@/lib/serverAccount/client'
import {
  AccountSessionError,
  type AccountSessionEvent,
  createAccountSessions,
  type SessionStore,
} from '@/lib/serverAccount/session'
import {
  type CachedServerAccount,
  createServerAccount,
  type ServerAccountStorage,
} from '@/lib/serverAccount/serverAccount'

let _store: MMKV | null = null
// Device-local MMKV, like ADR 0011's account id: never in the sync payload.
const store = (): MMKV => (_store ??= new MMKV({ id: 'server-account' }))
const KEY = 'account'

const storage: ServerAccountStorage = {
  get: () => {
    const raw = store().getString(KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as CachedServerAccount
    } catch {
      return null
    }
  },
  set: (value) =>
    value ? store().set(KEY, JSON.stringify(value)) : store().delete(KEY),
}

const SESSION_SECRET = 'account-session'
// A binary without the module keeps the session for this launch only.
let memorySession: string | null = null

const STALE_SESSION_KEY = 'session-stale'

/** The platform keystore, never synced (`modules/device-secrets`). */
const sessionStore: SessionStore = {
  read: async () =>
    DeviceSecrets.isAvailable()
      ? DeviceSecrets.read(SESSION_SECRET)
      : memorySession,
  write: async (value) => {
    if (!DeviceSecrets.isAvailable()) {
      memorySession = value
      return
    }
    if (value) await DeviceSecrets.write(SESSION_SECRET, value)
    else await DeviceSecrets.remove(SESSION_SECRET)
  },
  // Outside the keystore, so a keystore that fails can't lose it too. Only a
  // hash, never a token.
  stale: {
    read: async () => store().getString(STALE_SESSION_KEY) ?? null,
    write: async (hash) =>
      hash
        ? store().set(STALE_SESSION_KEY, hash)
        : store().delete(STALE_SESSION_KEY),
  },
}

/** A session opened for this device, or its account key changed. */
export type AccountChange = 'session_opened' | 'key_changed'

const accountChangeListeners = new Set<(change: AccountChange) => void>()

/**
 * Calls `listener` whenever this device's account may have changed: a session
 * opened, or the account key was replaced or deleted. RevenueCat's link to the
 * account (`revenueCatLinkRuntime`) re-checks then. Returns an unsubscribe.
 */
export const onAccountChange = (
  listener: (change: AccountChange) => void
): (() => void) => {
  accountChangeListeners.add(listener)
  return () => accountChangeListeners.delete(listener)
}

const notifyAccountChange = (change: AccountChange) => {
  for (const listener of accountChangeListeners) {
    try {
      listener(change)
    } catch (error) {
      errorTracking.captureException(error)
    }
  }
}

/** Opens are rare (one per device every 90 days), so each is worth a look. */
function reportSessionEvent(event: AccountSessionEvent) {
  if (event.outcome !== 'ok')
    logger.debug(`[account] ${event.op}: ${event.outcome}`)
  if (event.op !== 'session/open') return
  if (event.outcome === 'ok') {
    analytics.capture('account_session_opened', { reason: event.reason })
    // A handoff's session isn't this device's until it's adopted, which
    // changes the key and notifies then.
    if (event.reason !== 'handoff') notifyAccountChange('session_opened')
    return
  }
  // Nothing to learn from a dropped connection or a cancelled call.
  if (event.outcome === 'offline' || event.outcome === 'cancelled') return
  analytics.capture('account_session_failed', {
    reason:
      event.outcome === 'attestation'
        ? `attestation_${event.attestation ?? 'failed'}`
        : event.outcome,
    server_reason: event.serverReason,
  })
}

/**
 * This device's attested account sessions (ADR 0027). Every user-scoped ww-api
 * call goes through `accountSessions.request` or `withSession`.
 */
export const accountSessions = createAccountSessions({
  baseUrl: apis.accounts,
  now: syncNow,
  randomBytes: getRandomBytes,
  attestation: deviceAttestation,
  store: sessionStore,
  accountKey: async () => {
    try {
      return fromB64u(await BuddiesKeychain.getOrCreateRootSeed())
    } catch (error) {
      logger.warn('[account] no account key', error)
      throw new AccountSessionError('unavailable', {
        serverCode: 'account_key_unavailable',
      })
    }
  },
  deviceLabel: () => {
    const model = Device.modelName ?? ''
    return {
      name: model || (Platform.OS === 'ios' ? 'iPhone' : 'Android'),
      platform: Platform.OS === 'android' ? 'android' : 'ios',
      model,
    }
  },
  onUpgradeRequired: updateRequiredByServer,
  onEvent: reportSessionEvent,
  // The keystore's own error, which never holds the token.
  onStoreFailure: (op, error) => {
    logger.warn(`[account] session ${op} failed`, error)
    errorTracking.captureException(error, { accountSession: op })
  },
})

/** Bearer ops as one account key's session. */
export const bearerOptions = (
  accountKey: Uint8Array
): BearerAccountOptions => ({
  baseUrl: apis.accounts,
  authorize: (run) => accountSessions.withSession(run, { accountKey }),
})

/** The server's record of this account key's account (`account/info`). */
export const fetchServerAccountInfo = (
  accountKey: Uint8Array
): Promise<ServerAccountInfo> => fetchAccountInfo(bearerOptions(accountKey))

/** This device's server account (ADR 0024), through its session. */
export const serverAccount = createServerAccount({
  sessions: accountSessions,
  info: fetchServerAccountInfo,
  storage,
  now: Date.now,
  onKeyChanged: () => notifyAccountChange('key_changed'),
})

/** What this device remembers about its server account, for the tools. */
export const cachedServerAccount = (): CachedServerAccount | null =>
  storage.get()
