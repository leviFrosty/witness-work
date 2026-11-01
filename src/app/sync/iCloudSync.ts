import { perf } from '@/lib/perf'
import { lastForegroundAt } from '@/lib/appLifecycle'
import { foldRemotePayloads } from '@/app/sync/foldRemotePayloads'
import { subscribeToLocalDataChanges } from '@/app/sync/localChanges'
import {
  applyMergedState,
  localMergeState,
  mergePayloadsInto,
} from '@/app/sync/mergeIntoLocal'
import { syncNow, setSyncClockOffset, refreshSyncClock } from '@/lib/syncClock'
import { reconcileSyncDefinitions } from '@/app/sync/definitionReconciliation'
import { expireDeletedContactDetails } from '@/lib/contactRetention'
import { alignPayloadClock } from '@/app/sync/clockSkew'
import {
  syncableValues,
  NON_SYNCABLE_PROFILE_KEYS,
} from '@/lib/syncPreferencePolicy'
import { withRemoteDataMutation } from '@/lib/remoteDataMutation'
import {
  ResetEpoch,
  compareResetEpochs,
  createResetEpoch,
  newestResetEpoch,
} from '@/lib/syncResetEpoch'
import {
  filenameForContact,
  filenameForNoteImage,
  filenameForProfile,
} from '@/app/sync/imageNames'
import {
  SyncDeviceFile,
  SyncDeviceFiles,
  deviceIdFromSyncFilename,
  mergeSyncDeviceFiles,
  syncDeviceRemoval,
} from '@/lib/syncDevices'
import { analytics } from '@/lib/analytics'
import { AppState, AppStateStatus } from 'react-native'
import {
  addBackgroundListener,
  addForegroundListener,
} from '@/lib/appLifecycle'
import { addReconnectListener, isKnownOffline } from '@/lib/http/online'
import * as FileSystem from 'expo-file-system/legacy'
import debounce from 'lodash/debounce'
import {
  hasSyncTransport,
  syncTransport as platformSyncTransport,
  syncTransportErrorCode,
  type SyncFile,
  type SyncRead,
  type SyncTransportErrorCode,
  type UploadStatus,
} from '@/lib/syncTransport'
import {
  TRANSPORT_READ_TIMEOUT_MS,
  withTransportTimeout,
} from '@/lib/syncTransport/timeout'
import {
  activeSyncTransport as syncTransport,
  addActiveAvailabilityListener,
  addActiveRemoteChangeListener,
  usesCloudSync,
} from '@/lib/syncTransport/provider'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import { mileageFromPayload } from '@/app/sync/mileagePayload'
import {
  applyMileageSnapshot,
  hasMileageData,
} from '@/app/sync/mileageStoreSync'
import { petFromPayload } from '@/app/sync/petPayload'
import { applyPetSnapshot, hasPetData } from '@/app/sync/petStoreSync'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
import { useSupporter } from '@/features/supporter/stores/supporter'
import {
  buildPayload,
  isNewerPayloadVersion,
  parsePayload,
  PayloadRejection,
  SyncPayload,
} from '@/app/sync/payload'
import { classifyUploadStatus, UploadVerdict } from '@/app/sync/uploadStatus'
import { isAccountFilename } from '@/lib/accountFile'
import { reclaimAccountFile } from '@/lib/account'
import {
  IdentityCheckSource,
  checkICloudIdentity,
  ensureSyncDeviceId,
} from '@/lib/iCloudIdentity'
import { logger } from '@/lib/logger'
import { errorTracking } from '@/lib/errorTracking'
import * as Device from 'expo-device'
import { CustomFieldDefinition } from '@/types/customField'
import { Category } from '@/types/category'
import { isSeededBuiltinCategory } from '@/constants/categories'
import { migrateNormalizeDates } from '@/lib/normalizeDate'
import { stripTombstonedCustomFields } from '@/lib/customFields'
import {
  markCompleteICloudPull,
  setICloudPullWaitGate,
} from '@/lib/iCloudPullWait'
import {
  pushAllImages,
  pullMissingImages,
  gcOrphanImages,
  ActiveIdentity,
  ImageSyncBookkeeping,
  ImageSyncDeps,
  AvatarSource,
  filenameForSource,
} from '@/app/sync/imageSync'
import {
  collectLocalAvatarSources,
  collectExpectedMarkerSources,
  applyDownloadedAvatars,
  obsoleteDownloadPaths,
} from '@/app/sync/imageSources'
import {
  gcNoteImages,
  pullNoteImages,
  pushNoteImages,
} from '@/app/sync/noteImageSync'
import {
  ensureNoteImageDirectory,
  isNoteImageKnownLocal,
  markNoteImagesLocal,
  noteImagePath,
} from '@/lib/richText/noteImages'
import { noteImagesArrived } from '@/lib/richText/noteImageRevision'
import { useUpdateRequired } from '@/lib/appUpdate/updateRequired'
import { referencedNoteImageIds } from '@/stores/noteImages'

const PUSH_DEBOUNCE_MS = 5000

const FOREGROUND_CATCH_UP_MS = 30_000

const REMOTE_CHANGE_DEBOUNCE_MS = 500

const SYNC_FILE_PREFIX = 'witness-work'
const SYNC_FILE_EXT = '.json'

let installed = false
let pushScheduled = false
let pushInFlight: Promise<boolean> | null = null
let editGeneration = 0

let publishedThisLaunch = false

const PUSH_RETRY_DELAYS_MS = [
  5_000,
  20_000,
  60_000,
  2 * 60_000,
  5 * 60_000,
  15 * 60_000,
]
const STORAGE_FULL_RETRY_MS = 15 * 60_000
const RATE_LIMITED_RETRY_MS = 60_000
let pushFailures = 0
let nextPushAllowedAt = 0
let pushRetryTimer: ReturnType<typeof setTimeout> | null = null

export function pushRetryDelayMs(
  failures: number,
  code: SyncTransportErrorCode | null
): number {
  const base =
    PUSH_RETRY_DELAYS_MS[
      Math.min(Math.max(failures, 1), PUSH_RETRY_DELAYS_MS.length) - 1
    ]
  if (code === 'storage-full') return Math.max(base, STORAGE_FULL_RETRY_MS)
  if (code === 'rate-limited') return Math.max(base, RATE_LIMITED_RETRY_MS)
  return base
}

function cancelPushRetry() {
  if (pushRetryTimer) clearTimeout(pushRetryTimer)
  pushRetryTimer = null
}

function resetPushBackoff() {
  cancelPushRetry()
  pushFailures = 0
  nextPushAllowedAt = 0
}

function recordPushFailure(code: SyncTransportErrorCode | null) {
  pushFailures++
  nextPushAllowedAt = Date.now() + pushRetryDelayMs(pushFailures, code)
  armPushRetry()
}

function armPushRetry() {
  if (
    !installed ||
    pushRetryTimer ||
    AppState.currentState !== 'active' ||
    !canSync() ||
    !usePreferences.getState().iCloudSyncPendingPush
  )
    return
  pushRetryTimer = setTimeout(
    () => {
      pushRetryTimer = null
      if (usePreferences.getState().iCloudSyncPendingPush)
        void push('push-retry')
    },
    Math.max(0, nextPushAllowedAt - Date.now())
  )
}

function sizeBucket(chars: number): string {
  if (chars < 100_000) return '<100KB'
  if (chars < 1_000_000) return '<1MB'
  if (chars < 4_000_000) return '<4MB'
  if (chars < 10_000_000) return '<10MB'
  return '>=10MB'
}

type PullOutcome = {
  changed: boolean
  complete: boolean

  ownFile?: boolean | null
}

let lastPullComplete = false

let lastReadFoundFiles = false

let pullInFlight: Promise<PullOutcome> | null = null
let pullQueuedReason: string | null = null

let pullInFlightStartedAt = 0
let completePullStartedAt = -Infinity

let gcInFlight: Promise<void> | null = null

let gcStopRequested = false

const GC_STOP_WAIT_MS = 10_000

const READ_RETRY_DELAYS_MS = [5_000, 20_000, 60_000]
let readRetryTimer: ReturnType<typeof setTimeout> | null = null
let readRetries = 0

const UPLOAD_CHECK_DELAYS_MS = [3_000, 10_000, 30_000, 60_000, 120_000, 300_000]
let uploadCheckTimer: ReturnType<typeof setTimeout> | null = null
let uploadChecks = 0
let uploadCheckInFlight: Promise<UploadVerdict | null> | null = null

let uploadGeneration = 0

let catchUpInFlight = false
let catchUpQueuedReason: string | null = null

let resetInProgress = false
let pullDeferredReason: string | null = null

function filenameForDevice(deviceId: string): string {
  return `${SYNC_FILE_PREFIX}-${deviceId}${SYNC_FILE_EXT}`
}

function isLegacyFilename(filename: string): boolean {
  return !filename.startsWith(`${SYNC_FILE_PREFIX}-`)
}

function isPayloadFilename(filename: string): boolean {
  return !isAccountFilename(filename)
}

const PHOTO_OWNER_FIELD =
  /^(contactStore\.(contacts|deletedContacts)|profileStore)\./

const reportedDroppedFields = new Set<string>()

