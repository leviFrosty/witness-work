import { AppState, Platform } from 'react-native'
import * as Device from 'expo-device'
import { getRandomBytes } from 'expo-crypto'
import { sha256 } from '@noble/hashes/sha2.js'
import * as BuddiesKeychain from '../../../modules/buddies-keychain'
import apis from '@/constants/apis'
import { fromB64u, toB64u, utf8 } from '@/lib/bytes'
import {
  addBackgroundListener,
  addForegroundListener,
} from '@/lib/appLifecycle'
import { logger } from '@/lib/logger'
import { syncNow } from '@/lib/syncClock'
import {
  CLOUD_ACCOUNT_CHANGE_RESET,
  ensureSyncDeviceId,
} from '@/lib/iCloudIdentity'
import {
  accountSessions,
  bearerOptions,
  onAccountChange,
  serverAccount,
} from '@/lib/serverAccount'
import { ensureRevenueCatLinked } from '@/lib/serverAccount/revenueCatLinkRuntime'
import {
  cloudSyncOffered,
  registerCloudSyncTransport,
  usesCloudSync,
} from '@/lib/syncTransport/provider'
import {
  createServerTransport,
  filenameForSlot,
  type ServerSyncAccess,
} from '@/lib/syncTransport/server/serverTransport'
import { deriveSyncKey } from '@/lib/syncTransport/server/syncCrypto'
import {
  fetchSyncStatus,
  listSyncSlots,
  type SyncStatus,
} from '@/lib/syncTransport/server/syncClient'
import {
  createLiveInbox,
  type LiveEvent,
} from '@/features/buddies/lib/liveInbox'
import type { LiveSocket } from '@/features/buddies/lib/relay'
import { useSupporter } from '@/features/supporter/stores/supporter'
import { useUpdateRequired } from '@/lib/appUpdate/updateRequired'
import { usePreferences } from '@/stores/preferences'

/**
 * Cloud Sync's runtime (ADR 0030; docs/accounts-protocol.md, "Sync"): the
 * server transport wired to this device's account key and session, the
 * account's Cloud Sync status, and the live socket that tells the engine when
 * another device wrote. The engine itself (`iCloudSync.ts`) decides everything
 * else.
 */

/** The account key on this device, without creating one. */
async function peekAccountKey(): Promise<Uint8Array | null> {
  const seed = await BuddiesKeychain.peekRootSeed().catch(() => null)
  return seed ? fromB64u(seed) : null
}

let derived: { seed: string; key: Uint8Array } | null = null
const syncKeyFor = (accountKey: Uint8Array) => {
  const seed = toB64u(accountKey)
  if (derived?.seed !== seed) derived = { seed, key: deriveSyncKey(accountKey) }
  return derived.key
}

/**
 * The account a Cloud Sync call runs as: the account key already on this device
 * and its session, opened when there's none. Never creates a key; the default
 * and Settings do that first (`prepareCloudSync`).
 */
async function cloudSyncAccess(): Promise<ServerSyncAccess> {
  const accountKey = await peekAccountKey()
  if (!accountKey) throw new Error('No account key on this device')
  const { accountId } = await serverAccount.connect(accountKey)
  return {
    accountId,
    syncKey: syncKeyFor(accountKey),
    options: bearerOptions(accountKey),
  }
}

/** A hash of the account id, so the stored identity names no account. */
const accountToken = (accountId: string) =>
  `account:${toB64u(sha256(utf8(accountId))).slice(0, 22)}`

export const cloudSyncTransport = createServerTransport({
  access: cloudSyncAccess,
  isAvailable: () => accountSessions.snapshot() !== null,
  identityToken: () => {
    const session = accountSessions.snapshot()
    return session ? accountToken(session.accountId) : null
  },
  randomBytes: getRandomBytes,
  deviceName: () =>
    Device.modelName ?? (Platform.OS === 'android' ? 'Android' : 'iPhone'),
  platform: Platform.OS === 'android' ? 'android' : 'ios',
  now: syncNow,
  onRefused: (refusal) => {
    logger.warn(`[cloudSync] refused: ${refusal}`)
    usePreferences.setState(
      refusal === 'disabled'
        ? {
            cloudSyncEntitled: false,
            cloudSyncConfig: {
              entitlement:
                usePreferences.getState().cloudSyncConfig?.entitlement ??
                'supporter',
              enabled: false,
            },
          }
        : { cloudSyncEntitled: false }
    )
  },
})

