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
import { Contact } from '../../types/contact'
import { Conversation, ConversationTombstone } from '../../types/conversation'
import {
  DayPlan,
  ServiceReportsByYears,
  ServiceReportTombstone,
} from '../../types/serviceReport'
import { RecurringPlan } from '../serviceReport'

const PUSH_DEBOUNCE_MS = 5000
/**
 * ICloud re-stamps a file's FSContentChangeDate as it replicates through the
 * server, so every push produces 1–2 `remote-change` notifications a few
 * hundred ms later that aren't real foreign edits. Coalescing in `pullAndMerge`
 * doesn't catch them because they arrive _sequentially_ after the prior pull
 * finishes. A short leading+trailing debounce on the listener folds each echo
 * burst into one follow-up pull while still letting genuine remote changes
 * trigger an immediate pull on the leading edge.
 */
const REMOTE_CHANGE_DEBOUNCE_MS = 500

/**
 * Per-device file naming. The JS layer owns this scheme so the Swift bridge
 * stays agnostic about payload semantics — it just enforces that writes stay
 * within the `witness-work*.json` namespace.
 *
 * Per-device files prevent cross-device iCloud Drive conflicts, which
 * previously surfaced as `witness-work 2.json`, `witness-work 3.json` etc. and
 * stranded each device's data in its own silo.
 */
const SYNC_FILE_PREFIX = 'witness-work'
const SYNC_FILE_EXT = '.json'

let installed = false
let pushScheduled = false

/**
 * Coalesce concurrent `pullAndMerge` calls. NSMetadataQuery fires in bursts
 * (both `DidFinishGathering` and `DidUpdate`, plus multiple notifications per
 * iCloud file op), and each `readAll` takes ~1s; running them concurrently
 * wastes I/O and produced the storm visible in the logs. At-most-one-queued is
 * enough because every caller just wants "the freshest state after my wake-up,"
 * and the in-flight pull's readAll sees strictly newer data than anything the
 * coalesced caller saw.
 */
let pullInFlight: Promise<boolean> | null = null
let pullQueuedReason: string | null = null

function filenameForDevice(deviceId: string): string {
  return `${SYNC_FILE_PREFIX}-${deviceId}${SYNC_FILE_EXT}`
}

/**
 * A filename is "legacy" if it's not in the per-device scheme — i.e. the
 * pre-upgrade single-file name `witness-work.json` or its iCloud conflict
 * duplicates `witness-work 2.json`, `witness-work 3.json`, etc. These can still
 * contain valuable data (one of ours had 23KB stranded in `witness-work
 * 4.json`), so the reader absorbs them and then deletes them.
 */
function isLegacyFilename(filename: string): boolean {
  return !filename.startsWith(`${SYNC_FILE_PREFIX}-`)
}

/**
 * Counts the flattened service reports across the year/month nesting. Used by
 * the diagnostic logs so we can spot size drift between local / remote / merged
 * without dumping every record.
 */
function countReports(
  byYear: { [year: string]: { [month: string]: unknown[] } } | undefined
): number {
  if (!byYear) return 0
  let total = 0
  for (const year of Object.values(byYear)) {
    for (const month of Object.values(year)) {
      total += month.length
    }
  }
  return total
}

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

/**
 * Short log tag so interleaved Metro/Console output from multiple devices is
 * readable at a glance — pins which device emitted each line. Prefers the
 * human-readable model name (e.g. "iPhone 17 Pro") and falls back to the first
 * 6 chars of the device id, or "?" before the id has been generated.
 */