function reportDroppedFields(filename: string, fields: string[]): void {
  const summary = fields.join(', ')
  logger.warn(`${tag()} pullAndMerge: dropped unreadable entries`, {
    filename,
    fields: summary,
  })
  if (reportedDroppedFields.has(summary)) return
  reportedDroppedFields.add(summary)
  errorTracking.captureMessage('iCloudSync: dropped unreadable entries', {
    level: 'warning',
    fields: summary,
  })
}

const reportedRejections = new Set<string>()

function reportInvalidPayload(
  reason: string,
  file: SyncFile,
  rejection: PayloadRejection | undefined
): void {
  const details = {
    reason: rejection?.reason ?? 'unknown',
    ...(rejection?.issues && { issues: rejection.issues.join(', ') }),
    ...(rejection?.step && { step: rejection.step }),
    ...(rejection?.error && { error: rejection.error }),
  }
  const bytes = new TextEncoder().encode(file.json).length
  logger.warn(`${tag()} pullAndMerge: skipping invalid file`, {
    pull: reason,
    filename: file.filename,
    bytes,
    ...details,
  })
  const key = JSON.stringify(details)
  if (reportedRejections.has(key)) return
  reportedRejections.add(key)
  errorTracking.captureMessage('iCloudSync: invalid remote payload', {
    level: 'warning',
    ...details,
    bytes,
  })
}

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

function ensureDeviceId(): string {
  return ensureSyncDeviceId()
}

function tag(): string {
  const model = Device.modelName
  if (model) return `[iCloudSync/${model}]`
  const id = usePreferences.getState().iCloudDeviceId
  return `[iCloudSync/${id ? id.slice(0, 6) : '?'}]`
}

type PreferencesState = ReturnType<typeof usePreferences.getState>

function setPrefsIfChanged(partial: Partial<PreferencesState>): void {
  const state = usePreferences.getState()
  const keys = Object.keys(partial) as (keyof PreferencesState)[]
  if (keys.every((key) => Object.is(state[key], partial[key]))) return
  usePreferences.setState(partial)
}

export function canSync(): boolean {
  if (!hasSyncTransport()) return false
  const { iCloudSyncEnabled } = usePreferences.getState()
  if (!iCloudSyncEnabled) return false
  if (!syncEntitled()) return false
  if (cloudSyncWaitsForUpdate()) return false
  if (!syncTransport().isAvailable()) return false
  return checkICloudIdentity('can_sync')
}

const cloudSyncWaitsForUpdate = () =>
  usesCloudSync() && useUpdateRequired.getState().required !== null

export function syncEntitled(): boolean {
  if (usesCloudSync())
    return usePreferences.getState().cloudSyncEntitled === true
  return useSupporter.getState().isSupporter
}

const transportHoldsPhotos = () => syncTransport().supportsBinaries !== false

export type ICloudAccount = { token: string | null; changedAt: number | null }

function storedICloudAccount(): ICloudAccount {
  const { iCloudIdentityToken, iCloudAccountChangedAt } =
    usePreferences.getState()
  return { token: iCloudIdentityToken, changedAt: iCloudAccountChangedAt }
}

function isStoredICloudAccount(account: ICloudAccount): boolean {
  const stored = storedICloudAccount()
  return (
    stored.token === account.token && stored.changedAt === account.changedAt
  )
}

export function confirmICloudAccount(
  account: ICloudAccount,
  source: IdentityCheckSource = 'initial_enable'
): boolean {
  return checkICloudIdentity(source) && isStoredICloudAccount(account)
}

export function hasMeaningfulLocalData(): boolean {
  const contacts = useContacts.getState()
  if (contacts.contacts.length > 0) return true
  if (contacts.deletedContacts.length > 0) return true
  if (contacts.customFieldDefs.length > 0) return true
  if (contacts.deletedCustomFieldDefs.length > 0) return true

  const conversations = useConversations.getState()
  if (conversations.conversations.length > 0) return true
  if (conversations.deletedConversations.length > 0) return true
  if (conversations.conversationFieldDefs.length > 0) return true
  if (conversations.deletedConversationFieldDefs.length > 0) return true

  const reports = useServiceReport.getState()
  if (reports.dayPlans.length > 0) return true
  if (reports.recurringPlans.length > 0) return true
  if (reports.deletedServiceReports.length > 0) return true

  if (reports.deletedDayPlans.length > 0) return true
  if (reports.deletedRecurringPlans.length > 0) return true
  for (const year of Object.values(reports.serviceReports)) {
    for (const month of Object.values(year)) {
      if (month.length > 0) return true
    }
  }
  const categories = useCategories.getState()

  if (categories.categories.some((c) => !isSeededBuiltinCategory(c)))
    return true
  if (categories.deletedCategories.length > 0) return true
  if (hasMileageData()) return true
  if (hasPetData()) return true
  return false
}

export function replaceLocalWithRemote(remote: SyncPayload): void {
  const hasPetSlice = remote.petStore !== undefined
  const hasCategorySlice = remote.categoryStore !== undefined
  const hasMileageSlice = remote.mileageStore !== undefined
  remote = foldRemotePayloads([remote])!
  withRemoteDataMutation(() => {
    const deletedCustomFieldDefs =
      remote.contactStore.deletedCustomFieldDefs ?? []
    const deletedCustomFieldIds = new Set(
      deletedCustomFieldDefs.map((tombstone) => tombstone.id)
    )
    useContacts.setState({
      contacts: (remote.contactStore.contacts ?? []).map((contact) =>
        stripTombstonedCustomFields(contact, deletedCustomFieldDefs)
      ),
      deletedContacts: (remote.contactStore.deletedContacts ?? []).map(
        (contact) =>
          stripTombstonedCustomFields(contact, deletedCustomFieldDefs)
      ),
      customFieldDefs: (
        (remote.contactStore.customFieldDefs ?? []) as CustomFieldDefinition[]
      ).filter((def) => !deletedCustomFieldIds.has(def.id)),
      deletedCustomFieldDefs,
    })

    useConversations.setState({
      conversations: remote.conversationStore.conversations ?? [],
      deletedConversations: remote.conversationStore.deletedConversations ?? [],
      conversationFieldDefs: (remote.conversationStore.conversationFieldDefs ??
        []) as CustomFieldDefinition[],
      deletedConversationFieldDefs:
        remote.conversationStore.deletedConversationFieldDefs ?? [],
    })

    const normalizedRemote = migrateNormalizeDates({
      serviceReports: remote.serviceReportStore.serviceReports ?? {},
      dayPlans: remote.serviceReportStore.dayPlans ?? [],
      recurringPlans: remote.serviceReportStore.recurringPlans ?? [],
    })
    useServiceReport.setState({
      serviceReports: normalizedRemote.serviceReports,
      dayPlans: normalizedRemote.dayPlans,
      recurringPlans: normalizedRemote.recurringPlans,
      deletedServiceReports:
        remote.serviceReportStore.deletedServiceReports ?? [],
      deletedDayPlans: remote.serviceReportStore.deletedDayPlans ?? [],
      deletedRecurringPlans:
        remote.serviceReportStore.deletedRecurringPlans ?? [],
    })
    if (hasCategorySlice)
      useCategories.setState({
        categories: (remote.categoryStore?.categories ?? []) as Category[],
        deletedCategories: remote.categoryStore?.deletedCategories ?? [],
      })
    if (hasMileageSlice) applyMileageSnapshot(mileageFromPayload(remote))
    if (hasPetSlice) applyPetSnapshot(petFromPayload(remote))

    const now = Date.now()
    setPrefsIfChanged({
      ...(syncableValues(remote.preferencesStore.values) as any),
      preferenceUpdatedAt: remote.preferencesStore.updatedAt ?? {},
      lastiCloudSyncAt: now,
      lastiCloudPulledAt: now,
      lastiCloudRemoteWrittenAt: remote.writtenAt,
      lastiCloudRemoteDeviceId: remote.deviceId,
      lastiCloudRemoteDeviceName: remote.deviceName ?? null,
      iCloudResetEpoch: remote.resetEpoch ?? null,
    })

    useProfile.setState({
      ...syncableValues(
        remote.profileStore?.values ?? {},
        NON_SYNCABLE_PROFILE_KEYS
      ),
      profileUpdatedAt: remote.profileStore?.updatedAt ?? {},
    })
  })
}

export function joinRemoteResetEpoch(remote: SyncPayload): void {
  setPrefsIfChanged({ iCloudResetEpoch: remote.resetEpoch ?? null })
}

export async function overwriteRemoteWithLocal(): Promise<void> {
  if (resetInProgress) throw new Error('iCloud reset already running')
  resetInProgress = true
  try {
    await overwriteRemoteWithLocalInner()
  } finally {
    resetInProgress = false
    const deferred = pullDeferredReason
    pullDeferredReason = null
    if (deferred) void pull(deferred)
  }
}