/** Before anything syncs (`initializeApp`). */
export function registerCloudSync(): void {
  registerCloudSyncTransport(cloudSyncTransport)
}

let statusInFlight: Promise<SyncStatus | null> | null = null
let statusReadAt = -Infinity
/** The server's answer changes with purchases and switches; not by the second. */
const STATUS_MIN_INTERVAL_MS = 60_000

/**
 * Reads the account's Cloud Sync status (`GET /accounts/v1/sync`) and records
 * it. Null without a session or when it can't be read; what's recorded then
 * stands. `force` skips the minute between reads.
 */
export function refreshCloudSyncStatus({
  force = false,
}: { force?: boolean } = {}): Promise<SyncStatus | null> {
  if (statusInFlight) return statusInFlight
  if (!force && Date.now() - statusReadAt < STATUS_MIN_INTERVAL_MS)
    return Promise.resolve(null)
  statusInFlight = (async () => {
    await accountSessions.ready()
    if (!accountSessions.snapshot()) return null
    const accountKey = await peekAccountKey()
    if (!accountKey) return null
    try {
      const status = await fetchSyncStatus(bearerOptions(accountKey))
      statusReadAt = Date.now()
      const prefs = usePreferences.getState()
      // ww-api couldn't reach RevenueCat, so its `entitled: false` says
      // nothing about a Supporter here: keep what was recorded rather than
      // pausing their sync for the outage.
      const supporterUnknown =
        status.enabled &&
        !status.entitled &&
        status.supporterCheckFailed &&
        useSupporter.getState().isSupporter
      usePreferences.setState({
        cloudSyncEntitled: supporterUnknown
          ? prefs.cloudSyncEntitled
          : status.entitled,
        ...(prefs.cloudSyncConfig?.enabled !== status.enabled ||
        prefs.cloudSyncConfig?.entitlement !== status.entitlement
          ? {
              cloudSyncConfig: {
                enabled: status.enabled,
                entitlement: status.entitlement,
              },
            }
          : {}),
      })
      cloudSyncTransport.notifyAvailabilityChange()
      return status
    } catch (error) {
      logger.warn('[cloudSync] status unavailable', error)
      return null
    }
  })().finally(() => {
    statusInFlight = null
  })
  return statusInFlight
}

/**
 * Why Cloud Sync is paused on this device, as last recorded: the server's
 * switch is off, or the account isn't entitled. Null when it isn't paused, or
 * the device doesn't sync through Cloud Sync. Nothing local changes while it's
 * paused; edits wait and go up once it's back.
 */
export type CloudSyncPause = 'switch' | 'entitlement'

export function cloudSyncPause(): CloudSyncPause | null {
  if (!usesCloudSync()) return null
  const { cloudSyncConfig, cloudSyncEntitled } = usePreferences.getState()
  if (cloudSyncConfig?.enabled === false) return 'switch'
  if (cloudSyncEntitled === false) return 'entitlement'
  return null
}

/**
 * Before a sync the User asked for: reads the account's answer again, so a
 * pause that has ended lifts now rather than at the next foreground (the engine
 * catches up when it does), and says what still pauses it. Without an answer
 * (offline), what was recorded stands.
 */
export async function recheckCloudSyncPause(): Promise<CloudSyncPause | null> {
  if (!usesCloudSync()) return null
  await refreshCloudSyncStatus({ force: true })
  return cloudSyncPause()
}

