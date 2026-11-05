import { Platform } from 'react-native'
import * as Application from 'expo-application'
import { getRandomBytes } from 'expo-crypto'
import * as Device from 'expo-device'
import { MMKV } from 'react-native-mmkv'
import * as BuddiesKeychain from '../../../modules/buddies-keychain'
import * as DeviceSecrets from '../../../modules/device-secrets'
import apis from '@/constants/apis'
import { deviceAccountKey } from '@/lib/accountKey'
import { analytics } from '@/lib/analytics'
import {
  appVersion,
  updateRequiredByServer,
  useUpdateRequired,
} from '@/lib/appUpdate'
import { deviceAttestation } from '@/lib/attestation'
import { errorTracking } from '@/lib/errorTracking'
import { fromB64u, toB64u } from '@/lib/bytes'
import { logger } from '@/lib/logger'
import { syncNow } from '@/lib/syncClock'
import {
  type AccountStatus,
  type BearerAccountOptions,
  fetchAccountInfo,
  type ServerAccountInfo,
} from '@/lib/serverAccount/client'
import type { DeviceLabel } from '@/lib/serverAccount/deviceLabel'
import {
  AccountSessionError,
  type AccountSessionEvent,
  createAccountSessions,
  SESSION_RENEW_WINDOW_MS,
  sessionAccountForKey,
  type SessionOpenReason,
  type SessionStore,
} from '@/lib/serverAccount/session'
import {
  type CachedServerAccount,
  createServerAccount,
  type ServerAccountStorage,
} from '@/lib/serverAccount/serverAccount'
import type { WebAccount } from '@/lib/serverAccount/webAccount'
import { webRuntime } from '@/lib/serverAccount/webRuntime'
import { fetchKeyHistory } from '@/lib/serverAccount/keyChangeClient'
import {
  historyKeys,
  historyPhotoKeys,
  type KeyHistoryKind,
} from '@/lib/serverAccount/keyHistory'
import { createKeyHistoryCache } from '@/lib/serverAccount/keyHistoryCache'
import {
  createInstallCheck,
  type InstallCheck,
} from '@/lib/serverAccount/installToken'
import {
  createKeyRetiredHub,
  type KeyRetiredListener,
} from '@/lib/serverAccount/keyRetiredHub'

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

const isWeb = Platform.OS === 'web'

/** A session opened for this device, or its account key changed. */
export type AccountChange = 'session_opened' | 'key_changed'

/**
 * How a `session_opened` opened: `new` when this device had none for the key,
 * `renewed` when it replaced this device's live session near its end.
 */
export type AccountChangeDetail = { reason?: SessionOpenReason }

type AccountChangeListener = (
  change: AccountChange,
  detail: AccountChangeDetail
) => void

const accountChangeListeners = new Set<AccountChangeListener>()

/**
 * Calls `listener` whenever this device's account may have changed: a session
 * opened, or the account key was replaced or deleted. RevenueCat's link to the
 * account (`revenueCatLinkRuntime`) re-checks then. Returns an unsubscribe.
 */
export const onAccountChange = (
  listener: AccountChangeListener
): (() => void) => {
  accountChangeListeners.add(listener)
  return () => accountChangeListeners.delete(listener)
}

const notifyAccountChange = (
  change: AccountChange,
  detail: AccountChangeDetail = {}
) => {
  for (const listener of accountChangeListeners) {
    try {
      listener(change, detail)
    } catch (error) {
      errorTracking.captureException(error)
    }
  }
}

const THIS_DEVICE_SESSIONS_KEY = 'this-device-sessions'
/**
 * Session ids kept: about one a sign-in, so years of them. Not secret; the
 * server's activity log names them too.
 */
export const THIS_DEVICE_SESSIONS_MAX = 20

/** The sessions this install has had, newest last. */
function thisDeviceSessions(): string[] {
  const raw = store().getString(THIS_DEVICE_SESSIONS_KEY)
  if (!raw) return []
  try {
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === 'string')
      : []
  } catch {
    return []
  }
}

/** Sessions remembered since launch: this phone's, whatever MMKV says. */
const rememberedThisLaunch: string[] = []

function rememberThisDeviceSession(sessionId: string) {
  if (!rememberedThisLaunch.includes(sessionId))
    rememberedThisLaunch.push(sessionId)
  const ids = thisDeviceSessions()
  if (ids.at(-1) === sessionId) return
  const next = [...ids.filter((id) => id !== sessionId), sessionId].slice(
    -THIS_DEVICE_SESSIONS_MAX
  )
  store().set(THIS_DEVICE_SESSIONS_KEY, JSON.stringify(next))
}