async function overwriteRemoteWithLocalInner(): Promise<void> {
  const source = usePreferences.getState().iCloudSyncEnabled
    ? 'can_sync'
    : 'initial_enable'
  if (!checkICloudIdentity(source)) throw new Error('Apple Account changed')
  const account = storedICloudAccount()
  const prefs = usePreferences.getState()
  const previous = {
    iCloudResetEpoch: prefs.iCloudResetEpoch,
    iCloudResetAdoptedNotice: prefs.iCloudResetAdoptedNotice,
    iCloudSyncEnabled: prefs.iCloudSyncEnabled,
    iCloudSyncNeedsResolution: prefs.iCloudSyncNeedsResolution,
    iCloudFreshSetup: prefs.iCloudFreshSetup,
  }
  await calibrateClock()

  while (pushInFlight || pullInFlight)
    await Promise.allSettled([pushInFlight, pullInFlight])
  if (!confirmICloudAccount(account, source))
    throw new Error('Apple Account changed')
  const deviceId = ensureDeviceId()
  const epoch = createResetEpoch({
    now: syncNow(),

    previous: usePreferences.getState().iCloudResetEpoch,
    deviceId,
    deviceName: Device.modelName ?? undefined,
  })

  setPrefsIfChanged({
    iCloudResetEpoch: epoch,
    iCloudResetAdoptedNotice: null,
    iCloudSyncEnabled: true,
    iCloudSyncNeedsResolution: false,
    iCloudFreshSetup: false,
  })
  if (!(await push('overwrite-remote'))) {
    if (isStoredICloudAccount(account)) usePreferences.setState(previous)
    throw new Error('iCloud write failed')
  }
  logger.log(`${tag()} reset published`, { epoch: epoch.id })
  errorTracking.addBreadcrumb({
    category: 'iCloudSync',
    message: 'reset — new generation published',
    level: 'info',
  })
  await reclaimAccountFile(useSupporter.getState().isSupporter)
  await removePreResetFiles(filenameForDevice(deviceId), epoch)
}

async function removePreResetFiles(
  ownFilename: string,
  epoch: ResetEpoch
): Promise<void> {
  try {
    const { files } = await syncTransport().readFiles(
      (filename) => isPayloadFilename(filename) && filename !== ownFilename
    )
    const stale = files
      .filter((file) => {
        const parsed = parsePayload(file.json)
        return parsed && compareResetEpochs(parsed.resetEpoch, epoch) < 0
      })
      .map((file) => file.filename)
    for (const filename of stale)
      await withTransportTimeout('delete', syncTransport().deleteFile(filename))
    logger.log(`${tag()} reset cleanup: payloads`, { deleted: stale.length })
  } catch (e) {
    logger.warn(`${tag()} reset cleanup: payloads failed`, e)
    errorTracking.addBreadcrumb({
      category: 'iCloudSync',
      message: 'reset cleanup — payload delete failed',
      level: 'warning',
    })
  }
  try {
    await deleteUnreferencedCloudPhotos()
  } catch (e) {
    logger.warn(`${tag()} reset cleanup: photos failed`, e)
    errorTracking.addBreadcrumb({
      category: 'iCloudSync',
      message: 'reset cleanup — photo delete failed',
      level: 'warning',
    })
  }
}

function deleteUnreferencedCloudPhotos(): Promise<void> {
  return serializeImages(async () => {
    if (!transportHoldsPhotos()) return
    const keep = new Set<string>()
    const { contacts, deletedContacts } = useContacts.getState()
    for (const contact of [...contacts, ...deletedContacts])
      if (contact.avatar?.type === 'image')
        keep.add(filenameForContact(contact.id, contact.avatar.revision))
    const { avatar } = useProfile.getState()
    if (avatar?.type === 'image') keep.add(filenameForProfile(avatar.revision))
    for (const id of referencedNoteImageIds()) {
      keep.add(filenameForNoteImage(id))
    }
    const deleted: string[] = []
    for (const { filename } of await withTransportTimeout(
      'photo list',
      syncTransport().listBinaryFiles()
    )) {
      if (keep.has(filename)) continue
      await withTransportTimeout(
        'photo delete',
        syncTransport().deleteBinaryFile(filename)
      )
      deleted.push(filename)
    }
    if (deleted.length === 0) return
    const next: ImageSyncBookkeeping = {
      ...(usePreferences.getState().iCloudImageSync ?? {}),
    }
    for (const filename of deleted) delete next[filename]
    setPrefsIfChanged({ iCloudImageSync: next })
    logger.log(`${tag()} reset cleanup: photos`, { deleted: deleted.length })
  })
}

export type RemoteIncompleteReason =
  | 'scan'
  | 'downloading'
  | 'newer-version'
  | 'invalid-file'
  | 'timeout'

export type RemotePeek =
  | { status: 'found'; remote: SyncPayload; account: ICloudAccount }
  | { status: 'none' }
  | { status: 'incomplete'; reason: RemoteIncompleteReason }
  | { status: 'offline' }
  | { status: 'unavailable' }

const PEEK_READ_ATTEMPTS = 2

export const PEEK_DEADLINE_MS = 25_000

function incompletePeek(reason: RemoteIncompleteReason): RemotePeek {
  logger.warn(`${tag()} peekRemotePayload: remote incomplete`, { reason })
  errorTracking.addBreadcrumb({
    category: 'iCloudSync',
    message: `peek — remote incomplete (${reason})`,
    level: 'warning',
  })
  return { status: 'incomplete', reason }
}

export async function peekRemotePayload(): Promise<RemotePeek> {
  if (!hasSyncTransport()) return { status: 'unavailable' }
  if (!syncTransport().isAvailable()) return { status: 'unavailable' }
  checkICloudIdentity('initial_enable')
  const account = storedICloudAccount()
  if (isKnownOffline()) return { status: 'offline' }
  let timer: ReturnType<typeof setTimeout> | undefined
  const peek = await Promise.race([
    readRemotePeek(account),
    new Promise<RemotePeek>((resolve) => {
      timer = setTimeout(
        () => resolve(incompletePeek('timeout')),
        PEEK_DEADLINE_MS
      )
    }),
  ]).finally(() => clearTimeout(timer))
  return confirmICloudAccount(account) ? peek : { status: 'unavailable' }
}

async function readRemotePeek(account: ICloudAccount): Promise<RemotePeek> {
  try {
    if (!(await syncTransport().waitForInitialScan(5000))) {
      return incompletePeek('scan')
    }
    for (let attempt = 1; ; attempt++) {
      const { files, pending } = await syncTransport().readFiles(
        (filename) =>
          isPayloadFilename(filename) &&
          filename !== filenameForDevice(ensureDeviceId())
      )
      const payloads: SyncPayload[] = []
      for (const file of files) {
        const parsed = parsePayload(file.json)
        if (parsed) payloads.push(alignPayloadClock(parsed, file.modifiedAt))
        else if (isNewerPayloadVersion(file.json)) {
          return incompletePeek('newer-version')
        } else {
          return incompletePeek('invalid-file')
        }
      }

      if (!pending?.length) {
        const remote = foldRemotePayloads(payloads)
        return remote
          ? { status: 'found', remote, account }
          : { status: 'none' }
      }
      if (attempt >= PEEK_READ_ATTEMPTS) return incompletePeek('downloading')
    }
  } catch (e) {
    const code = syncTransportErrorCode(e)
    if (
      (code === 'network' && syncTransport().writeConfirmsUpload) ||
      code === 'rate-limited' ||
      isKnownOffline()
    ) {
      logger.warn(`${tag()} peekRemotePayload offline`, e)
      return { status: 'offline' }
    }
    logger.error(`${tag()} peekRemotePayload failed`, e)
    return { status: 'unavailable' }
  }
}

export type InitialEnableDecision =
  | { outcome: 'unavailable' }
  | { outcome: 'incomplete'; reason: RemoteIncompleteReason }
  | { outcome: 'seed' }
  | { outcome: 'pull'; remote: SyncPayload }
  | { outcome: 'conflict'; remote: SyncPayload; account: ICloudAccount }

export async function resolveInitialEnable(): Promise<InitialEnableDecision> {
  if (!hasSyncTransport()) return { outcome: 'unavailable' }
  if (!syncTransport().isAvailable()) return { outcome: 'unavailable' }

  if (!checkICloudIdentity('initial_enable')) return { outcome: 'unavailable' }
  const peek = await peekRemotePayload()
  switch (peek.status) {
    case 'unavailable':
    case 'offline':
      return { outcome: 'unavailable' }
    case 'incomplete':
      return { outcome: 'incomplete', reason: peek.reason }
    case 'none':
      return { outcome: 'seed' }
    case 'found':
      if (!hasMeaningfulLocalData()) {
        return { outcome: 'pull', remote: peek.remote }
      }
      return { outcome: 'conflict', remote: peek.remote, account: peek.account }
  }
}

export async function applySeedEnable(
  source: 'settings' | 'supporter_default' = 'settings'
): Promise<void> {
  backfillUpdatedAtIfNeeded()
  const wasEnabled = usePreferences.getState().iCloudSyncEnabled
  usePreferences.getState().set({
    iCloudSyncEnabled: true,
    iCloudSyncNeedsResolution: false,
    iCloudFreshSetup: false,
  })
  if (!wasEnabled) {
    analytics.capture('icloud_sync_enabled_changed', { enabled: true, source })
  }
  if (!(await push('initial-enable-seed')))
    throw new Error('iCloud write failed')
}

export function applyPullEnable(
  remote: SyncPayload,
  source: 'settings' | 'supporter_default' = 'settings'
): void {
  replaceLocalWithRemote(remote)
  const wasEnabled = usePreferences.getState().iCloudSyncEnabled
  usePreferences.getState().set({
    iCloudSyncEnabled: true,
    iCloudSyncNeedsResolution: false,
    iCloudFreshSetup: false,
  })
  if (!wasEnabled) {
    analytics.capture('icloud_sync_enabled_changed', { enabled: true, source })
  }
}

