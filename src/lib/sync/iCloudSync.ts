import { AppState, AppStateStatus, Platform } from 'react-native'
import _ from 'lodash'
import * as ICloudBridge from '../../../modules/icloud-bridge'
import useContacts from '../../stores/contactsStore'
import useConversations from '../../stores/conversationStore'
import useServiceReport from '../../stores/serviceReport'
import { usePreferences } from '../../stores/preferences'
import { buildPayload, parsePayload, SyncPayload } from './payload'
import { mergePayload } from './merge'
import { logger } from '../logger'
import * as Sentry from '@sentry/react-native'
import * as Device from 'expo-device'
import { EventSubscription } from 'expo-modules-core'

const PUSH_DEBOUNCE_MS = 5000

let installed = false
let pushScheduled = false

/**
 * Lightweight UUID-ish id. Good enough for attributing writes to a device in
 * the sync payload metadata. Not security-sensitive, so a stronger RNG would be
 * overkill.
 */
function generateDeviceId(): string {
  return (
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36)
  )
}

function ensureDeviceId(): string {
  const prefs = usePreferences.getState()
  if (prefs.iCloudDeviceId) return prefs.iCloudDeviceId
  const id = generateDeviceId()
  prefs.set({ iCloudDeviceId: id })
  return id
}

/** Whether the user has opted into iCloud sync AND iCloud is actually usable. */
export function canSync(): boolean {
  if (Platform.OS !== 'ios') return false
  const { iCloudSyncEnabled } = usePreferences.getState()
  if (!iCloudSyncEnabled) return false
  return ICloudBridge.isAvailable()
}

/**
 * Heuristic for "this device already has user content worth protecting." Used
 * on first-enable to decide whether to silently pull (fresh device) or surface
 * the merge/replace sheet (both sides populated).
 *
 * `onboardingComplete` alone is enough, since the user has deliberately set
 * their publisher type and related prefs at that point. Absent that, we check
 * for any user-created records.
 */
export function hasMeaningfulLocalData(): boolean {
  const prefs = usePreferences.getState()
  if (prefs.onboardingComplete) return true

  const contacts = useContacts.getState()
  if (contacts.contacts.length > 0) return true
  if (contacts.deletedContacts.length > 0) return true

  const conversations = useConversations.getState()
  if (conversations.conversations.length > 0) return true

  const reports = useServiceReport.getState()
  if (reports.dayPlans.length > 0) return true
  if (reports.recurringPlans.length > 0) return true
  for (const year of Object.values(reports.serviceReports)) {
    for (const month of Object.values(year)) {
      if (month.length > 0) return true
    }
  }
  return false
}

/**
 * Destructive: wipes local user data + syncable prefs and replaces them with
 * the contents of `remote`. Device-local bookkeeping (`iCloudSyncEnabled`,
 * `iCloudDeviceId`, etc.) is preserved.
 *
 * Use this as the "Use iCloud data" branch of the first-enable sheet and as the
 * onboarding one-shot restore. Caller is responsible for confirming destructive
 * intent.
 *
 * Uses `useStore.setState(...)` directly for preferences to bypass the stamping
 * wrapper — we want to preserve the remote's per-key `preferenceUpdatedAt`
 * verbatim, not restamp everything with Date.now() (which would make this
 * device look like the freshest writer and flip the direction of future
 * merges).
 */
