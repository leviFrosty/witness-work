import { Platform } from 'react-native'
import * as Application from 'expo-application'
import { getRandomBytes } from 'expo-crypto'
import * as Device from 'expo-device'
import { MMKV } from 'react-native-mmkv'
import { withBackgroundTime } from '../../../modules/background-time'
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

let memorySession: string | null = null

const STALE_SESSION_KEY = 'session-stale'

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

  stale: {
    read: async () => store().getString(STALE_SESSION_KEY) ?? null,
    write: async (hash) =>
      hash
        ? store().set(STALE_SESSION_KEY, hash)
        : store().delete(STALE_SESSION_KEY),
  },
}

const isWeb = Platform.OS === 'web'

export type AccountChange = 'session_opened' | 'key_changed'

export type AccountChangeDetail = { reason?: SessionOpenReason }

type AccountChangeListener = (
  change: AccountChange,
  detail: AccountChangeDetail
) => void

const accountChangeListeners = new Set<AccountChangeListener>()

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

export const THIS_DEVICE_SESSIONS_MAX = 20

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

install.onMoved(() => {
  logger.warn('[account] device-local data came from another phone')
  store().set(
    THIS_DEVICE_SESSIONS_KEY,
    JSON.stringify(rememberedThisLaunch.slice(-THIS_DEVICE_SESSIONS_MAX))
  )
})

export function checkInstall(): Promise<InstallCheck> {
  if (isWeb || !DeviceSecrets.isAvailable()) return Promise.resolve('unknown')
  return install.check()
}

export const onInstallMoved = (listener: () => void): (() => void) =>
  install.onMoved(listener)

export const isThisDeviceSession = (sessionId: string): boolean =>
  accountSessions.snapshot()?.sessionId === sessionId ||
  thisDeviceSessions().includes(sessionId)

const statusListeners = new Set<(status: AccountStatus) => void>()

export const onAccountStatus = (
  listener: (status: AccountStatus) => void
): (() => void) => {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}

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

function reportSessionEvent(event: AccountSessionEvent) {
  if (event.outcome !== 'ok')
    logger.debug(`[account] ${event.op}: ${event.outcome}`)
  if (event.op !== 'session/open') return
  if (event.outcome === 'ok') {
    analytics.capture('account_session_opened', { reason: event.reason })

    if (event.reason !== 'handoff')
      notifyAccountChange('session_opened', { reason: event.reason })
    return
  }

  if (event.outcome === 'offline' || event.outcome === 'cancelled') return
  analytics.capture('account_session_failed', {
    reason:
      event.outcome === 'attestation'
        ? `attestation_${event.attestation ?? 'failed'}`
        : event.outcome,
    server_reason: event.serverReason,

    ...(event.reason === 'renewed' && { source: 'renewal' }),
  })
}

export function thisDeviceLabel(): DeviceLabel {
  if (webRuntime) return webRuntime.deviceLabel()
  const model = Device.modelName ?? ''

  const shown = Platform.OS === 'android' ? Device.deviceName?.trim() : ''
  return {
    name: shown || model || (Platform.OS === 'ios' ? 'iPhone' : 'Android'),
    platform: Platform.OS === 'android' ? 'android' : 'ios',
    model,
  }
}

const keySwitchedListeners = new Set<() => void>()

export const onAccountKeySwitched = (listener: () => void): (() => void) => {
  keySwitchedListeners.add(listener)
  return () => keySwitchedListeners.delete(listener)
}

const keyRetiredHub = createKeyRetiredHub((error) =>
  errorTracking.captureException(error)
)

export const onKeyRetired = (listener: KeyRetiredListener): (() => void) =>
  keyRetiredHub.subscribe(listener)

let devRenewWindowMs: number | null = null

export function setDevSessionRenewWindow(ms: number | null) {
  if (__DEV__) devRenewWindowMs = ms
}

export const accountSessions = createAccountSessions({
  baseUrl: apis.accounts,
  now: syncNow,

  backgroundTime: (run) => withBackgroundTime('AccountSession', run),
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

  appVersion: () =>
    isWeb ? appVersion() : Application.nativeApplicationVersion,
  onUpgradeRequired: updateRequiredByServer,

  paused: () => useUpdateRequired.getState().required !== null,
  onEvent: reportSessionEvent,

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

export const webAccount: WebAccount | null =
  webRuntime?.bind(accountSessions, {
    onKeyRetired: (accountPub, changedAt) =>
      keyRetiredHub.emit(accountPub, changedAt, { held: true }),
    onSignedIn: (accountKey) => {
      void serverAccount.connect(accountKey).catch(() => undefined)
      notifyAccountChange('session_opened')
    },
  }) ?? null

export async function currentSessionAccount(
  options: { reopenStale?: boolean } = {}
): Promise<string | null> {
  await accountSessions.ready()
  const session = accountSessions.snapshot()
  if (!session || !BuddiesKeychain.isAvailable())
    return session?.accountId ?? null
  let seed: string | null
  try {
    seed = await deviceAccountKey.peek()
  } catch {
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

export const bearerOptions = (
  accountKey: Uint8Array
): BearerAccountOptions => ({
  baseUrl: apis.accounts,
  authorize: (run) => accountSessions.withSession(run, { accountKey }),
})

export const fetchServerAccountInfo = (
  accountKey: Uint8Array
): Promise<ServerAccountInfo> => fetchAccountInfo(bearerOptions(accountKey))

const LAST_ACCOUNT_KEY = 'last-account-id'

export const serverAccount = createServerAccount({
  sessions: accountSessions,
  info: fetchServerAccountInfo,
  storage,

  lastAccount: {
    get: () => store().getString(LAST_ACCOUNT_KEY) ?? null,
    set: (accountId) => store().set(LAST_ACCOUNT_KEY, accountId),
  },
  now: Date.now,
  onKeyChanged: () => notifyAccountChange('key_changed'),
})

export const cachedServerAccount = (): CachedServerAccount | null =>
  storage.get()

export async function peekAccountKey(): Promise<Uint8Array | null> {
  const seed = await deviceAccountKey.peek().catch(() => null)
  return seed ? fromB64u(seed) : null
}

export const hasAccountKey = async (): Promise<boolean> =>
  (await deviceAccountKey.peek().catch(() => null)) != null

export async function accountSuspended(): Promise<boolean> {
  await accountSessions.ready()
  if (accountSessions.snapshot()?.status !== 'suspended') return false
  const seed = await deviceAccountKey.peek().catch(() => null)
  if (seed) await serverAccount.check(fromB64u(seed))
  return accountSessions.snapshot()?.status === 'suspended'
}

const KEY_HISTORY_SECRET = 'account-key-history'

let memoryKeyHistory: string | null = null

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

export const olderAccountKeys = async (
  accountId: string,
  kind: KeyHistoryKind
): Promise<Uint8Array[]> =>
  historyKeys(await keyHistoryCache.read(accountId).catch(() => null), kind)

export const olderPhotoKeys = async (
  accountId: string
): Promise<{ name: Uint8Array; photo: Uint8Array }[]> =>
  historyPhotoKeys(await keyHistoryCache.read(accountId).catch(() => null))