function buildImageSyncDeps(oneShot = false): ImageSyncDeps {
  return {
    canTransfer: () =>
      usePreferences.getState().iCloudSyncIncludeImages &&
      transportHoldsPhotos() &&
      syncTransport().isAvailable() &&
      (oneShot || canSync()),
    bridge: {
      writeBinary: (filename, sourcePath) =>
        withTransportTimeout(
          'photo upload',
          syncTransport().writeBinary(filename, sourcePath)
        ),
      readBinary: (filename, destinationPath) =>
        withTransportTimeout(
          'photo download',
          syncTransport().readBinary(filename, destinationPath)
        ),
      listBinaryFiles: () =>
        withTransportTimeout('photo list', syncTransport().listBinaryFiles()),
      deleteBinaryFile: (filename) =>
        withTransportTimeout(
          'photo delete',
          syncTransport().deleteBinaryFile(filename)
        ),
    },
    fs: {
      getModifiedAt: async (path) => {
        const info = await FileSystem.getInfoAsync(path)
        if (!info.exists) return null
        return typeof info.modificationTime === 'number'
          ? info.modificationTime * 1000
          : Date.now()
      },
    },
    now: () => syncNow(),
  }
}

let imageWork: Promise<void> = Promise.resolve()
function serializeImages<T>(work: () => Promise<T>): Promise<T> {
  const result = imageWork.then(work)
  imageWork = result.then(
    () => undefined,
    () => undefined
  )
  return result
}
const DOCUMENT_DIR = FileSystem.documentDirectory ?? ''

let imagePushJob: Promise<void> | null = null
let queuedImagePush: {
  trigger: 'store-edit' | 'foreground'
  sources?: AvatarSource[]
} | null = null

function startImagePush(
  trigger: 'store-edit' | 'foreground',
  sources?: AvatarSource[]
): void {
  if (imagePushJob) {
    queuedImagePush = { trigger, sources }
    return
  }
  imagePushJob = pushImagesIfEnabled(trigger, sources).finally(() => {
    imagePushJob = null
    const next = queuedImagePush
    queuedImagePush = null
    if (next) startImagePush(next.trigger, next.sources)
  })
}

async function imagePushesSettled(): Promise<void> {
  while (imagePushJob) await imagePushJob
}

function pushImagesIfEnabled(
  trigger: 'store-edit' | 'foreground',
  publishedSources?: AvatarSource[]
): Promise<void> {
  return serializeImages(async () => {
    await pushImagesInner(trigger, publishedSources)
    await pushNoteImagesInner(!!publishedSources)
  })
}

async function pushNoteImagesInner(published: boolean): Promise<void> {
  const prefs = usePreferences.getState()
  if (!transportHoldsPhotos()) return
  if (!prefs.iCloudSyncIncludeImages || !canSync()) return
  if (!published && prefs.iCloudSyncPendingPush) return
  if (!hasSyncTransport()) return
  const ids = referencedNoteImageIds()
  if (!ids.size) return
  try {
    const result = await pushNoteImages({
      ids,
      localPath: noteImagePath,
      bookkeeping: prefs.iCloudImageSync ?? {},
      deps: buildImageSyncDeps(),
    })
    if (!result.uploaded && !result.failed) return
    setPrefsIfChanged({ iCloudImageSync: result.bookkeeping })
    logger.log(`${tag()} note photo push`, {
      uploaded: result.uploaded,
      failed: result.failed,
    })
  } catch (e) {
    logger.error(`${tag()} note photo push failed`, e)
    errorTracking.captureException(e, { iCloudSync: 'note-image-push' })
  }
}

async function pullNoteImagesInner(oneShot: boolean): Promise<void> {
  const prefs = usePreferences.getState()
  if (!transportHoldsPhotos()) return
  if (!prefs.iCloudSyncIncludeImages) return
  if (!hasSyncTransport()) return
  if (!oneShot && !canSync()) return
  const deps = buildImageSyncDeps(oneShot)
  const ids: string[] = []
  for (const id of referencedNoteImageIds()) {
    if (isNoteImageKnownLocal(id)) continue
    if ((await deps.fs.getModifiedAt(noteImagePath(id))) != null) {
      markNoteImagesLocal([id])
      continue
    }
    ids.push(id)
  }
  if (!ids.length) return
  try {
    const result = await pullNoteImages({
      ids,
      localPath: noteImagePath,
      deps,
      prepare: ensureNoteImageDirectory,
    })
    markNoteImagesLocal(result.downloaded)
    if (result.downloaded.length) noteImagesArrived()
    if (result.downloaded.length || result.failed) {
      logger.log(`${tag()} note photo pull`, {
        downloaded: result.downloaded.length,
        failed: result.failed,
      })
    }
  } catch (e) {
    logger.error(`${tag()} note photo pull failed`, e)
    errorTracking.captureException(e, { iCloudSync: 'note-image-pull' })
  }
}
async function pushImagesInner(
  trigger: 'store-edit' | 'foreground',
  publishedSources?: AvatarSource[]
): Promise<void> {
  const prefs = usePreferences.getState()
  if (!transportHoldsPhotos()) return
  if (!prefs.iCloudSyncIncludeImages || !canSync()) return
  if (!publishedSources && prefs.iCloudSyncPendingPush) return
  if (!hasSyncTransport()) return
  try {
    const sources =
      publishedSources ??
      collectLocalAvatarSources({
        contacts: useContacts.getState().contacts,
        profileAvatar: useProfile.getState().avatar,
        profileUpdatedAt: useProfile.getState().profileUpdatedAt.avatar,
        documentDirectory: DOCUMENT_DIR,
      })
    if (sources.length === 0) return
    const deps = buildImageSyncDeps()
    const result = await pushAllImages({
      sources,
      bookkeeping: prefs.iCloudImageSync ?? {},
      deps,
      trigger,
    })
    setPrefsIfChanged({ iCloudImageSync: result.bookkeeping })

    const firstError = Object.values(result.bookkeeping).find(
      (e) => e.lastError
    )?.lastError
    logger.log(`${tag()} image push`, {
      trigger,
      uploaded: result.uploaded,
      failed: result.failed,
      skipped: result.skipped,
      ...(firstError ? { firstError } : {}),
    })
  } catch (e) {
    logger.error(`${tag()} image push failed`, e)
    errorTracking.captureException(e, { iCloudSync: 'image-push' })
  }
}

let materializingImages = false
function pullImagesIfEnabled(oneShot = false): Promise<void> {
  return serializeImages(async () => {
    await pullImagesInner(oneShot)
    await pullNoteImagesInner(oneShot)
  })
}
async function pullImagesInner(oneShot = false): Promise<void> {
  const prefs = usePreferences.getState()
  if (!transportHoldsPhotos()) return
  if (!prefs.iCloudSyncIncludeImages) return
  if (!hasSyncTransport()) return
  if (!oneShot && !canSync()) return
  try {
    const sources = collectExpectedMarkerSources({
      contacts: useContacts.getState().contacts,
      profileAvatar: useProfile.getState().avatar,
      profileUpdatedAt: useProfile.getState().profileUpdatedAt.avatar,
      documentDirectory: DOCUMENT_DIR,
    })
    if (sources.length === 0) return
    const deps = buildImageSyncDeps(oneShot)
    const result = await pullMissingImages({
      expectedSources: sources,
      bookkeeping: prefs.iCloudImageSync ?? {},
      deps,
    })
    if (result.failed > 0) {
      logger.warn(`${tag()} image pull: downloads failed`, {
        failed: result.failed,
      })
    }
    if (result.downloaded.length === 0) {
      setPrefsIfChanged({ iCloudImageSync: result.bookkeeping })
      return
    }
    const contactsState = useContacts.getState()
    const profileState = useProfile.getState()
    const applied = usePreferences.getState().iCloudSyncIncludeImages
      ? applyDownloadedAvatars({
          contacts: contactsState.contacts,
          profileAvatar: profileState.avatar,
          profileUpdatedAt: profileState.profileUpdatedAt.avatar,
          downloaded: result.downloaded,
        })
      : { contacts: contactsState.contacts, profileAvatar: profileState.avatar }

    if (applied.contacts !== contactsState.contacts) {
      materializingImages = true
      try {
        contactsState.set({ contacts: applied.contacts })
      } finally {
        materializingImages = false
      }
    }
    if (
      applied.profileAvatar &&
      applied.profileAvatar !== profileState.avatar
    ) {
      useProfile.setState({ avatar: applied.profileAvatar })
    }
    const deletedPaths = new Set<string>()
    for (const download of result.downloaded) {
      const obsolete = obsoleteDownloadPaths({
        contacts: useContacts.getState().contacts,
        deletedContacts: useContacts.getState().deletedContacts,
        profileAvatar: useProfile.getState().avatar,
        downloaded: [download],
        documentDirectory: DOCUMENT_DIR,
      })
      for (const path of obsolete) {
        if (deletedPaths.has(path)) continue
        await FileSystem.deleteAsync(path, { idempotent: true })
        deletedPaths.add(path)
      }
    }

    for (const download of result.downloaded) {
      if (deletedPaths.has(download.localUri.split('?')[0]))
        delete result.bookkeeping[
          filenameForSource({ ...download, localPath: '' })
        ]
    }
    setPrefsIfChanged({ iCloudImageSync: result.bookkeeping })
    logger.log(`${tag()} image pull`, {
      downloaded: result.downloaded.length,
      missing: result.missing.length,
    })
  } catch (e) {
    logger.error(`${tag()} image pull failed`, e)
    errorTracking.captureException(e, { iCloudSync: 'image-pull' })
  }
}