export function replaceLocalWithRemote(remote: SyncPayload): void {
  useContacts.setState({
    contacts: remote.contactStore.contacts ?? [],
    deletedContacts: remote.contactStore.deletedContacts ?? [],
  })
  useConversations.setState({
    conversations: remote.conversationStore.conversations ?? [],
    deletedConversations: remote.conversationStore.deletedConversations ?? [],
  })
  useServiceReport.setState({
    serviceReports: remote.serviceReportStore.serviceReports ?? {},
    dayPlans: remote.serviceReportStore.dayPlans ?? [],
    recurringPlans: remote.serviceReportStore.recurringPlans ?? [],
    deletedServiceReports:
      remote.serviceReportStore.deletedServiceReports ?? [],
  })

  const now = Date.now()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  usePreferences.setState({
    ...(remote.preferencesStore.values as any),
    preferenceUpdatedAt: remote.preferencesStore.updatedAt ?? {},
    lastiCloudSyncAt: now,
    lastiCloudPulledAt: now,
    lastiCloudRemoteWrittenAt: remote.writtenAt,
    lastiCloudRemoteDeviceId: remote.deviceId,
    lastiCloudRemoteDeviceName: remote.deviceName ?? null,
  })
}

/**
 * The inverse of `replaceLocalWithRemote`: wipes the remote file so nothing on
 * iCloud shadows what's about to be pushed, then pushes fresh from this device.
 * Used by the first-enable sheet's "Keep this device's data" branch.
 */
export async function overwriteRemoteWithLocal(): Promise<void> {
  try {
    await ICloudBridge.deleteFile()
  } catch (e) {
    logger.error('[iCloudSync] failed to clear remote before overwrite', e)
    Sentry.captureException(e, { tags: { iCloudSync: 'overwrite' } })
  }
  await push('overwrite-remote')
}

/**
 * One-shot read of the remote payload without installing sync, without
 * requiring the user to be opted in. Used by the onboarding restore step to
 * peek at what's available before the user decides.
 */
export async function peekRemotePayload(): Promise<SyncPayload | null> {
  if (Platform.OS !== 'ios') return null
  if (!ICloudBridge.isAvailable()) return null
  try {
    const read = await ICloudBridge.read()
    if (!read) return null
    return parsePayload(read.json)
  } catch (e) {
    logger.error('[iCloudSync] peekRemotePayload failed', e)
    return null
  }
}

/**
 * Pushes current local state to iCloud. Safe to call when sync is disabled —
 * it's a no-op. Errors are logged + reported to Sentry but never thrown, so
 * callers (store subscribers, AppState handlers) don't need try/catch.
 */
export async function push(reason: string): Promise<void> {
  if (!canSync()) return
  try {
    const deviceId = ensureDeviceId()
    const payload = buildPayload({
      deviceId,
      deviceName: Device.modelName ?? undefined,
    })
    await ICloudBridge.write(JSON.stringify(payload))
    const now = Date.now()
    usePreferences.getState().set({
      lastiCloudSyncAt: now,
      lastiCloudPushedAt: now,
    })
    Sentry.addBreadcrumb({
      category: 'iCloudSync',
      message: `push (${reason})`,
      level: 'info',
    })
  } catch (e) {
    logger.error(`[iCloudSync] push failed (${reason})`, e)
    Sentry.captureException(e, { tags: { iCloudSync: 'push' } })
  }
}

const debouncedPush = _.debounce(
  () => {
    pushScheduled = false
    push('store-change')
  },
  PUSH_DEBOUNCE_MS,
  { leading: false, trailing: true }
)

function schedulePush() {
  if (!canSync()) return
  pushScheduled = true
  debouncedPush()
}

/**
 * Reads the remote blob (if any), merges against local state, and writes the
 * merged result back into the relevant zustand stores. No-op when sync is
 * disabled. Returns whether any local state actually changed.
 */