export type PrepareCloudSyncOutcome =
  | { outcome: 'ready'; status: SyncStatus }
  | { outcome: 'not_entitled'; status: SyncStatus }
  | { outcome: 'disabled' }
  /** No session to be had: offline, accounts off, or this device can't attest. */
  | { outcome: 'no_session'; error: unknown }

/**
 * Gets this device ready for Cloud Sync: the account key (created when there's
 * none, as Scribe AI and Backup do), its session, the RevenueCat link (so the
 * server knows a Supporter), and the account's answer.
 */
export async function prepareCloudSync(): Promise<PrepareCloudSyncOutcome> {
  try {
    await accountSessions.ensure()
  } catch (error) {
    return { outcome: 'no_session', error }
  }
  cloudSyncTransport.notifyAvailabilityChange()
  // A Supporter's purchase reaches the account through the link.
  if (useSupporter.getState().isSupporter)
    await ensureRevenueCatLinked({ reason: 'session_opened' }).catch(
      () => undefined
    )
  const status = await refreshCloudSyncStatus({ force: true })
  if (!status) return { outcome: 'no_session', error: null }
  if (!status.enabled) return { outcome: 'disabled' }
  if (!status.entitled) return { outcome: 'not_entitled', status }
  return { outcome: 'ready', status }
}

/**
 * When Cloud Sync would bring the account's data to this device (ADR 0030 §3):
 * the server time of another device's newest slot, so a restore can tell
 * whether the backup is newer. It's offered, this device hasn't chosen
 * iCloud/Drive or turned sync off, the account is entitled, and another device
 * has a slot. Null otherwise, or when it can't tell.
 */
export async function cloudSyncNewestSlotAt(): Promise<number | null> {
  const prefs = usePreferences.getState()
  if (!cloudSyncOffered() || prefs.syncProvider === 'platform') return null
  if (prefs.iCloudSyncSetByUser && !prefs.iCloudSyncEnabled) return null
  const status = await refreshCloudSyncStatus({ force: true })
  if (!status?.entitled) return null
  try {
    const { options } = await cloudSyncAccess()
    const { slots } = await listSyncSlots(options)
    const own = ensureSyncDeviceId()
    const others = slots.filter((slot) => slot.slotId !== own)
    if (others.length === 0) return null
    return Math.max(...others.map((slot) => slot.updatedAt))
  } catch {
    return null
  }
}

/** Longest leaving waits on the server, so it never blocks the User. */
const LEAVE_WAIT_MS = 5_000

const bounded = <T>(work: Promise<T>, ms: number) =>
  Promise.race([
    work,
    new Promise<undefined>((resolve) => setTimeout(resolve, ms)),
  ])

/**
 * This device leaves Cloud Sync's account data: it deletes its own slot, and
 * never another device's. The caller has flushed its last push first. Bounded:
 * a slot left behind (offline) is deleted by the server 30 days after this
 * device's session ends.
 */
export async function deleteOwnCloudSyncSlot(): Promise<void> {
  try {
    await bounded(
      cloudSyncTransport.deleteFile(filenameForSlot(ensureSyncDeviceId())),
      LEAVE_WAIT_MS
    )
  } catch (error) {
    logger.warn('[cloudSync] deleting this device’s slot failed', error)
  }
}

/**
 * Before this device's account key is replaced (a QR code or a recovery key to
 * another account; ADR 0030 §7): flush, delete only this device's slot, and
 * stop, so the account's other devices keep everything. The device then decides
 * again on the new account as one that never chose.
 */
export async function leaveCloudSyncAccount(flush: () => Promise<unknown>) {
  if (!usesCloudSync() || !usePreferences.getState().iCloudSyncEnabled) return
  await bounded(
    flush().catch(() => undefined),
    LEAVE_WAIT_MS
  )
  await deleteOwnCloudSyncSlot()
  usePreferences.setState({
    ...CLOUD_ACCOUNT_CHANGE_RESET,
    cloudSyncAccountToken: null,
  })
  cloudSyncTransport.reset()
}