function gcImagesIfEnabled(): Promise<void> {
  if (gcInFlight) return gcInFlight
  if (pullInFlight) return Promise.resolve()
  gcStopRequested = false
  gcInFlight = serializeImages(gcImages).finally(() => {
    gcInFlight = null
  })
  return gcInFlight
}

const sameIds = (a: Set<string>, b: Set<string>) =>
  a.size === b.size && [...a].every((id) => b.has(id))

async function gcImages(): Promise<void> {
  const prefs = usePreferences.getState()
  if (!transportHoldsPhotos()) return
  if (!prefs.iCloudSyncIncludeImages) return
  if (!hasSyncTransport()) return
  try {
    const { contacts } = useContacts.getState()
    const { avatar } = useProfile.getState()
    const active: ActiveIdentity[] = contacts
      .filter((c) => c.avatar?.type === 'image')
      .map((c) => ({ kind: 'contact', id: c.id, revision: c.avatar?.revision }))
    if (avatar?.type === 'image') {
      active.push({ kind: 'profile', revision: avatar.revision })
    }
    const deps = buildImageSyncDeps()
    const result = await gcOrphanImages({
      activeIdentities: active,
      deletions: [
        ...useContacts.getState().deletedContacts.map((c) => ({
          identity: { kind: 'contact' as const, id: c.id },
          deletedAt: c.updatedAt ?? 0,
        })),
        ...contacts
          .filter((c) => c.updatedAt && c.updatedAt > 1 && c.avatar)
          .map((c) => ({
            identity: { kind: 'contact' as const, id: c.id },
            deletedAt: c.updatedAt!,
          })),
        ...(useProfile.getState().profileUpdatedAt.avatar
          ? [
              {
                identity: { kind: 'profile' as const },
                deletedAt: useProfile.getState().profileUpdatedAt.avatar,
              },
            ]
          : []),
      ],
      deps,

      shouldStop: () =>
        gcStopRequested ||
        useContacts.getState().contacts !== contacts ||
        useProfile.getState().avatar !== avatar,
    })
    if (result.stopped) {
      logger.log(`${tag()} image gc stopped early`, {
        deleted: result.deleted.length,
      })
    }

    const referenced = referencedNoteImageIds()
    const notes = result.stopped
      ? { deleted: [], stopped: true }
      : await gcNoteImages({
          referenced,
          deps,
          shouldStop: () =>
            gcStopRequested || !sameIds(referencedNoteImageIds(), referenced),
        })
    const deletedFiles = [...result.deleted, ...notes.deleted]
    if (deletedFiles.length > 0) {
      const next: ImageSyncBookkeeping = {
        ...(usePreferences.getState().iCloudImageSync ?? {}),
      }
      for (const filename of deletedFiles) delete next[filename]
      setPrefsIfChanged({ iCloudImageSync: next })
      logger.log(`${tag()} image gc`, {
        deleted: result.deleted.length,
        notePhotos: notes.deleted.length,
      })
    }
  } catch (e) {
    logger.error(`${tag()} image gc failed`, e)
    errorTracking.captureException(e, { iCloudSync: 'image-gc' })
  }
}

export function push(reason: string): Promise<boolean> {
  if (pushInFlight) return pushInFlight
  let succeeded = false
  pushInFlight = pushInner(reason)
    .then((result) => {
      succeeded = result
      return result
    })
    .finally(() => {
      pushInFlight = null

      if (
        succeeded &&
        usePreferences.getState().iCloudSyncPendingPush &&
        canSync()
      )
        schedulePush()
    })
  return pushInFlight
}
async function calibrateClock(): Promise<void> {
  const offset = await refreshSyncClock()
  if (offset !== null)
    setPrefsIfChanged({
      iCloudClockOffsetMs: offset,
      iCloudClockCalibrated: true,
    })
}

async function pushInner(reason: string): Promise<boolean> {
  perf.count('sync:push')
  if (!canSync()) {
    setPrefsIfChanged({ iCloudSyncPendingPush: true })
    logger.log(`${tag()} push skipped (canSync=false)`, { reason })
    return false
  }

  try {
    await calibrateClock()
    if (!canSync()) {
      setPrefsIfChanged({ iCloudSyncPendingPush: true })
      return false
    }
    const generation = editGeneration
    const deviceId = ensureDeviceId()
    const filename = filenameForDevice(deviceId)
    const imageSources = collectLocalAvatarSources({
      contacts: useContacts.getState().contacts,
      profileAvatar: useProfile.getState().avatar,
      documentDirectory: DOCUMENT_DIR,
    })
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
      deletedDayPlans: payload.serviceReportStore.deletedDayPlans?.length ?? 0,
      deletedRecurringPlans:
        payload.serviceReportStore.deletedRecurringPlans?.length ?? 0,
      preferenceKeys: Object.keys(payload.preferencesStore.values).length,
    })
    const transport = syncTransport()
    await withTransportTimeout(
      'write',
      transport.write(filename, json),
      transport.writeTimeoutMs
    )
    const covered = generation === editGeneration
    const now = Date.now()
    const prefs = usePreferences.getState()
    const confirmsUpload = syncTransport().writeConfirmsUpload

    const awaitsUpload =
      !confirmsUpload && syncTransport().supportsUploadStatus()

    setPrefsIfChanged({
      iCloudSyncPendingPush: !covered,
      lastiCloudSyncAt: now,
      lastiCloudPushedAt: now,
      ...(prefs.iCloudSyncIssue === 'push-failed' && {
        iCloudSyncIssue: null,
        iCloudSyncErrorCode: null,
      }),

      ...(confirmsUpload && uploadedAt(now)),

      ...(awaitsUpload &&
        prefs.iCloudUploadPendingSince === null && {
          iCloudUploadPendingSince: now,
        }),
    })
    if (confirmsUpload) reportUploadRecovered(prefs.iCloudUploadIssue)
    else if (awaitsUpload) {
      uploadGeneration++
      restartUploadChecks()
    }
    resetPushBackoff()
    publishedThisLaunch = true
    if (!covered) schedulePush()
    logger.log(`${tag()} push success`, { reason, filename })
    errorTracking.addBreadcrumb({
      category: 'iCloudSync',
      message: `push (${reason}) ${sizeBucket(json.length)}`,
      level: 'info',
    })

    startImagePush(
      reason === 'foreground' ? 'foreground' : 'store-edit',
      imageSources
    )
    return true
  } catch (e) {
    const code = syncTransportErrorCode(e)
    if (isExpectedTransportFailure(e)) {
      logger.warn(`${tag()} push failed (${reason})`, e)
      errorTracking.addBreadcrumb({
        category: 'iCloudSync',
        message: `push (${reason}) failed: ${syncTransportErrorCode(e)}`,
        level: 'warning',
      })
    } else {
      logger.error(`${tag()} push failed (${reason})`, e)
      errorTracking.captureException(e, { iCloudSync: 'push' })
    }
    setPrefsIfChanged({
      iCloudSyncPendingPush: true,
      iCloudSyncIssue: 'push-failed',
      iCloudSyncErrorCode: code ?? 'unknown',
    })

    if (code === 'storage-full') recordUploadIssue()
    recordPushFailure(code)
    return false
  }
}

function isExpectedTransportFailure(error: unknown): boolean {
  const code = syncTransportErrorCode(error)
  return code !== null && code !== 'unknown' && code !== 'not-found'
}

const uploadedAt = (at: number) => ({
  lastiCloudUploadedAt: at,
  iCloudUploadPendingSince: null,
  iCloudUploadIssue: null,
})

function reportUploadRecovered(
  previousIssue: PreferencesState['iCloudUploadIssue']
): void {
  if (!previousIssue) return
  logger.log(`${tag()} upload recovered`, { previousIssue })
  analytics.capture('icloud_sync_upload_recovered', {
    previous_issue: analyticsReason(previousIssue),
  })
}

function recordUploadIssue(): void {
  if (usePreferences.getState().iCloudUploadIssue === 'icloud-full') return
  setPrefsIfChanged({ iCloudUploadIssue: 'icloud-full' })
  analytics.capture('icloud_sync_upload_failed', {
    reason: analyticsReason('icloud-full'),
  })
}

function awaitingUpload(): boolean {
  const prefs = usePreferences.getState()
  return prefs.iCloudUploadPendingSince !== null || !!prefs.iCloudUploadIssue
}

function cancelUploadChecks(): void {
  if (uploadCheckTimer) clearTimeout(uploadCheckTimer)
  uploadCheckTimer = null
  uploadChecks = 0
}

function restartUploadChecks(): void {
  cancelUploadChecks()
  scheduleUploadCheck()
}

function scheduleUploadCheck(): void {
  if (syncTransport().writeConfirmsUpload) return
  if (!installed || uploadCheckTimer || !awaitingUpload()) return
  if (AppState.currentState !== 'active' || !canSync()) return
  const delay = UPLOAD_CHECK_DELAYS_MS[uploadChecks++]
  if (delay === undefined) return
  uploadCheckTimer = setTimeout(() => {
    uploadCheckTimer = null
    void checkUpload().then((verdict) => {
      if (verdict !== 'uploaded') scheduleUploadCheck()
    })
  }, delay)
}