export async function pullAndMerge(reason: string): Promise<boolean> {
  if (!canSync()) return false

  let remote: SyncPayload | null = null
  try {
    const readResult = await ICloudBridge.read()
    if (!readResult) {
      // Nothing remote yet — seed on next push.
      usePreferences.getState().set({ lastiCloudPulledAt: Date.now() })
      Sentry.addBreadcrumb({
        category: 'iCloudSync',
        message: `pull (${reason}) — no remote`,
        level: 'info',
      })
      return false
    }
    remote = parsePayload(readResult.json)
    if (!remote) {
      logger.error('[iCloudSync] remote payload rejected by validator')
      Sentry.captureMessage('iCloudSync: invalid remote payload', {
        level: 'warning',
      })
      return false
    }
  } catch (e) {
    logger.error(`[iCloudSync] pull failed (${reason})`, e)
    Sentry.captureException(e, { tags: { iCloudSync: 'pull' } })
    return false
  }

  // Record what we saw in the remote file so the settings screen can show
  // "last remote write was at T from device X" — independent of whether we
  // actually merged anything.
  const now = Date.now()
  usePreferences.getState().set({
    lastiCloudPulledAt: now,
    lastiCloudRemoteWrittenAt: remote.writtenAt,
    lastiCloudRemoteDeviceId: remote.deviceId,
    lastiCloudRemoteDeviceName: remote.deviceName ?? null,
  })

  // Skip merge if the remote blob was last written by this device and
  // nothing has changed since — avoids a useless merge pass on our own
  // writes bouncing back through the metadata query.
  const prefs = usePreferences.getState()
  if (remote.deviceId === prefs.iCloudDeviceId && prefs.lastiCloudSyncAt) {
    if (remote.writtenAt <= prefs.lastiCloudSyncAt) {
      return false
    }
  }

  const contactsState = useContacts.getState()
  const conversationsState = useConversations.getState()
  const serviceReportState = useServiceReport.getState()
  const preferencesState = usePreferences.getState()

  // Snapshot the preference values participating in sync — same allow-list
  // used by `buildPayload`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const localPrefValues: Record<string, any> = {}
  for (const [key, value] of Object.entries(preferencesState)) {
    if (typeof value === 'function') continue
    localPrefValues[key] = value
  }

  const result = mergePayload(
    {
      contacts: contactsState.contacts,
      deletedContacts: contactsState.deletedContacts,
      conversations: conversationsState.conversations,
      deletedConversations: conversationsState.deletedConversations,
      serviceReports: serviceReportState.serviceReports,
      dayPlans: serviceReportState.dayPlans,
      recurringPlans: serviceReportState.recurringPlans,
      deletedServiceReports: serviceReportState.deletedServiceReports,
      preferencesValues: localPrefValues,
      preferenceUpdatedAt: preferencesState.preferenceUpdatedAt ?? {},
    },
    remote
  )

  if (!result.changed) {
    return false
  }

  // Apply to stores. Each store's raw `set` replaces the named fields while
  // leaving the rest of the state (actions, other fields) intact.
  contactsState.set({
    contacts: result.contacts,
    deletedContacts: result.deletedContacts,
  })
  conversationsState.set({
    conversations: result.conversations,
    deletedConversations: result.deletedConversations,
  })
  serviceReportState.set({
    serviceReports: result.serviceReports,
    dayPlans: result.dayPlans,
    recurringPlans: result.recurringPlans,
    deletedServiceReports: result.deletedServiceReports,
  })

  // Preferences have a stamping wrapper that would restamp every merged key
  // with Date.now() — bypass it via setState so the merge algorithm's own
  // per-key timestamps survive the write.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  usePreferences.setState({
    ...(result.preferencesValues as any),
    preferenceUpdatedAt: result.preferenceUpdatedAt,
    lastiCloudSyncAt: Date.now(),
    lastiCloudPulledAt: Date.now(),
  })

  Sentry.addBreadcrumb({
    category: 'iCloudSync',
    message: `pull (${reason}) — merged changes`,
    level: 'info',
  })

  return true
}

/**
 * One-time backfill: stamps `updatedAt = Date.now()` onto any record that lacks
 * one, so the merge algorithm has something to compare against on the first
 * sync. Runs once per install (gated on
 * `preferences.hasMigratedToSyncSchema`).
 */