const INSTALL_TOKEN = 'install-token'

const install = createInstallCheck({
  readLocal: () => store().getString(INSTALL_TOKEN) ?? null,
  writeLocal: (token) => store().set(INSTALL_TOKEN, token),
  readKeystore: () => DeviceSecrets.read(INSTALL_TOKEN),
  writeKeystore: (token) => DeviceSecrets.write(INSTALL_TOKEN, token),
  newToken: () => toB64u(getRandomBytes(16)),
  onError: (error) => errorTracking.captureException(error),
})

// The copy's "this device" sessions are the old phone's: forget them, keeping
// any this launch opened.
install.onMoved(() => {
  logger.warn('[account] device-local data came from another phone')
  store().set(
    THIS_DEVICE_SESSIONS_KEY,
    JSON.stringify(rememberedThisLaunch.slice(-THIS_DEVICE_SESSIONS_MAX))
  )
})

/**
 * Checks once a launch that this device-local MMKV is this phone's own, not a
 * copy a device backup brought from another phone (`installToken.ts`), and
 * answers the same for the rest of the launch. Check it before trusting
 * anything per-device in MMKV. What a move clears is cleared once, through
 * `onInstallMoved`. `unknown` (no keystore module, as on the web, or it
 * couldn't be read) changes nothing and is checked again next time.
 */
export function checkInstall(): Promise<InstallCheck> {
  if (isWeb || !DeviceSecrets.isAvailable()) return Promise.resolve('unknown')
  return install.check()
}

/**
 * Calls `listener` once if this launch finds its MMKV came from another phone,
 * at the move or at once when that was already found, so a feature drops its
 * own per-device state exactly once. Returns an unsubscribe.
 */
export const onInstallMoved = (listener: () => void): (() => void) =>
  install.onMoved(listener)

/**
 * Whether a session was this install's, now or before it signed in again
 * (signed out, or a session that ended): Account Activity calls it "this
 * device".
 */
export const isThisDeviceSession = (sessionId: string): boolean =>
  accountSessions.snapshot()?.sessionId === sessionId ||
  thisDeviceSessions().includes(sessionId)

const statusListeners = new Set<(status: AccountStatus) => void>()

/**
 * Calls `listener` when a call shows this device's account has a new status:
 * refused as suspended, or read again after it worked while suspended. Returns
 * an unsubscribe.
 */
export const onAccountStatus = (
  listener: (status: AccountStatus) => void
): (() => void) => {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}

/**
 * A suspended account's calls that work read it again at most this often; one
 * that works sooner reads it once the time is up.
 */
export const STATUS_RECHECK_MS = 60_000
let statusRecheckedAt = -Infinity
let statusRecheck: ReturnType<typeof setTimeout> | null = null

function recheckStatus(key: Uint8Array) {
  if (statusRecheck) return
  const wait = statusRecheckedAt + STATUS_RECHECK_MS - Date.now()
  statusRecheck = setTimeout(
    () => {
      statusRecheck = null
      statusRecheckedAt = Date.now()
      void serverAccount.check(key).catch(() => undefined)
    },
    Math.max(0, wait)
  )
}

/**
 * Opens are rare (one per device every 90 days, renewed or not), so each is
 * worth a look.
 */
function reportSessionEvent(event: AccountSessionEvent) {
  if (event.outcome !== 'ok')
    logger.debug(`[account] ${event.op}: ${event.outcome}`)
  if (event.op !== 'session/open') return
  if (event.outcome === 'ok') {
    analytics.capture('account_session_opened', { reason: event.reason })
    // A handoff's session isn't this device's until it's adopted, which
    // changes the key and notifies then.
    if (event.reason !== 'handoff')
      notifyAccountChange('session_opened', { reason: event.reason })
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
    // A failed renewal keeps its session; it isn't a device left signed out.
    ...(event.reason === 'renewed' && { source: 'renewal' }),
  })
}

/** What a session or a new passkey says this device is, sealed. */
export function thisDeviceLabel(): DeviceLabel {
  if (webRuntime) return webRuntime.deviceLabel()
  const model = Device.modelName ?? ''
  return {
    name: model || (Platform.OS === 'ios' ? 'iPhone' : 'Android'),
    platform: Platform.OS === 'android' ? 'android' : 'ios',
    model,
  }
}