export function checkUpload(): Promise<UploadVerdict | null> {
  if (uploadCheckInFlight) return uploadCheckInFlight
  uploadCheckInFlight = checkUploadInner().finally(() => {
    uploadCheckInFlight = null
  })
  return uploadCheckInFlight
}

async function checkUploadInner(): Promise<UploadVerdict | null> {
  if (syncTransport().writeConfirmsUpload) return null
  if (!awaitingUpload() || !canSync()) return null
  if (!syncTransport().supportsUploadStatus()) {
    setPrefsIfChanged({
      iCloudUploadPendingSince: null,
      iCloudUploadIssue: null,
    })
    return null
  }
  const generation = uploadGeneration
  let status: UploadStatus | null
  try {
    status = await syncTransport().uploadStatus(
      filenameForDevice(ensureDeviceId())
    )
  } catch (e) {
    logger.warn(`${tag()} upload status unavailable`, e)
    return null
  }

  if (!status || !canSync()) return null
  const verdict = classifyUploadStatus(status)
  const previousIssue = usePreferences.getState().iCloudUploadIssue
  switch (verdict) {
    case 'uploaded':
      if (generation !== uploadGeneration) return 'waiting'
      cancelUploadChecks()
      setPrefsIfChanged(uploadedAt(Date.now()))
      reportUploadRecovered(previousIssue)
      break
    case 'icloud-full':
    case 'upload-failed':
      if (previousIssue === verdict) break
      setPrefsIfChanged({ iCloudUploadIssue: verdict })
      logger.warn(`${tag()} upload failed`, { verdict, error: status.error })
      errorTracking.addBreadcrumb({
        category: 'iCloudSync',
        message: `upload failed (${verdict})`,
        level: 'warning',
      })
      analytics.capture('icloud_sync_upload_failed', {
        reason: analyticsReason(verdict),
      })
      break
    case 'unreachable':
      logger.log(`${tag()} upload waiting: iCloud unreachable`)
      break
    case 'waiting':
      break
  }
  return verdict
}

const analyticsReason = (issue: 'icloud-full' | 'upload-failed') =>
  issue === 'icloud-full' ? 'icloud_full' : 'other'

const debouncedPush = debounce(
  () => {
    pushScheduled = false

    if (!usePreferences.getState().iCloudSyncPendingPush) {
      perf.count('sync:push-skipped')
      return
    }
    void push('store-change')
  },
  PUSH_DEBOUNCE_MS,
  { leading: false, trailing: true }
)

function schedulePush() {
  editGeneration++
  setPrefsIfChanged({ iCloudSyncPendingPush: true })
  if (!canSync()) {
    return
  }

  if (Date.now() < nextPushAllowedAt) {
    armPushRetry()
    return
  }
  pushScheduled = true
  debouncedPush()
}

class ICloudReadError extends Error {}

export async function pullAndMerge(reason: string): Promise<boolean> {
  return (await pull(reason)).changed
}

export async function pullBeforeCalendarPublish(): Promise<void> {
  const check = (outcome: PullOutcome) => {
    if (!outcome.complete)
      throw new ICloudReadError('iCloud data could not be fully read')
  }
  if (!canSync()) throw new ICloudReadError('iCloud data sync unavailable')
  if (!(await syncTransport().waitForInitialScan()))
    throw new ICloudReadError('iCloud data scan incomplete')

  const since = lastForegroundAt()
  const fresh = pullInFlight
    ? pullInFlightStartedAt >= since
    : completePullStartedAt >= since
  if (!fresh) check(await pull('calendar-publish'))
  while (pullInFlight) check(await pullInFlight)
  if (!canSync()) throw new ICloudReadError('iCloud data sync unavailable')
}

function pull(reason: string): Promise<PullOutcome> {
  if (resetInProgress) {
    pullDeferredReason ??= reason

    lastPullComplete = false
    return Promise.resolve({ changed: false, complete: false })
  }
  if (pullInFlight) {
    if (!pullQueuedReason) pullQueuedReason = reason
    return pullInFlight
  }
  const startedAt = Date.now()
  pullInFlightStartedAt = startedAt

  pullInFlight = Promise.resolve().then(async () => {
    try {
      if (gcInFlight) {
        gcStopRequested = true
        await Promise.race([
          gcInFlight,
          new Promise((resolve) => setTimeout(resolve, GC_STOP_WAIT_MS)),
        ])
      }
      lastReadFoundFiles = false
      const outcome = await pullAndMergeInner(reason)
      lastPullComplete = outcome.complete
      if (outcome.complete) completePullStartedAt = startedAt
      if (outcome.complete && lastReadFoundFiles) markCompleteICloudPull()
      return outcome
    } finally {
      const queued = pullQueuedReason
      pullQueuedReason = null
      pullInFlight = null
      if (queued) void pull(queued)
    }
  })
  return pullInFlight
}

function scheduleReadRetry(): void {
  if (!installed || readRetryTimer) return
  if (AppState.currentState !== 'active' || !canSync()) return
  const delay = READ_RETRY_DELAYS_MS[readRetries]
  if (delay === undefined) {
    logger.warn(`${tag()} read retries exhausted`)
    return
  }
  readRetries++
  readRetryTimer = setTimeout(() => {
    readRetryTimer = null
    if (AppState.currentState !== 'active' || !canSync()) return
    void pull('read-retry')
  }, delay)
}

function cancelReadRetry(): void {
  if (readRetryTimer) clearTimeout(readRetryTimer)
  readRetryTimer = null
  readRetries = 0
}

function canApplyPull(reason: string): boolean {
  if (resetInProgress) {
    pullDeferredReason ??= reason
    return false
  }
  return canSync()
}