function tag(): string {
  const model = Device.modelName
  if (model) return `[iCloudSync/${model}]`
  const id = usePreferences.getState().iCloudDeviceId
  return `[iCloudSync/${id ? id.slice(0, 6) : '?'}]`
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

type LocalMergeState = {
  contacts: Contact[]
  deletedContacts: Contact[]
  conversations: Conversation[]
  deletedConversations: ConversationTombstone[]
  serviceReports: ServiceReportsByYears
  dayPlans: DayPlan[]
  recurringPlans: RecurringPlan[]
  deletedServiceReports: ServiceReportTombstone[]
  preferencesValues: Record<string, unknown>
  preferenceUpdatedAt: Record<string, number>
}

/**
 * Folds a list of remote payloads into a single synthesized SyncPayload by
 * merging them pairwise via the LWW merge algorithm. Used for
 * `peekRemotePayload` and the manual "restore from iCloud" flow, where the
 * caller expects one payload-shaped object representing the full remote state
 * across all devices.
 *
 * Returns null when the input is empty.
 */
function foldRemotePayloads(payloads: SyncPayload[]): SyncPayload | null {
  if (payloads.length === 0) return null
  if (payloads.length === 1) return payloads[0]

  const first = payloads[0]
  let acc: LocalMergeState = {
    contacts: (first.contactStore.contacts ?? []) as Contact[],
    deletedContacts: (first.contactStore.deletedContacts ?? []) as Contact[],
    conversations: (first.conversationStore.conversations ??
      []) as Conversation[],
    deletedConversations: first.conversationStore.deletedConversations ?? [],
    serviceReports:
      (first.serviceReportStore.serviceReports as ServiceReportsByYears) ?? {},
    dayPlans: (first.serviceReportStore.dayPlans ?? []) as DayPlan[],
    recurringPlans: (first.serviceReportStore.recurringPlans ??
      []) as RecurringPlan[],
    deletedServiceReports: first.serviceReportStore.deletedServiceReports ?? [],
    preferencesValues: first.preferencesStore?.values ?? {},
    preferenceUpdatedAt: first.preferencesStore?.updatedAt ?? {},
  }

  for (let i = 1; i < payloads.length; i++) {
    const result = mergePayload(acc, payloads[i])
    acc = {
      contacts: result.contacts,
      deletedContacts: result.deletedContacts,
      conversations: result.conversations,
      deletedConversations: result.deletedConversations,
      serviceReports: result.serviceReports,
      dayPlans: result.dayPlans,
      recurringPlans: result.recurringPlans,
      deletedServiceReports: result.deletedServiceReports,
      preferencesValues: result.preferencesValues,
      preferenceUpdatedAt: result.preferenceUpdatedAt,
    }
  }

  // Representative metadata: pick the payload with the newest writtenAt.
  let rep = payloads[0]
  for (const p of payloads) {
    if (p.writtenAt > rep.writtenAt) rep = p
  }

  return {
    version: rep.version,
    writtenAt: rep.writtenAt,
    deviceId: rep.deviceId,
    deviceName: rep.deviceName,
    contactStore: {
      contacts: acc.contacts,
      deletedContacts: acc.deletedContacts,
    },
    conversationStore: {
      conversations: acc.conversations,
      deletedConversations: acc.deletedConversations,
    },
    serviceReportStore: {
      serviceReports: acc.serviceReports,
      dayPlans: acc.dayPlans,
      recurringPlans: acc.recurringPlans,
      deletedServiceReports: acc.deletedServiceReports,
    },
    preferencesStore: {
      values: acc.preferencesValues,
      updatedAt: acc.preferenceUpdatedAt,
    },
  }
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
  usePreferences.setState({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
 * The inverse of `replaceLocalWithRemote`: wipes every remote file so nothing
 * on iCloud shadows what's about to be pushed, then pushes fresh from this
 * device. Used by the first-enable sheet's "Keep this device's data" branch.
 */
export async function overwriteRemoteWithLocal(): Promise<void> {
  try {
    await ICloudBridge.deleteAll()
  } catch (e) {
    logger.error(`${tag()} failed to clear remote before overwrite`, e)
    Sentry.captureException(e, { tags: { iCloudSync: 'overwrite' } })
  }
  await push('overwrite-remote')
}

/**
 * One-shot read of the remote state without installing sync, without requiring
 * the user to be opted in. Used by the onboarding restore step to peek at
 * what's available before the user decides.
 *
 * Folds all per-device files together so the caller sees one unified view.
 */
export async function peekRemotePayload(): Promise<SyncPayload | null> {
  if (Platform.OS !== 'ios') return null
  if (!ICloudBridge.isAvailable()) return null
  try {
    const files = await ICloudBridge.readAll()
    const payloads: SyncPayload[] = []
    for (const file of files) {
      const parsed = parsePayload(file.json)
      if (parsed) payloads.push(parsed)
    }
    return foldRemotePayloads(payloads)
  } catch (e) {
    logger.error(`${tag()} peekRemotePayload failed`, e)
    return null
  }
}

/**
 * Pushes current local state to iCloud. Safe to call when sync is disabled —
 * it's a no-op. Errors are logged + reported to Sentry but never thrown, so
 * callers (store subscribers, AppState handlers) don't need try/catch.
 */
export async function push(reason: string): Promise<void> {
  if (!canSync()) {
    logger.log(`${tag()} push skipped (canSync=false)`, { reason })
    return
  }
  try {
    const deviceId = ensureDeviceId()
    const filename = filenameForDevice(deviceId)
    const payload = buildPayload({
      deviceId,
      deviceName: Device.modelName ?? undefined,
    })
    const json = JSON.stringify(payload)
    logger.log(`${tag()} push start`, {
      reason,
      filename,
      writtenAt: payload.writtenAt,
      bytes: json.length,
      contacts: payload.contactStore.contacts.length,
      deletedContacts: payload.contactStore.deletedContacts.length,
      conversations: payload.conversationStore.conversations.length,
      deletedConversations:
        payload.conversationStore.deletedConversations?.length ?? 0,
      serviceReports: countReports(payload.serviceReportStore.serviceReports),
      dayPlans: payload.serviceReportStore.dayPlans.length,
      recurringPlans: payload.serviceReportStore.recurringPlans.length,
      preferenceKeys: Object.keys(payload.preferencesStore.values).length,
    })
    await ICloudBridge.write(filename, json)
    const now = Date.now()
    usePreferences.getState().set({
      lastiCloudSyncAt: now,
      lastiCloudPushedAt: now,
    })
    logger.log(`${tag()} push success`, { reason, filename })
    Sentry.addBreadcrumb({
      category: 'iCloudSync',
      message: `push (${reason})`,
      level: 'info',
    })
  } catch (e) {
    logger.error(`${tag()} push failed (${reason})`, e)
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
 * Reads all remote files, filters out this device's own file (its contents are
 * already in local state), merges each foreign payload into local state via the
 * LWW algorithm, and writes the merged result back to the stores. No-op when
 * sync is disabled. Returns whether any local state actually changed.
 *
 * Coalesces concurrent callers: if a pull is already running, this returns the
 * in-flight promise and schedules at most one follow-up pull to catch anything
 * the running `readAll` raced past. See the `pullInFlight` comment for why
 * at-most-one is sufficient.
 *
 * Also absorbs + cleans up **legacy files** (pre-upgrade single-file scheme
 *
 * - ICloud conflict duplicates) so we converge on the per-device layout over
 *   time, without losing any stranded data.
 */
export async function pullAndMerge(reason: string): Promise<boolean> {
  if (pullInFlight) {
    if (!pullQueuedReason) pullQueuedReason = reason
    return pullInFlight
  }
  pullInFlight = (async () => {
    try {
      return await pullAndMergeInner(reason)
    } finally {
      const queued = pullQueuedReason
      pullQueuedReason = null
      pullInFlight = null
      if (queued) void pullAndMerge(queued)
    }
  })()
  return pullInFlight
}

async function pullAndMergeInner(reason: string): Promise<boolean> {
  if (!canSync()) {
    logger.log(`${tag()} pullAndMerge skipped (canSync=false)`, { reason })
    return false
  }

  logger.log(`${tag()} pullAndMerge start`, { reason })

  const deviceId = ensureDeviceId()
  const ownFilename = filenameForDevice(deviceId)

  let files: ICloudBridge.SyncFile[]
  try {
    files = await ICloudBridge.readAll()
  } catch (e) {
    logger.error(`${tag()} readAll failed (${reason})`, e)
    Sentry.captureException(e, { tags: { iCloudSync: 'pull' } })
    return false
  }

  logger.log(`${tag()} pullAndMerge: readAll`, {
    reason,
    totalFiles: files.length,
    filenames: files.map((f) => f.filename),
  })

  if (files.length === 0) {
    usePreferences.getState().set({ lastiCloudPulledAt: Date.now() })
    logger.log(`${tag()} pullAndMerge: no remote files`, { reason })
    Sentry.addBreadcrumb({
      category: 'iCloudSync',
      message: `pull (${reason}) — no remote`,
      level: 'info',
    })
    return false
  }

  // Parse each file. Legacy filenames are tracked for post-merge cleanup so
  // that once we've absorbed their contents, subsequent pulls stop seeing
  // them. A foreign device still on the old code will re-create a legacy
  // file on its next push; that's fine — we'll absorb + delete again.
  const remotePayloads: Array<{
    payload: SyncPayload
    filename: string
    modifiedAt: number
  }> = []
  const legacyFilenames: string[] = []
  for (const file of files) {
    if (file.filename === ownFilename) continue
    const parsed = parsePayload(file.json)
    if (!parsed) {
      logger.warn(`${tag()} pullAndMerge: skipping invalid file`, {
        reason,
        filename: file.filename,
        bytes: file.json.length,
        jsonPreview: file.json.slice(0, 200),
      })
      Sentry.captureMessage('iCloudSync: invalid remote payload', {
        level: 'warning',
      })
      continue
    }
    remotePayloads.push({
      payload: parsed,
      filename: file.filename,
      modifiedAt: file.modifiedAt,
    })
    if (isLegacyFilename(file.filename)) {
      legacyFilenames.push(file.filename)
    }
  }

  // Surface the freshest remote file in the settings display, regardless of
  // whether the merge actually changes anything. Chosen by `modifiedAt`
  // rather than `writtenAt` so the clock skew between devices doesn't
  // cause a very stale file to win.
  let freshest: (typeof remotePayloads)[number] | null = null
  for (const r of remotePayloads) {
    if (!freshest || r.modifiedAt > freshest.modifiedAt) {
      freshest = r
    }
  }

  const now = Date.now()
  usePreferences.getState().set({
    lastiCloudPulledAt: now,
    ...(freshest
      ? {
          lastiCloudRemoteWrittenAt: freshest.payload.writtenAt,
          lastiCloudRemoteDeviceId: freshest.payload.deviceId,
          lastiCloudRemoteDeviceName: freshest.payload.deviceName ?? null,
        }
      : {}),
  })

  if (remotePayloads.length === 0) {
    logger.log(`${tag()} pullAndMerge: no foreign payloads`, {
      reason,
      totalFiles: files.length,
      skippedOwn: files.some((f) => f.filename === ownFilename),
    })
    // Even with no foreign payloads, stale legacy files may exist from this
    // device's own pre-upgrade writes. Clean them up.
    void cleanupLegacyFiles(legacyFilenames)
    return false
  }

  // Snapshot local state once; fold each remote payload into the accumulator.
  const contactsState = useContacts.getState()
  const conversationsState = useConversations.getState()
  const serviceReportState = useServiceReport.getState()
  const preferencesState = usePreferences.getState()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const localPrefValues: Record<string, any> = {}
  for (const [key, value] of Object.entries(preferencesState)) {
    if (typeof value === 'function') continue
    localPrefValues[key] = value
  }

  logger.log(`${tag()} pullAndMerge: local snapshot`, {
    reason,
    contacts: contactsState.contacts.length,
    deletedContacts: contactsState.deletedContacts.length,
    conversations: conversationsState.conversations.length,
    deletedConversations: conversationsState.deletedConversations.length,
    serviceReports: countReports(serviceReportState.serviceReports),
    dayPlans: serviceReportState.dayPlans.length,
    recurringPlans: serviceReportState.recurringPlans.length,
    preferenceUpdatedAtKeys: Object.keys(
      preferencesState.preferenceUpdatedAt ?? {}
    ).length,
  })

  let acc: LocalMergeState = {
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
  }

  let anyChanged = false
  for (const r of remotePayloads) {
    const result = mergePayload(acc, r.payload)
    if (result.changed) anyChanged = true
    acc = {
      contacts: result.contacts,
      deletedContacts: result.deletedContacts,
      conversations: result.conversations,
      deletedConversations: result.deletedConversations,
      serviceReports: result.serviceReports,
      dayPlans: result.dayPlans,
      recurringPlans: result.recurringPlans,
      deletedServiceReports: result.deletedServiceReports,
      preferencesValues: result.preferencesValues,
      preferenceUpdatedAt: result.preferenceUpdatedAt,
    }
  }

  logger.log(`${tag()} pullAndMerge: merge result`, {
    reason,
    changed: anyChanged,
    remoteFiles: remotePayloads.length,
    legacyFiles: legacyFilenames.length,
    contacts: acc.contacts.length,
    deletedContacts: acc.deletedContacts.length,
    conversations: acc.conversations.length,
    deletedConversations: acc.deletedConversations.length,
    serviceReports: countReports(acc.serviceReports),
    dayPlans: acc.dayPlans.length,
    recurringPlans: acc.recurringPlans.length,
  })

  if (!anyChanged) {
    // Still clean up legacy files — their contents are already reflected in
    // local state from a prior pull, so deleting them is safe and stops
    // future pulls from re-reading them.
    void cleanupLegacyFiles(legacyFilenames)
    return false
  }

  contactsState.set({
    contacts: acc.contacts,
    deletedContacts: acc.deletedContacts,
  })
  conversationsState.set({
    conversations: acc.conversations,
    deletedConversations: acc.deletedConversations,
  })
  serviceReportState.set({
    serviceReports: acc.serviceReports,
    dayPlans: acc.dayPlans,
    recurringPlans: acc.recurringPlans,
    deletedServiceReports: acc.deletedServiceReports,
  })

  usePreferences.setState({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(acc.preferencesValues as any),
    preferenceUpdatedAt: acc.preferenceUpdatedAt,
    lastiCloudSyncAt: Date.now(),
    lastiCloudPulledAt: Date.now(),
  })

  logger.log(`${tag()} pullAndMerge: applied merge to stores`, {
    reason,
    contactsNow: useContacts.getState().contacts.length,
    conversationsNow: useConversations.getState().conversations.length,
    serviceReportsNow: countReports(useServiceReport.getState().serviceReports),
  })

  Sentry.addBreadcrumb({
    category: 'iCloudSync',
    message: `pull (${reason}) — merged changes`,
    level: 'info',
  })

  // Legacy contents are now reflected in local state AND will be written to
  // this device's per-device file on the next push. Safe to delete.
  void cleanupLegacyFiles(legacyFilenames)

  return true
}

/**
 * Deletes legacy sync files after their contents have been absorbed. Failures
 * are non-fatal — next pull will retry. Keeping this async-fire-and-forget so
 * it doesn't add latency to the hot path.
 */
async function cleanupLegacyFiles(filenames: string[]): Promise<void> {
  if (filenames.length === 0) return
  for (const filename of filenames) {
    try {
      await ICloudBridge.deleteFile(filename)
      logger.log(`${tag()} deleted legacy file`, { filename })
    } catch (e) {
      logger.warn(`${tag()} failed to delete legacy file`, {
        filename,
        error: (e as Error).message,
      })
    }
  }
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
  // Only schedule a push when a *syncable* preference key changed. The
  // stamping wrapper in `usePreferences` re-allocates `preferenceUpdatedAt`
  // iff a non-bookkeeping key was written, so a reference check on that map
  // is a cheap and accurate filter. Without this, every `pullAndMerge` wrote
  // `lastiCloudPulledAt` and armed a 5s debounced push, looping pulls back
  // into no-op pushes.
  const unsubPreferences = usePreferences.subscribe((state, prev) => {
    if (state.preferenceUpdatedAt !== prev.preferenceUpdatedAt) {
      schedulePush()
    }
  })

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
  const debouncedRemotePull = _.debounce(
    () => {
      if (!canSync()) return
      void pullAndMerge('remote-change')
    },
    REMOTE_CHANGE_DEBOUNCE_MS,
    { leading: true, trailing: true }
  )
  remoteChangeSub = ICloudBridge.addRemoteChangeListener(() => {
    if (!canSync()) return
    debouncedRemotePull()
  })
  availabilitySub = ICloudBridge.addAvailabilityChangeListener((e) => {
    if (!e.available) {
      logger.warn(`${tag()} iCloud became unavailable`)
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
    debouncedRemotePull.cancel()
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