const keySwitchedListeners = new Set<() => void>()

/**
 * Calls `listener` when the account key changed under this device's session
 * (iCloud Keychain brought another device's key). Returns an unsubscribe.
 */
export const onAccountKeySwitched = (listener: () => void): (() => void) => {
  keySwitchedListeners.add(listener)
  return () => keySwitchedListeners.delete(listener)
}

const keyRetiredHub = createKeyRetiredHub((error) =>
  errorTracking.captureException(error)
)

/**
 * Calls `listener` when a session open is refused as `key_retired`, or a
 * browser signed out finds its key retired: the account key changed on another
 * device (`app/account/keyChange` handles it). A browser waits for what it
 * returns. One that heard of it at launch, before anything listened, keeps it
 * for the first listener: `start()` goes on meanwhile, and deletes its note
 * once that listener has handled it. Returns an unsubscribe.
 */
export const onKeyRetired = (listener: KeyRetiredListener): (() => void) =>
  keyRetiredHub.subscribe(listener)

/** Development builds only: a longer renew window, to see a renewal now. */
let devRenewWindowMs: number | null = null

/**
 * Development builds only (the dev harness): renews a session once it has `ms`
 * left instead of 30 days, so the next refresh renews any session; null goes
 * back to 30 days. Does nothing in release builds.
 */
export function setDevSessionRenewWindow(ms: number | null) {
  if (__DEV__) devRenewWindowMs = ms
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
  store: webRuntime?.sessionStore ?? sessionStore,
  accountKey: async () => {
    try {
      return fromB64u(await deviceAccountKey.getOrCreate())
    } catch (error) {
      logger.warn('[account] no account key', error)
      throw new AccountSessionError('unavailable', {
        serverCode: 'account_key_unavailable',
      })
    }
  },
  deviceLabel: thisDeviceLabel,
  renewWindowMs: () => devRenewWindowMs ?? SESSION_RENEW_WINDOW_MS,
  // Devices shows it; `major.minor.patch` only.
  appVersion: () =>
    isWeb ? appVersion() : Application.nativeApplicationVersion,
  onUpgradeRequired: updateRequiredByServer,
  // Sync, backup, Buddies and Notes Import all wait for the update.
  paused: () => useUpdateRequired.getState().required !== null,
  onEvent: reportSessionEvent,
  // The keystore's own error, which never holds the token.
  onStoreFailure: (op, error) => {
    logger.warn(`[account] session ${op} failed`, error)
    errorTracking.captureException(error, { accountSession: op })
  },
  onThisDeviceSession: rememberThisDeviceSession,
  onStatusChange: (accountPub, status) => {
    serverAccount.noteStatus(accountPub, status)
    for (const listener of statusListeners) {
      try {
        listener(status)
      } catch (error) {
        errorTracking.captureException(error)
      }
    }
  },
  // Reinstated, maybe: the account's own record says.
  onSucceededWhileSuspended: recheckStatus,
  ...(webRuntime && { web: webRuntime.sessionDeps }),
  onKeySwitched: () => {
    for (const listener of keySwitchedListeners) {
      try {
        listener()
      } catch (error) {
        errorTracking.captureException(error)
      }
    }
  },
  onKeyRetired: (accountPub, changedAt) => {
    void keyRetiredHub.emit(accountPub, changedAt, { held: false })
  },
})

/**
 * This browser's account: signing in with a ticket, sign-up's session, signing
 * out, and the server ending the session (`webAccount.ts`). Null on phones.
 */
export const webAccount: WebAccount | null =
  webRuntime?.bind(accountSessions, {
    // Ended by a key change on another device (`key_changed`): the retired
    // key goes, the stores stay (ADR 0039).
    // The browser forgot the key itself first: it held it.
    onKeyRetired: (accountPub, changedAt) =>
      keyRetiredHub.emit(accountPub, changedAt, { held: true }),
    onSignedIn: (accountKey) => {
      // Remembers the account, as a phone's sign-in does.
      void serverAccount.connect(accountKey).catch(() => undefined)
      notifyAccountChange('session_opened')
    },
  }) ?? null

/**
 * This device's session's account, without opening one: null without a session,
 * or when the stored session is another key's (the key was replaced elsewhere,
 * and no call has opened the new key's session yet). While the key can't be
 * read (a locked Keychain), the session's.
 *
 * `reopenStale` opens the new key's session in that last case, as any call on
 * it would (ADR 0039 §7: a key changed on another device signs this one out,
 * and iCloud Keychain brings the new key); null when that fails.
 */