async function pullAndMergeInner(reason: string): Promise<PullOutcome> {
  perf.count('sync:pull')
  if (!canSync()) {
    logger.log(`${tag()} pullAndMerge skipped (canSync=false)`, { reason })
    return { changed: false, complete: false }
  }

  logger.log(`${tag()} pullAndMerge start`, { reason })

  const deviceId = ensureDeviceId()
  const ownFilename = filenameForDevice(deviceId)

  const seenAt = nextReadStamp()
  let read: SyncRead
  try {
    read = await withTransportTimeout(
      'read',
      syncTransport().readFiles(isPayloadFilename),
      TRANSPORT_READ_TIMEOUT_MS
    )
  } catch (e) {
    const expected = isExpectedTransportFailure(e)
    if (expected) logger.warn(`${tag()} read failed (${reason})`, e)
    else logger.error(`${tag()} read failed (${reason})`, e)

    if (readRetries === 0 && !expected) {
      errorTracking.captureException(e, { iCloudSync: 'pull' })
    }
    setPrefsIfChanged({
      iCloudSyncIssue: 'read-failed',
      iCloudSyncErrorCode: syncTransportErrorCode(e) ?? 'unknown',
    })
    scheduleReadRetry()
    return { changed: false, complete: false, ownFile: null }
  }
  cancelReadRetry()
  let issue: 'newer-version' | 'invalid-file' | 'read-failed' | null = null
  const { files, pending } = read
  lastReadFoundFiles = files.length > 0

  const ownFile =
    files.some((f) => f.filename === ownFilename) ||
    (pending ?? []).includes(ownFilename)
  let complete = (pending?.length ?? 0) === 0
  if (!complete) {
    issue = 'read-failed'
    scheduleReadRetry()
  }

  logger.log(`${tag()} pullAndMerge: read`, {
    reason,
    totalFiles: files.length,
    filenames: files.map((f) => f.filename),
    pending,
  })

  if (files.length === 0) {
    usePreferences.getState().set({
      lastiCloudPulledAt: Date.now(),
      iCloudSyncIssue: issue,
      iCloudSyncErrorCode: null,
    })
    logger.log(`${tag()} pullAndMerge: no remote files`, { reason })
    errorTracking.addBreadcrumb({
      category: 'iCloudSync',
      message: `pull (${reason}) — no remote`,
      level: 'info',
    })
    return { changed: false, complete, ownFile }
  }

  let remotePayloads: Array<{
    payload: SyncPayload
    filename: string
    modifiedAt: number
  }> = []
  const legacyFilenames: string[] = []
  const unparsed: SyncDeviceFiles = {}
  for (const file of files) {
    if (file.filename === ownFilename) continue
    let dropped: string[] = []
    let rejection: PayloadRejection | undefined
    const parsed = parsePayload(
      file.json,
      (fields) => (dropped = fields),
      (rejected) => (rejection = rejected)
    )
    if (dropped.length) {
      reportDroppedFields(file.filename, dropped)

      if (dropped.some((field) => PHOTO_OWNER_FIELD.test(field)))
        complete = false
    }
    if (!parsed) {
      unparsed[file.filename] = unparsedDeviceFile(file, seenAt)
      complete = false
      issue = isNewerPayloadVersion(file.json)
        ? 'newer-version'
        : (issue ?? 'invalid-file')
      if (isNewerPayloadVersion(file.json)) {
        logger.warn(`${tag()} pullAndMerge: skipping newer payload version`, {
          reason,
          filename: file.filename,
        })
        errorTracking.addBreadcrumb({
          category: 'iCloudSync',
          message: `pull (${reason}) — skipped newer payload version; image GC paused`,
          level: 'warning',
        })
        continue
      }
      reportInvalidPayload(reason, file, rejection)
      continue
    }
    remotePayloads.push({
      payload: alignPayloadClock(parsed, file.modifiedAt),
      filename: file.filename,
      modifiedAt: file.modifiedAt,
    })
    if (isLegacyFilename(file.filename)) {
      legacyFilenames.push(file.filename)
    }
  }

  const localEpoch = usePreferences.getState().iCloudResetEpoch
  const newestEpoch = newestResetEpoch(
    remotePayloads.map((r) => r.payload.resetEpoch)
  )
  recordDeviceFiles({
    read,
    ownFilename,
    deviceId,
    remotePayloads,
    unparsed,
    epoch: newestResetEpoch([newestEpoch, localEpoch]),
    seenAt,
  })
  if (compareResetEpochs(newestEpoch, localEpoch) > 0) {
    if (!canApplyPull(reason))
      return { changed: false, complete: false, ownFile }
    return adoptResetEpoch(
      reason,
      remotePayloads
        .filter(
          (r) => compareResetEpochs(r.payload.resetEpoch, newestEpoch) === 0
        )
        .map((r) => r.payload),
      complete,
      issue
    )
  }
  const preReset = remotePayloads.filter(
    (r) => compareResetEpochs(r.payload.resetEpoch, localEpoch) < 0
  )
  if (preReset.length > 0) {
    logger.log(`${tag()} pullAndMerge: ignoring pre-reset payloads`, {
      reason,
      filenames: preReset.map((r) => r.filename),
    })
    errorTracking.addBreadcrumb({
      category: 'iCloudSync',
      message: `pull (${reason}) — ignored ${preReset.length} pre-reset payload(s)`,
      level: 'info',
    })
    remotePayloads = remotePayloads.filter((r) => !preReset.includes(r))
  }

  let freshest: (typeof remotePayloads)[number] | null = null
  for (const r of remotePayloads) {
    if (!freshest || r.modifiedAt > freshest.modifiedAt) {
      freshest = r
    }
  }

  const now = syncNow()
  usePreferences.getState().set({
    lastiCloudPulledAt: now,
    iCloudSyncIssue: issue,
    iCloudSyncErrorCode: null,
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

    return { changed: false, complete, ownFile }
  }

  if (!canApplyPull(reason)) return { changed: false, complete: false, ownFile }

  const local = localMergeState()

  logger.log(`${tag()} pullAndMerge: local snapshot`, {
    reason,
    contacts: local.contacts.length,
    deletedContacts: local.deletedContacts.length,
    conversations: local.conversations.length,
    deletedConversations: local.deletedConversations.length,
    serviceReports: countReports(local.serviceReports),
    dayPlans: local.dayPlans.length,
    recurringPlans: local.recurringPlans.length,
    deletedDayPlans: local.deletedDayPlans.length,
    deletedRecurringPlans: local.deletedRecurringPlans.length,
    preferenceUpdatedAtKeys: Object.keys(local.preferenceUpdatedAt).length,
  })

  const { changed: anyChanged, merged: acc } = mergePayloadsInto(
    local,
    remotePayloads.map((r) => r.payload)
  )

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
    deletedDayPlans: acc.deletedDayPlans.length,
    deletedRecurringPlans: acc.deletedRecurringPlans.length,
  })

  if (!anyChanged) {
    await pullImagesIfEnabled()
    return { changed: false, complete, ownFile }
  }

  applyMergedState(acc)
  setPrefsIfChanged({
    lastiCloudSyncAt: Date.now(),
    lastiCloudPulledAt: Date.now(),
  })

  logger.log(`${tag()} pullAndMerge: applied merge to stores`, {
    reason,
    contactsNow: useContacts.getState().contacts.length,
    conversationsNow: useConversations.getState().conversations.length,
    serviceReportsNow: countReports(useServiceReport.getState().serviceReports),
  })

  errorTracking.addBreadcrumb({
    category: 'iCloudSync',
    message: `pull (${reason}) — merged changes`,
    level: 'info',
  })

  await pullImagesIfEnabled()

  return { changed: true, complete, ownFile }
}

let lastReadStamp = 0
function nextReadStamp(): number {
  lastReadStamp = Math.max(Date.now(), lastReadStamp + 1)
  return lastReadStamp
}

function unparsedDeviceFile(file: SyncFile, seenAt: number): SyncDeviceFile {
  return {
    deviceId: deviceIdFromSyncFilename(file.filename),
    deviceName: null,
    writtenAt: null,
    modifiedAt: file.modifiedAt,
    status: isNewerPayloadVersion(file.json) ? 'newer-version' : 'unreadable',
    seenAt,
  }
}

function recordDeviceFiles(args: {
  read: SyncRead
  ownFilename: string
  deviceId: string
  remotePayloads: Array<{
    payload: SyncPayload
    filename: string
    modifiedAt: number
  }>
  unparsed: SyncDeviceFiles
  epoch: ResetEpoch | null
  seenAt: number
}): void {
  if (!canSync()) return
  const { read, ownFilename, seenAt } = args
  const observed: SyncDeviceFiles = { ...args.unparsed }
  const own = read.files.find((file) => file.filename === ownFilename)
  if (own) {
    observed[ownFilename] = {
      deviceId: args.deviceId,
      deviceName: Device.modelName ?? null,
      writtenAt: null,
      modifiedAt: own.modifiedAt,
      status: 'ok',
      seenAt,
    }
  }
  for (const r of args.remotePayloads) {
    observed[r.filename] = {
      deviceId: r.payload.deviceId ?? null,
      deviceName: r.payload.deviceName ?? null,
      writtenAt: r.payload.writtenAt,
      modifiedAt: r.modifiedAt,
      status:
        compareResetEpochs(r.payload.resetEpoch, args.epoch) < 0
          ? 'pre-reset'
          : 'ok',
      seenAt,
    }
  }
  setPrefsIfChanged({
    iCloudSyncDevices: mergeSyncDeviceFiles(
      usePreferences.getState().iCloudSyncDevices ?? {},
      observed,

      Array.isArray(read.pending) && read.pending.length === 0
    ),
  })
}

export type RemoveSyncDeviceOutcome =
  | 'removed'
  | 'sync-first'
  | 'update-app'
  | 'unavailable'

export async function removeSyncDevice(filename: string): Promise<{
  outcome: RemoveSyncDeviceOutcome
  entry: SyncDeviceFile | null
}> {
  if (!canSync()) return { outcome: 'unavailable', entry: null }
  if (
    filename === filenameForDevice(ensureDeviceId()) ||
    !isPayloadFilename(filename) ||
    !filename.startsWith(SYNC_FILE_PREFIX) ||
    !filename.endsWith(SYNC_FILE_EXT)
  )
    throw new Error('Not another device’s sync file')
  const since = nextReadStamp()
  await pull('remove-device')

  while (pullInFlight) await pullInFlight
  if (!canSync()) return { outcome: 'unavailable', entry: null }
  const entry = usePreferences.getState().iCloudSyncDevices?.[filename] ?? null
  if (!entry) return { outcome: 'removed', entry: null }
  const decision = syncDeviceRemoval(entry, {
    complete: lastPullComplete,
    issue: usePreferences.getState().iCloudSyncIssue,
    since,
  })
  if (decision !== 'allowed') {
    logger.log(`${tag()} device removal blocked`, { filename, decision })
    return { outcome: decision, entry }
  }
  await withTransportTimeout('delete', syncTransport().deleteFile(filename))
  const { [filename]: _removed, ...rest } =
    usePreferences.getState().iCloudSyncDevices ?? {}
  setPrefsIfChanged({ iCloudSyncDevices: rest })
  logger.log(`${tag()} device removed`, { filename, status: entry.status })
  errorTracking.addBreadcrumb({
    category: 'iCloudSync',
    message: `device file removed (${entry.status})`,
    level: 'info',
  })
  return { outcome: 'removed', entry }
}

async function adoptResetEpoch(
  reason: string,
  payloads: SyncPayload[],
  complete: boolean,
  issue: 'newer-version' | 'invalid-file' | 'read-failed' | null
): Promise<PullOutcome> {
  const remote = foldRemotePayloads(payloads)!
  const epoch = remote.resetEpoch!
  replaceLocalWithRemote(remote)
  setPrefsIfChanged({
    iCloudSyncIssue: issue,
    iCloudResetAdoptedNotice: {
      epochId: epoch.id,
      deviceName: epoch.deviceName ?? null,
      at: Date.now(),
    },
  })
  analytics.capture('icloud_sync_reset_adopted', {
    remote_files: payloads.length,
  })
  logger.log(`${tag()} pullAndMerge: adopted reset`, {
    reason,
    epoch: epoch.id,
    remoteFiles: payloads.length,
  })
  errorTracking.addBreadcrumb({
    category: 'iCloudSync',
    message: `pull (${reason}) — adopted newer reset`,
    level: 'info',
  })
  await push('reset-adopted')
  await pullImagesIfEnabled()
  return { changed: true, complete }
}