/** React Native's WebSocket takes headers; the DOM typings don't know it. */
type HeaderWebSocket = new (
  url: string,
  protocols: null,
  options: { headers: Record<string, string> }
) => LiveSocket

async function openSyncSocket(): Promise<LiveSocket> {
  const accountKey = await peekAccountKey()
  if (!accountKey) throw new Error('No account key on this device')
  return accountSessions.withSession(
    async (authorization) =>
      new (WebSocket as unknown as HeaderWebSocket)(
        `${apis.accounts.replace(/^http/, 'ws')}/accounts/v1/sync/live`,
        null,
        {
          headers: {
            authorization,
            'x-ww-slot-id': ensureSyncDeviceId(),
          },
        }
      ),
    { accountKey }
  )
}

/** The live socket's recent events, for the developer Tools. */
export const cloudSyncLiveEvents: Array<LiveEvent & { at: number }> = []
const recordLiveEvent = (event: LiveEvent) => {
  cloudSyncLiveEvents.push({ ...event, at: Date.now() })
  if (cloudSyncLiveEvents.length > 50) cloudSyncLiveEvents.shift()
  if (event.type === 'openFailed' || event.type === 'closed')
    logger.debug(`[cloudSync] live ${event.type}`)
}

let installed = false

/**
 * Runs Cloud Sync's live socket (foreground only, one per device) while this
 * device syncs through Cloud Sync, and keeps the account's status current.
 * `canSync` is the engine's gate. Returns an uninstall.
 */
export function installCloudSyncRuntime(canSync: () => boolean): () => void {
  if (installed) return () => {}
  installed = true
  const live = createLiveInbox({
    open: openSyncSocket,
    syncedSeq: () => cloudSyncTransport.lastSeq(),
    onChange: () => cloudSyncTransport.notifyRemoteChange(),
    // After a refused handshake: a bearer call's 401 refreshes the token.
    verify: () => refreshCloudSyncStatus({ force: true }),
    onEvent: recordLiveEvent,
  })
  const wanted = () =>
    AppState.currentState === 'active' && usesCloudSync() && canSync()
  const update = () => {
    if (wanted()) live.start()
    else live.stop()
  }

  const foreground = addForegroundListener(() => {
    void refreshCloudSyncStatus()
    update()
  })
  const background = addBackgroundListener(() => live.stop())
  const prefs = usePreferences.subscribe((state, previous) => {
    if (
      state.syncProvider !== previous.syncProvider ||
      state.iCloudSyncEnabled !== previous.iCloudSyncEnabled ||
      state.cloudSyncEntitled !== previous.cloudSyncEntitled ||
      state.cloudSyncConfig !== previous.cloudSyncConfig
    )
      update()
  })
  const supporter = useSupporter.subscribe((state, previous) => {
    if (state.isSupporter === previous.isSupporter) return
    // A purchase or a lapse: the link tells the server, then it answers.
    void ensureRevenueCatLinked({ reason: 'entitlements' })
      .catch(() => undefined)
      .then(() => refreshCloudSyncStatus({ force: true }))
  })
  // Update Required pauses the engine (`canSync`), the socket with it.
  const gate = useUpdateRequired.subscribe((state, previous) => {
    if (Boolean(state.required) !== Boolean(previous.required)) update()
  })
  const account = onAccountChange(() => {
    cloudSyncTransport.notifyAvailabilityChange()
    void refreshCloudSyncStatus({ force: true }).then(update)
  })
  void accountSessions.ready().then(() => {
    cloudSyncTransport.notifyAvailabilityChange()
    void refreshCloudSyncStatus().then(update)
  })
  update()

  return () => {
    live.stop()
    foreground.remove()
    background.remove()
    prefs()
    supporter()
    gate()
    account()
    installed = false
  }
}

/** For the developer Tools. */
export const cloudSyncDiagnostics = {
  liveEvents: () => [...cloudSyncLiveEvents],
  lastSeq: () => cloudSyncTransport.lastSeq(),
}