export async function currentSessionAccount(
  options: { reopenStale?: boolean } = {}
): Promise<string | null> {
  await accountSessions.ready()
  const session = accountSessions.snapshot()
  if (!session || !BuddiesKeychain.isAvailable())
    return session?.accountId ?? null
  let seed: string | null
  try {
    // As every feature reads it: a committed change's new key, never a
    // retired one (ADR 0039 §4). A confirmed change found at launch holds this
    // read until it resolves (`holdAccountKeyUntil`), so reconcile and
    // Supporter status wait for it too.
    seed = await deviceAccountKey.peek()
  } catch {
    // The key or the change record can't be read: the session's account,
    // which is right either way, since a key change keeps the account id.
    return session.accountId
  }
  const accountId = sessionAccountForKey(session, seed ? fromB64u(seed) : null)
  if (accountId || !seed || !options.reopenStale) return accountId
  try {
    return (await accountSessions.ensure()).accountId
  } catch {
    return null
  }
}

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

const LAST_ACCOUNT_KEY = 'last-account-id'

/** This device's server account (ADR 0024), through its session. */
export const serverAccount = createServerAccount({
  sessions: accountSessions,
  info: fetchServerAccountInfo,
  storage,
  // Kept through sign-outs and key changes, for rejoining the same account.
  lastAccount: {
    get: () => store().getString(LAST_ACCOUNT_KEY) ?? null,
    set: (accountId) => store().set(LAST_ACCOUNT_KEY, accountId),
  },
  now: Date.now,
  onKeyChanged: () => notifyAccountChange('key_changed'),
})

/** What this device remembers about its server account, for the tools. */
export const cachedServerAccount = (): CachedServerAccount | null =>
  storage.get()

/**
 * Whether this device already has the account key (iCloud Keychain brings it to
 * the User's other Apple devices; a handoff or recovery key to any phone).
 * Never creates one.
 */
export const hasAccountKey = async (): Promise<boolean> =>
  (await deviceAccountKey.peek().catch(() => null)) != null

/**
 * Whether this device's account is suspended, so a feature can say so before
 * the User starts: false without a session. A suspension noted earlier is
 * checked with the server first, since the account may have been reinstated;
 * when that can't be read, the note stands. Never opens a session or creates an
 * account key.
 */
export async function accountSuspended(): Promise<boolean> {
  await accountSessions.ready()
  if (accountSessions.snapshot()?.status !== 'suspended') return false
  const seed = await deviceAccountKey.peek().catch(() => null)
  if (seed) await serverAccount.check(fromB64u(seed))
  return accountSessions.snapshot()?.status === 'suspended'
}

const KEY_HISTORY_SECRET = 'account-key-history'
// A binary without the module keeps it for this launch only.
let memoryKeyHistory: string | null = null

/**
 * The account's key history, opened and kept on this device (derived keys, so
 * in the platform keystore, never synced): what older account keys sealed still
 * opens after a key change (docs/account-key-change.md).
 */
export const keyHistoryCache = createKeyHistoryCache({
  store: {
    read: async () =>
      DeviceSecrets.isAvailable()
        ? DeviceSecrets.read(KEY_HISTORY_SECRET)
        : memoryKeyHistory,
    write: async (value) => {
      if (!DeviceSecrets.isAvailable()) {
        memoryKeyHistory = value
        return
      }
      if (value) await DeviceSecrets.write(KEY_HISTORY_SECRET, value)
      else await DeviceSecrets.remove(KEY_HISTORY_SECRET)
    },
  },
  fetchHistory: (accountKey) => fetchKeyHistory(bearerOptions(accountKey)),
})

/**
 * One kind of key from the account's older account keys, newest first: none
 * when its key never changed, or before this device read its history.
 */
export const olderAccountKeys = async (
  accountId: string,
  kind: KeyHistoryKind
): Promise<Uint8Array[]> =>
  historyKeys(await keyHistoryCache.read(accountId).catch(() => null), kind)

/**
 * Cloud Sync photo keys from the account's older account keys, newest first: a
 * photo whose name under the current name key isn't on the server is looked up
 * under each `name` key and opened with its `photo` key.
 */
export const olderPhotoKeys = async (
  accountId: string
): Promise<{ name: Uint8Array; photo: Uint8Array }[]> =>
  historyPhotoKeys(await keyHistoryCache.read(accountId).catch(() => null))