export function backfillUpdatedAtIfNeeded(): void {
  const prefs = usePreferences.getState()
  const contactStore = useContacts.getState()
  const expired = expireDeletedContactDetails(contactStore.deletedContacts)
  if (
    expired.some(
      (contact, index) => contact !== contactStore.deletedContacts[index]
    )
  )
    contactStore.set({ deletedContacts: expired })
  if (!prefs.hasReconciledSyncDefinitions) {
    const reports = useServiceReport.getState()
    const categories = useCategories.getState()
    const reconciled = reconcileSyncDefinitions({
      ...reports,
      ...contactStore,
      categories: categories.categories,
    })
    useContacts.setState({
      contacts: reconciled.contacts,
      deletedContacts: expireDeletedContactDetails(reconciled.deletedContacts),
      customFieldDefs: reconciled.customFieldDefs,
    })
    useServiceReport.setState({
      serviceReports: reconciled.serviceReports,
      dayPlans: reconciled.dayPlans,
      recurringPlans: reconciled.recurringPlans,
    })
    useCategories.setState({ categories: reconciled.categories })
    setPrefsIfChanged({ hasReconciledSyncDefinitions: true })
  }
  if (prefs.hasMigratedToSyncSchema) return

  const contacts = useContacts.getState()
  const conversations = useConversations.getState()
  const reports = useServiceReport.getState()
  const categories = useCategories.getState()

  contacts.set({
    contacts: contacts.contacts.map((c) =>
      c.updatedAt ? c : { ...c, updatedAt: 1 }
    ),
    deletedContacts: contacts.deletedContacts.map((c) =>
      c.updatedAt ? c : { ...c, updatedAt: 1 }
    ),
  })
  conversations.set({
    conversations: conversations.conversations.map((c) =>
      c.updatedAt ? c : { ...c, updatedAt: 1 }
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
        return { ...r, updatedAt: 1 }
      })
    }
  }
  reports.set({
    serviceReports: reportsMutated ? rebuiltReports : reports.serviceReports,
    dayPlans: reports.dayPlans.map((p) =>
      p.updatedAt ? p : { ...p, updatedAt: 1 }
    ),
    recurringPlans: reports.recurringPlans.map((p) =>
      p.updatedAt ? p : { ...p, updatedAt: 1 }
    ),
  })

  categories.set({
    categories: categories.categories.map((c) =>
      c.updatedAt ? c : { ...c, updatedAt: 1 }
    ),
  })

  prefs.set({ hasMigratedToSyncSchema: true })
}

async function catchUp(reason: string): Promise<void> {
  perf.count('sync:catchUp')
  if (!canSync()) return
  backfillUpdatedAtIfNeeded()
  if (catchUpInFlight) {
    catchUpQueuedReason ??= reason
    return
  }
  catchUpInFlight = true
  try {
    await calibrateClock()
    const scanned = await syncTransport().waitForInitialScan(5000)
    const pulled = await pull(reason)

    if (
      usePreferences.getState().iCloudSyncPendingPush ||
      pulled.ownFile === false ||
      !publishedThisLaunch
    ) {
      await push(reason)
    } else {
      perf.count('sync:push-skipped')

      startImagePush('foreground')
    }

    restartUploadChecks()

    while (pullInFlight) await pullInFlight
    if (scanned && lastPullComplete) await gcImagesIfEnabled()
    else logger.log(`${tag()} image gc skipped`, { reason, scanned })
  } finally {
    catchUpInFlight = false
    const queued = catchUpQueuedReason
    catchUpQueuedReason = null
    if (queued) void catchUp(queued)
  }
}

export function installiCloudSync(): () => void {
  if (!hasSyncTransport()) return () => {}
  if (installed) return () => {}
  installed = true

  checkICloudIdentity('launch')
  setSyncClockOffset(
    usePreferences.getState().iCloudClockOffsetMs ?? 0,
    usePreferences.getState().iCloudClockCalibrated
  )
  backfillUpdatedAtIfNeeded()

  const unsubLocalData = subscribeToLocalDataChanges((store) => {
    if (store === 'contacts' && materializingImages) return
    schedulePush()
  })

  let lastForegroundCatchUpAt = 0
  let launchCatchUpStarted = false
  const foregroundSub = addForegroundListener(() => {
    launchCatchUpStarted = true

    resetPushBackoff()
    const now = Date.now()
    if (now - lastForegroundCatchUpAt < FOREGROUND_CATCH_UP_MS) {
      perf.count('sync:catchUp-throttled')
      if (usePreferences.getState().iCloudSyncPendingPush && canSync())
        void push('foreground')
      return
    }
    lastForegroundCatchUpAt = now

    void catchUp('foreground')
  })
  const backgroundSub = addBackgroundListener(() => {
    cancelReadRetry()
    cancelPushRetry()
    cancelUploadChecks()
  })
  const onAppState = (state: AppStateStatus) => {
    if (state === 'active') {
      if (!launchCatchUpStarted) catchUpIfActive('launch')
      return
    }

    if (pushScheduled) {
      debouncedPush.flush()
    }
  }
  const appStateSub = AppState.addEventListener('change', onAppState)

  const reconnectSub = addReconnectListener(() => {
    resetPushBackoff()
    const prefs = usePreferences.getState()
    if (
      AppState.currentState === 'active' &&
      (prefs.iCloudSyncPendingPush || prefs.iCloudSyncIssue)
    )
      void catchUp('reconnect')
  })

  platformSyncTransport().setShouldPoll?.(
    () =>
      !usesCloudSync() &&
      (usePreferences.getState().iCloudSyncEnabled ||
        !useSupporter.getState().isSupporter)
  )

  setICloudPullWaitGate(
    () =>
      usePreferences.getState().iCloudSyncEnabled &&
      syncEntitled() &&
      syncTransport().isAvailable() &&
      !isKnownOffline()
  )

  let remoteChangeSub: { remove: () => void } | null = null
  let availabilitySub: { remove: () => void } | null = null
  const debouncedRemotePull = debounce(
    () => {
      if (!canSync()) return
      void pullAndMerge('remote-change')
    },
    REMOTE_CHANGE_DEBOUNCE_MS,
    { leading: true, trailing: true }
  )
  remoteChangeSub = addActiveRemoteChangeListener(() => {
    if (!canSync()) return
    debouncedRemotePull()
  })

  const catchUpIfActive = (reason: string) => {
    if (AppState.currentState !== 'active') return
    launchCatchUpStarted = true
    lastForegroundCatchUpAt = Date.now()
    void catchUp(reason)
  }
  const unsubSupporter = useSupporter.subscribe((state, prev) => {
    if (state.isSupporter && !prev.isSupporter) {
      catchUpIfActive('supporter-ready')
    }
  })

  const unsubEntitled = usePreferences.subscribe((state, prev) => {
    if (state.cloudSyncEntitled && !prev.cloudSyncEntitled && usesCloudSync())
      catchUpIfActive('entitled')
  })

  const unsubUpdateRequired = useUpdateRequired.subscribe((state, prev) => {
    if (state.required || !prev.required || !usesCloudSync()) return
    resetPushBackoff()
    catchUpIfActive('update-required-lifted')
  })
  availabilitySub = addActiveAvailabilityListener((e) => {
    checkICloudIdentity('availability')
    if (!e.available) {
      logger.warn(`${tag()} iCloud became unavailable`)
      return
    }
    catchUpIfActive('icloud-available')
  })
  catchUpIfActive('launch')

  return () => {
    unsubLocalData()
    unsubSupporter()
    unsubEntitled()
    unsubUpdateRequired()
    appStateSub.remove()
    foregroundSub.remove()
    backgroundSub.remove()
    reconnectSub.remove()
    platformSyncTransport().setShouldPoll?.(() => true)
    setICloudPullWaitGate(() => true)
    remoteChangeSub?.remove()
    availabilitySub?.remove()
    debouncedRemotePull.cancel()
    cancelReadRetry()
    resetPushBackoff()
    cancelUploadChecks()
    debouncedPush.cancel()
    pushScheduled = false
    installed = false
  }
}

export function clearCloudPhotos(): Promise<void> {
  return serializeImages(async () => {
    await syncTransport().deleteAllBinaries()
    setPrefsIfChanged({ iCloudImageSync: {} })
  })
}

export async function disableImageSync(): Promise<void> {
  setPrefsIfChanged({ iCloudSyncIncludeImages: false })
}

export async function enableImageSync(): Promise<void> {
  setPrefsIfChanged({ iCloudSyncIncludeImages: true })
  if (canSync() && !(await push('images-enabled'))) {
    throw new Error('Could not write photo references to iCloud')
  }

  await imagePushesSettled()
  await pullImagesIfEnabled(!canSync())
}

export async function waitForSyncIdle(): Promise<void> {
  while (pushInFlight || pullInFlight)
    await Promise.allSettled([pushInFlight, pullInFlight])
}

export const iCloudSync = {
  push,
  resetPushBackoff,
  imagePushesSettled,
  pullAndMerge,
  pullBeforeCalendarPublish,
  canSync,
  confirmICloudAccount,
  backfillUpdatedAtIfNeeded,
  hasMeaningfulLocalData,
  replaceLocalWithRemote,
  joinRemoteResetEpoch,
  overwriteRemoteWithLocal,
  peekRemotePayload,
  resolveInitialEnable,
  applySeedEnable,
  applyPullEnable,
  enableImageSync,
  disableImageSync,
  clearCloudPhotos,
  checkUpload,
  removeSyncDevice,
  pushImagesIfEnabled: () => pushImagesIfEnabled('foreground'),
  pullImagesIfEnabled: () => pullImagesIfEnabled(true),
  gcImagesIfEnabled,
  isPushScheduled: () => pushScheduled,
  waitForSyncIdle,
}
