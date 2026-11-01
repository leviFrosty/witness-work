import { AppState, Platform } from 'react-native'
import * as Device from 'expo-device'
import { getRandomBytes } from 'expo-crypto'
import { sha256 } from '@noble/hashes/sha2.js'
import apis from '@/constants/apis'
import { toB64u, utf8 } from '@/lib/bytes'
import {
  addBackgroundListener,
  addForegroundListener,
} from '@/lib/appLifecycle'
import { type LiveSocket, openHeaderSocket } from '@/lib/liveSignal'
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
  peekAccountKey,
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
import { useSupporter } from '@/features/supporter/stores/supporter'
import { useUpdateRequired } from '@/lib/appUpdate/updateRequired'
import { usePreferences } from '@/stores/preferences'

let derived: { seed: string; key: Uint8Array } | null = null
const syncKeyFor = (accountKey: Uint8Array) => {
  const seed = toB64u(accountKey)
  if (derived?.seed !== seed) derived = { seed, key: deriveSyncKey(accountKey) }
  return derived.key
}

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

export function registerCloudSync(): void {
  registerCloudSyncTransport(cloudSyncTransport)
}

let statusInFlight: Promise<SyncStatus | null> | null = null
let statusReadAt = -Infinity

const STATUS_MIN_INTERVAL_MS = 60_000

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

export type CloudSyncPause = 'switch' | 'entitlement'

export function cloudSyncPause(): CloudSyncPause | null {
  if (!usesCloudSync()) return null
  const { cloudSyncConfig, cloudSyncEntitled } = usePreferences.getState()
  if (cloudSyncConfig?.enabled === false) return 'switch'
  if (cloudSyncEntitled === false) return 'entitlement'
  return null
}

export async function recheckCloudSyncPause(): Promise<CloudSyncPause | null> {
  if (!usesCloudSync()) return null
  await refreshCloudSyncStatus({ force: true })
  return cloudSyncPause()
}

export type PrepareCloudSyncOutcome =
  | { outcome: 'ready'; status: SyncStatus }
  | { outcome: 'not_entitled'; status: SyncStatus }
  | { outcome: 'disabled' }
  | { outcome: 'no_session'; error: unknown }

export async function prepareCloudSync(): Promise<PrepareCloudSyncOutcome> {
  try {
    await accountSessions.ensure()
  } catch (error) {
    return { outcome: 'no_session', error }
  }
  cloudSyncTransport.notifyAvailabilityChange()

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

const LEAVE_WAIT_MS = 5_000

const bounded = <T>(work: Promise<T>, ms: number) =>
  Promise.race([
    work,
    new Promise<undefined>((resolve) => setTimeout(resolve, ms)),
  ])

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

async function openSyncSocket(): Promise<LiveSocket> {
  const accountKey = await peekAccountKey()
  if (!accountKey) throw new Error('No account key on this device')
  return accountSessions.withSession(
    async (authorization) =>
      openHeaderSocket(
        `${apis.accounts.replace(/^http/, 'ws')}/accounts/v1/sync/live`,
        { authorization, 'x-ww-slot-id': ensureSyncDeviceId() }
      ),
    { accountKey }
  )
}

export const cloudSyncLiveEvents: Array<LiveEvent & { at: number }> = []
const recordLiveEvent = (event: LiveEvent) => {
  cloudSyncLiveEvents.push({ ...event, at: Date.now() })
  if (cloudSyncLiveEvents.length > 50) cloudSyncLiveEvents.shift()
  if (event.type === 'openFailed' || event.type === 'closed')
    logger.debug(`[cloudSync] live ${event.type}`)
}

let installed = false

export function installCloudSyncRuntime(canSync: () => boolean): () => void {
  if (installed) return () => {}
  installed = true
  const live = createLiveInbox({
    open: openSyncSocket,
    syncedSeq: () => cloudSyncTransport.lastSeq(),
    onChange: () => cloudSyncTransport.notifyRemoteChange(),

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

    void ensureRevenueCatLinked({ reason: 'entitlements' })
      .catch(() => undefined)
      .then(() => refreshCloudSyncStatus({ force: true }))
  })

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

export const cloudSyncDiagnostics = {
  liveEvents: () => [...cloudSyncLiveEvents],
  lastSeq: () => cloudSyncTransport.lastSeq(),
}