export function backfillUpdatedAtIfNeeded(): void {
  const prefs = usePreferences.getState()
  if (prefs.hasMigratedToSyncSchema) return

  const now = Date.now()
  const contacts = useContacts.getState()
  const conversations = useConversations.getState()
  const reports = useServiceReport.getState()

  contacts.set({
    contacts: contacts.contacts.map((c) =>
      c.updatedAt ? c : { ...c, updatedAt: now }
    ),
    deletedContacts: contacts.deletedContacts.map((c) =>
      c.updatedAt ? c : { ...c, updatedAt: now }
    ),
  })
  conversations.set({
    conversations: conversations.conversations.map((c) =>
      c.updatedAt ? c : { ...c, updatedAt: now }
    ),
  })

  const rebuiltReports: typeof reports.serviceReports = {}
  let reportsMutated = false
  for (const [yearKey, year] of Object.entries(reports.serviceReports)) {
    rebuiltReports[yearKey] = {}
    for (const [monthKey, month] of Object.entries(year)) {
      rebuiltReports[yearKey][monthKey] = month.map((r) => {
        if (r.updatedAt) return r
        reportsMutated = true
        return { ...r, updatedAt: now }
      })
    }
  }
  reports.set({
    serviceReports: reportsMutated ? rebuiltReports : reports.serviceReports,
    dayPlans: reports.dayPlans.map((p) =>
      p.updatedAt ? p : { ...p, updatedAt: now }
    ),
    recurringPlans: reports.recurringPlans.map((p) =>
      p.updatedAt ? p : { ...p, updatedAt: now }
    ),
  })

  prefs.set({ hasMigratedToSyncSchema: true })
}

/**
 * Wires iCloud sync into store changes, foreground transitions, and
 * remote-change events from the native module. Idempotent.
 *
 * Safe to call unconditionally at app boot — it gates on platform + the opt-in
 * preference, so nothing runs until the user flips the toggle.
 */
export function installiCloudSync(): () => void {
  if (Platform.OS !== 'ios') return () => {}
  if (installed) return () => {}
  installed = true

  const unsubContacts = useContacts.subscribe(() => schedulePush())
  const unsubConversations = useConversations.subscribe(() => schedulePush())
  const unsubServiceReports = useServiceReport.subscribe(() => schedulePush())
  const unsubPreferences = usePreferences.subscribe(() => schedulePush())

  const onAppState = (state: AppStateStatus) => {
    if (state === 'active') {
      if (!canSync()) return
      // Fire and forget — errors are already handled inside pullAndMerge.
      void pullAndMerge('foreground')
      return
    }
    // Leaving foreground (inactive/background): if a debounced push is
    // pending, flush it now so the user's latest edits actually land in
    // iCloud before the process is suspended. Otherwise typing a note and
    // killing the app inside the 5s debounce window silently loses the push.
    if (pushScheduled) {
      debouncedPush.flush()
    }
  }
  const appStateSub = AppState.addEventListener('change', onAppState)

  let remoteChangeSub: EventSubscription | null = null
  let availabilitySub: EventSubscription | null = null
  remoteChangeSub = ICloudBridge.addRemoteChangeListener(() => {
    if (!canSync()) return
    void pullAndMerge('remote-change')
  })
  availabilitySub = ICloudBridge.addAvailabilityChangeListener((e) => {
    if (!e.available) {
      logger.warn('[iCloudSync] iCloud became unavailable')
    }
  })

  return () => {
    unsubContacts()
    unsubConversations()
    unsubServiceReports()
    unsubPreferences()
    appStateSub.remove()
    remoteChangeSub?.remove()
    availabilitySub?.remove()
    installed = false
  }
}

/** For tests + the Settings "Sync now" button. */
export const iCloudSync = {
  push,
  pullAndMerge,
  canSync,
  backfillUpdatedAtIfNeeded,
  hasMeaningfulLocalData,
  replaceLocalWithRemote,
  overwriteRemoteWithLocal,
  peekRemotePayload,
  isPushScheduled: () => pushScheduled,
}
