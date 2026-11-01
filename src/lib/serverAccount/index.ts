import { Platform } from 'react-native'
import { getRandomBytes } from 'expo-crypto'
import * as Device from 'expo-device'
import { MMKV } from 'react-native-mmkv'
import * as BuddiesKeychain from '../../../modules/buddies-keychain'
import * as DeviceSecrets from '../../../modules/device-secrets'
import apis from '@/constants/apis'
import { analytics } from '@/lib/analytics'
import { updateRequiredByServer, useUpdateRequired } from '@/lib/appUpdate'
import { deviceAttestation } from '@/lib/attestation'
import { errorTracking } from '@/lib/errorTracking'
import { fromB64u } from '@/lib/bytes'
import { logger } from '@/lib/logger'
import { syncNow } from '@/lib/syncClock'
import {
  type AccountStatus,
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

export type AccountChange = 'session_opened' | 'key_changed'

const accountChangeListeners = new Set<(change: AccountChange) => void>()

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

function rememberThisDeviceSession(sessionId: string) {
  const ids = thisDeviceSessions()
  if (ids.at(-1) === sessionId) return
  const next = [...ids.filter((id) => id !== sessionId), sessionId].slice(
    -THIS_DEVICE_SESSIONS_MAX
  )
  store().set(THIS_DEVICE_SESSIONS_KEY, JSON.stringify(next))
}

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

    if (event.reason !== 'handoff') notifyAccountChange('session_opened')
    return
  }

  if (event.outcome === 'offline' || event.outcome === 'cancelled') return
  analytics.capture('account_session_failed', {
    reason:
      event.outcome === 'attestation'
        ? `attestation_${event.attestation ?? 'failed'}`
        : event.outcome,
    server_reason: event.serverReason,
  })
}

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
})

export const bearerOptions = (
  accountKey: Uint8Array
): BearerAccountOptions => ({
  baseUrl: apis.accounts,
  authorize: (run) => accountSessions.withSession(run, { accountKey }),
})

export const fetchServerAccountInfo = (
  accountKey: Uint8Array
): Promise<ServerAccountInfo> => fetchAccountInfo(bearerOptions(accountKey))

export const serverAccount = createServerAccount({
  sessions: accountSessions,
  info: fetchServerAccountInfo,
  storage,
  now: Date.now,
  onKeyChanged: () => notifyAccountChange('key_changed'),
})

export const cachedServerAccount = (): CachedServerAccount | null =>
  storage.get()

export async function peekAccountKey(): Promise<Uint8Array | null> {
  const seed = await BuddiesKeychain.peekRootSeed().catch(() => null)
  return seed ? fromB64u(seed) : null
}

export const hasAccountKey = async (): Promise<boolean> =>
  (await BuddiesKeychain.peekRootSeed().catch(() => null)) != null

export async function accountSuspended(): Promise<boolean> {
  await accountSessions.ready()
  if (accountSessions.snapshot()?.status !== 'suspended') return false
  const seed = await BuddiesKeychain.peekRootSeed().catch(() => null)
  if (seed) await serverAccount.check(fromB64u(seed))
  return accountSessions.snapshot()?.status === 'suspended'
}
