import { foldRemotePayloads } from '@/app/sync/foldRemotePayloads'
import type { MergeResult } from '@/app/sync/merge'
type LocalMergeState = Omit<MergeResult, 'changed'>
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
import { filenameForContact, filenameForProfile } from '@/app/sync/imageNames'
import {
  SyncDeviceFile,
  SyncDeviceFiles,
  deviceIdFromSyncFilename,
  mergeSyncDeviceFiles,
  syncDeviceRemoval,
} from '@/lib/syncDevices'
import { analytics } from '@/lib/analytics'
import { AppState, AppStateStatus, Platform } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import debounce from 'lodash/debounce'
import * as ICloudBridge from '../../../modules/icloud-bridge'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import useMileage from '@/stores/mileage'
import { mileageFromPayload } from '@/app/sync/mileagePayload'
import {
  applyMileageSnapshot,
  hasMileageData,
  localMileageSnapshot,
} from '@/app/sync/mileageStoreSync'
import { usePreferences } from '@/stores/preferences'
import { useProfile } from '@/stores/profile'
import { useSupporter } from '@/features/supporter/stores/supporter'
import {
  buildPayload,
  isNewerPayloadVersion,
  parsePayload,
  SyncPayload,
} from '@/app/sync/payload'
import { mergePayload } from '@/app/sync/merge'
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
import { EventSubscription } from 'expo-modules-core'
import { CustomFieldDefinition } from '@/types/customField'
import { Category } from '@/types/category'
import { isSeededBuiltinCategory } from '@/constants/categories'
import { migrateNormalizeDates } from '@/lib/normalizeDate'
import { stripTombstonedCustomFields } from '@/lib/customFields'
import { markCompleteICloudPull } from '@/lib/iCloudPullWait'
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
let pushInFlight: Promise<boolean> | null = null
let pushRetryTimer: ReturnType<typeof setTimeout> | null = null
let pushRetries = 0
let editGeneration = 0
const PUSH_RETRY_DELAYS_MS = [5_000, 20_000, 60_000]
function cancelPushRetry() {
  if (pushRetryTimer) clearTimeout(pushRetryTimer)
  pushRetryTimer = null
  pushRetries = 0
}
function retryPush() {
  if (
    !installed ||
    pushRetryTimer ||
    AppState.currentState !== 'active' ||
    !canSync()
  )
    return
  const delay = PUSH_RETRY_DELAYS_MS[pushRetries++]
  if (delay === undefined) return
  pushRetryTimer = setTimeout(() => {
    pushRetryTimer = null
    void push('push-retry')
  }, delay)
}

/**
 * `complete` means local state now reflects every remote payload: the read
 * succeeded and no file was left downloading or unparseable. Image GC depends
 * on it; see `gcImagesIfEnabled`.
 */
type PullOutcome = { changed: boolean; complete: boolean }
/** `complete` of the most recent pull, whichever trigger ran it. */
let lastPullComplete = false
/**
 * Whether the most recent read listed any file. An empty listing can mean the
 * scan isn't done yet, so it doesn't release `markCompleteICloudPull` waiters.
 */
let lastReadFoundFiles = false

/**
 * Coalesce concurrent pulls. NSMetadataQuery fires in bursts (both
 * `DidFinishGathering` and `DidUpdate`, plus multiple notifications per iCloud
 * file op), and each read takes ~1s; running them concurrently wastes I/O and
 * produced the storm visible in the logs. At-most-one-queued is enough because
 * every caller just wants "the freshest state after my wake-up," and the
 * in-flight pull's read sees strictly newer data than anything the coalesced
 * caller saw.
 */
let pullInFlight: Promise<PullOutcome> | null = null
let pullQueuedReason: string | null = null

/**
 * The running image GC. It deletes binaries no local contact owns, judged
 * against the contacts it read when it started, so pulls never merge while it
 * runs (see `pull`).
 */
let gcInFlight: Promise<void> | null = null
/** Set by a pull waiting on GC; GC stops before its next delete. */
let gcStopRequested = false
/** Longest a pull waits for a stopping GC's current delete. */
const GC_STOP_WAIT_MS = 10_000

/**
 * Backoff for pulling again after a read fails (iCloud briefly unreachable),
 * which otherwise leaves the device stale until the next foreground or remote
 * change. Only while the app is active and can sync: backgrounding and
 * uninstall cancel it, a successful read resets it, and each foreground gets a
 * fresh budget.
 */
const READ_RETRY_DELAYS_MS = [5_000, 20_000, 60_000]
let readRetryTimer: ReturnType<typeof setTimeout> | null = null
let readRetries = 0

/**
 * Upload confirmation. A successful `write` only proves the snapshot reached
 * the local container; iCloud uploads it later, or not at all while storage is
 * full. Each write leaves this device's snapshot waiting
 * (`iCloudUploadPendingSince`) until a check sees it uploaded, which records
 * `lastiCloudUploadedAt`. Checks back off while the app is active, and every
 * write or catch-up starts a fresh budget. They only observe: iCloud retries
 * the upload itself, so re-pushing would not help a full account.
 */
const UPLOAD_CHECK_DELAYS_MS = [3_000, 10_000, 30_000, 60_000, 120_000, 300_000]
let uploadCheckTimer: ReturnType<typeof setTimeout> | null = null
let uploadChecks = 0
let uploadCheckInFlight: Promise<UploadVerdict | null> | null = null
/**
 * Bumped by every write, so a check that read the previous version can't
 * confirm the next one.
 */
let uploadGeneration = 0

/** Same coalescing as `pullInFlight`, for `catchUp`. */
let catchUpInFlight = false
let catchUpQueuedReason: string | null = null

/**
 * Set for the whole of `overwriteRemoteWithLocal`. Pulls don't read meanwhile,
 * and one already reading doesn't apply what it read: adopting another device's
 * reset, or merging, would replace the data the user chose to keep just before
 * it's published. A skipped pull runs once the reset ends.
 */
let resetInProgress = false
let pullDeferredReason: string | null = null

function filenameForDevice(deviceId: string): string {
  return `${SYNC_FILE_PREFIX}-${deviceId}${SYNC_FILE_EXT}`
}

/**
 * A filename is "legacy" if it's not in the per-device scheme — i.e. the
 * pre-upgrade single-file name `witness-work.json` or its iCloud conflict
 * duplicates `witness-work 2.json`, `witness-work 3.json`, etc. These can still
 * contain valuable data (one of ours had 23KB stranded in `witness-work
 * 4.json`), so the reader absorbs them and retains the source file.
 *
 * The account file (`witness-work-account.json`, ADR 0011) shares the sync
 * namespace but is NOT a sync payload — every reader must skip it via
 * `isAccountFilename` before parsing.
 */
function isLegacyFilename(filename: string): boolean {
  return !filename.startsWith(`${SYNC_FILE_PREFIX}-`)
}

/**
 * Sync payload readers pass this to `readFiles` so they never read (and mark
 * observed) the account file, which would swallow its remote-change event
 * before `AccountProvider` sees it.
 */
function isPayloadFilename(filename: string): boolean {
  return !isAccountFilename(filename)
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
 * This device's snapshot id. A copy restored from another device's backup gets
 * a fresh one so both devices keep reading each other (see `iCloudIdentity`).
 */
function ensureDeviceId(): string {
  return ensureSyncDeviceId()
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

/**
 * Whether the user has opted into iCloud sync AND is currently entitled to it
 * AND iCloud is actually usable. The supporter check is a runtime gate: if the
 * subscription lapses between syncs, push/pull immediately stop even before the
 * lapse-flip effect in `App.tsx` clears `iCloudSyncEnabled`.
 *
 * Also the Apple Account gate: every read and write checks here first, so a
 * device signed into another account turns sync off before touching that
 * account's container.
 */
export function canSync(): boolean {
  if (Platform.OS !== 'ios') return false
  const { iCloudSyncEnabled } = usePreferences.getState()
  if (!iCloudSyncEnabled) return false
  if (!useSupporter.getState().isSupporter) return false
  if (!ICloudBridge.isAvailable()) return false
  return checkICloudIdentity('can_sync')
}

/**
 * The Apple Account a read of iCloud was made under, as `checkICloudIdentity`
 * recorded it. A choice the user makes about that read (restore, merge, keep
 * this device's data) applies only while `confirmICloudAccount` still holds:
 * applying it after a switch would carry the previous account's data, or a
 * reset, into the new account's iCloud.
 */
export type ICloudAccount = { token: string | null; changedAt: number | null }

function storedICloudAccount(): ICloudAccount {
  const { iCloudIdentityToken, iCloudAccountChangedAt } =
    usePreferences.getState()
  return { token: iCloudIdentityToken, changedAt: iCloudAccountChangedAt }
}

/**
 * `changedAt` also catches a switch away and back, which leaves the token as it
 * was but has already reset this device's sync state.
 */
function isStoredICloudAccount(account: ICloudAccount): boolean {
  const stored = storedICloudAccount()
  return (
    stored.token === account.token && stored.changedAt === account.changedAt
  )
}

/**
 * Whether the Apple Account is still the one `account` was captured under.
 * Checks first, so a switch nobody has noticed yet turns sync off now.
 */
export function confirmICloudAccount(
  account: ICloudAccount,
  source: IdentityCheckSource = 'initial_enable'
): boolean {
  return checkICloudIdentity(source) && isStoredICloudAccount(account)
}

/**
 * Heuristic for "this device already has user content worth protecting." Used
 * on first-enable to decide whether to silently pull (fresh device) or surface
 * the merge/replace sheet (both sides populated).
 *
 * Intentionally does NOT treat `onboardingComplete` as meaningful. A new device
 * completing onboarding writes fresh preferences stamped with `Date.now()`,
 * which would otherwise beat the old device's older (real) preferences in the
 * LWW merge. Treating an onboarded-but-otherwise-empty device as non-meaningful
 * lets first-enable silently auto-pull and restore the real data. Users who
 * have actually created records (contacts, conversations, reports, plans) get
 * the choice sheet as before.
 */
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
  // A deletion is user data too: replacing it would bring the Plan back.
  if (reports.deletedDayPlans.length > 0) return true
  if (reports.deletedRecurringPlans.length > 0) return true
  for (const year of Object.values(reports.serviceReports)) {
    for (const month of Object.values(year)) {
      if (month.length > 0) return true
    }
  }
  const categories = useCategories.getState()
  // Every install seeds the LDC builtin, so it counts only once the User
  // changes it.
  if (categories.categories.some((c) => !isSeededBuiltinCategory(c)))
    return true
  if (categories.deletedCategories.length > 0) return true
  if (hasMileageData()) return true
  return false
}

/**
 * Destructive: wipes local user data + syncable prefs and replaces them with
 * the contents of `remote`. Device-local bookkeeping (`iCloudSyncEnabled`,
 * `iCloudDeviceId`, etc.) is preserved. Adopts `remote`'s reset generation, so
 * the next pull merges with it instead of replacing again.
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
    // The fold above already dropped tombstoned fields and their values.
    useConversations.setState({
      conversations: remote.conversationStore.conversations ?? [],
      deletedConversations: remote.conversationStore.deletedConversations ?? [],
      conversationFieldDefs: (remote.conversationStore.conversationFieldDefs ??
        []) as CustomFieldDefinition[],
      deletedConversationFieldDefs:
        remote.conversationStore.deletedConversationFieldDefs ?? [],
    })
    // Remote may have been written by a device that pre-dates calendar-day
    // normalization, so re-anchor every Date to noon UTC before persisting it
    // locally. Idempotent on already-normalized data.
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
    useCategories.setState({
      categories: (remote.categoryStore?.categories ?? []) as Category[],
      deletedCategories: remote.categoryStore?.deletedCategories ?? [],
    })
    applyMileageSnapshot(mileageFromPayload(remote))

    const now = Date.now()
    usePreferences.setState({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(syncableValues(remote.preferencesStore.values) as any),
      preferenceUpdatedAt: remote.preferencesStore.updatedAt ?? {},
      lastiCloudSyncAt: now,
      lastiCloudPulledAt: now,
      lastiCloudRemoteWrittenAt: remote.writtenAt,
      lastiCloudRemoteDeviceId: remote.deviceId,
      lastiCloudRemoteDeviceName: remote.deviceName ?? null,
      iCloudResetEpoch: remote.resetEpoch ?? null,
    })
    // Profile slice — `parsePayload` has already lifted any legacy
    // profile-shaped fields out of `preferencesStore.values` into
    // `remote.profileStore` via `normalizeLegacyPayloadFieldNames`, so this
    // single write covers both fresh-shape and legacy-shape remote payloads.
    useProfile.setState({
      ...syncableValues(
        remote.profileStore?.values ?? {},
        NON_SYNCABLE_PROFILE_KEYS
      ),
      profileUpdatedAt: remote.profileStore?.updatedAt ?? {},
    })
  })
}

/**
 * "Merge both" joins the remote's reset generation before merging, so the pull
 * merges with it rather than adopting it and replacing the data being merged.
 */
export function joinRemoteResetEpoch(remote: SyncPayload): void {
  usePreferences.setState({ iCloudResetEpoch: remote.resetEpoch ?? null })
}

/**
 * The inverse of `replaceLocalWithRemote`: starts a new reset generation and
 * publishes this device's data in it. Every other device ignores older
 * snapshots and adopts this one on its next pull. Used by the first-enable
 * sheet's "Keep this device's data" branch and "Rebuild iCloud data".
 *
 * The publish comes before any cleanup, so the new generation is in iCloud even
 * if cleanup stops part way; pre-reset files are harmless once it is. A failed
 * publish restores the previous generation and sync settings and throws.
 *
 * The reset belongs to the Apple Account it started under. A switch noticed
 * before the publish stops it without turning sync on, and a failed publish
 * after one leaves the account-change reset in place: restoring the previous
 * settings would sync the new account under the old generation.
 *
 * Pulls wait until it ends (`resetInProgress`), so it publishes this device's
 * data rather than another device's reset adopted meanwhile.
 */
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
  // A push that started earlier snapshotted the previous generation; joining
  // it would publish without the new one. A pull that started earlier may
  // still be applying what it read.
  while (pushInFlight || pullInFlight)
    await Promise.allSettled([pushInFlight, pullInFlight])
  if (!confirmICloudAccount(account, source))
    throw new Error('Apple Account changed')
  const deviceId = ensureDeviceId()
  const epoch = createResetEpoch({
    now: syncNow(),
    // A pull may have adopted another reset meanwhile.
    previous: usePreferences.getState().iCloudResetEpoch,
    deviceId,
    deviceName: Device.modelName ?? undefined,
  })
  // `push` needs sync on. Pulls meanwhile ignore every pre-reset file.
  usePreferences.setState({
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

/**
 * Cleanup after a reset publish: deletes other devices' payloads and legacy
 * files from older generations, and cloud photos the published data doesn't
 * reference. Never the account file. A newer generation (a concurrent reset) is
 * kept, and so is any file this device can't read: one from a newer app
 * version, or still downloading, could be that newer reset. The Devices list
 * can remove those later. Failures are logged, not thrown: the published
 * generation already makes what's left harmless.
 */
async function removePreResetFiles(
  ownFilename: string,
  epoch: ResetEpoch
): Promise<void> {
  try {
    const { files } = await ICloudBridge.readFiles(
      (filename) => isPayloadFilename(filename) && filename !== ownFilename
    )
    const stale = files
      .filter((file) => {
        const parsed = parsePayload(file.json)
        return parsed && compareResetEpochs(parsed.resetEpoch, epoch) < 0
      })
      .map((file) => file.filename)
    for (const filename of stale) await ICloudBridge.deleteFile(filename)
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

/**
 * Keeps the cloud photos this device's data references (contacts, recoverable
 * deleted contacts and the profile, uploaded by any device) and deletes the
 * rest. Unlike `clearCloudPhotos`, never removes a photo the reset publish just
 * uploaded.
 */
function deleteUnreferencedCloudPhotos(): Promise<void> {
  return serializeImages(async () => {
    const keep = new Set<string>()
    const { contacts, deletedContacts } = useContacts.getState()
    for (const contact of [...contacts, ...deletedContacts])
      if (contact.avatar?.type === 'image')
        keep.add(filenameForContact(contact.id, contact.avatar.revision))
    const { avatar } = useProfile.getState()
    if (avatar?.type === 'image') keep.add(filenameForProfile(avatar.revision))
    const deleted: string[] = []
    for (const { filename } of await ICloudBridge.listBinaryFiles()) {
      if (keep.has(filename)) continue
      await ICloudBridge.deleteBinaryFile(filename)
      deleted.push(filename)
    }
    if (deleted.length === 0) return
    const next: ImageSyncBookkeeping = {
      ...(usePreferences.getState().iCloudImageSync ?? {}),
    }
    for (const filename of deleted) delete next[filename]
    usePreferences.setState({ iCloudImageSync: next })
    logger.log(`${tag()} reset cleanup: photos`, { deleted: deleted.length })
  })
}

/**
 * Why `peekRemotePayload` couldn't see the whole remote: the initial scan
 * hadn't finished, a remote file was still downloading after waiting, or one
 * came from a newer app version.
 */
export type RemoteIncompleteReason =
  | 'scan'
  | 'downloading'
  | 'newer-version'
  | 'invalid-file'

/**
 * What `peekRemotePayload` saw. `incomplete` means a backup may exist that the
 * read couldn't see in full, so neither "no backup" nor the partial fold is
 * trustworthy. `unavailable` covers no iCloud and a failed read.
 */
export type RemotePeek =
  | { status: 'found'; remote: SyncPayload; account: ICloudAccount }
  | { status: 'none' }
  | { status: 'incomplete'; reason: RemoteIncompleteReason }
  | { status: 'unavailable' }

/**
 * Reads `peekRemotePayload` makes before giving up on a download in progress.
 * Each read waits up to 10 s natively for the downloads it starts.
 */
const PEEK_READ_ATTEMPTS = 2

function incompletePeek(reason: RemoteIncompleteReason): RemotePeek {
  logger.warn(`${tag()} peekRemotePayload: remote incomplete`, { reason })
  errorTracking.addBreadcrumb({
    category: 'iCloudSync',
    message: `peek — remote incomplete (${reason})`,
    level: 'warning',
  })
  return { status: 'incomplete', reason }
}

/**
 * One-shot read of the remote state without installing sync, without requiring
 * the user to be opted in. Used by the onboarding restore step to peek at
 * what's available before the user decides.
 *
 * Waits for `NSMetadataQuery`'s initial gather to complete before enumerating
 * files — on a cold-launched fresh install, the ubiquity container's directory
 * listing can be empty for several seconds even when a remote per-device file
 * already exists. Skipping this wait is what used to cause onboarding to report
 * "no backup" on new devices, letting the user complete onboarding with fresh
 * timestamps that then beat their real remote data in the LWW merge once sync
 * was enabled. For the same reason a scan that times out, a file still
 * downloading after another read, or a payload from a newer app version is
 * reported `incomplete` rather than folded into a partial answer.
 *
 * Folds all per-device files together so the caller sees one unified view.
 * `found` carries the Apple Account it was read under; a read the account
 * switched during is `unavailable`.
 */
export async function peekRemotePayload(): Promise<RemotePeek> {
  if (Platform.OS !== 'ios') return { status: 'unavailable' }
  if (!ICloudBridge.isAvailable()) return { status: 'unavailable' }
  checkICloudIdentity('initial_enable')
  const account = storedICloudAccount()
  const peek = await readRemotePeek(account)
  return confirmICloudAccount(account) ? peek : { status: 'unavailable' }
}

async function readRemotePeek(account: ICloudAccount): Promise<RemotePeek> {
  try {
    if (!(await ICloudBridge.waitForInitialScan(5000))) {
      return incompletePeek('scan')
    }
    for (let attempt = 1; ; attempt++) {
      const { files, pending } = await ICloudBridge.readFiles(
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
      // `pending: null` is a binary that can't tell (see `readFiles`); decide
      // on what it read, as before `pending` existed.
      if (!pending?.length) {
        const remote = foldRemotePayloads(payloads)
        return remote
          ? { status: 'found', remote, account }
          : { status: 'none' }
      }
      if (attempt >= PEEK_READ_ATTEMPTS) return incompletePeek('downloading')
    }
  } catch (e) {
    // Not proof of "no backup": a read that fails (iCloud Drive off for the
    // app) must not lead to seeding.
    logger.error(`${tag()} peekRemotePayload failed`, e)
    return { status: 'unavailable' }
  }
}

/**
 * Classification of what an initial enable-sync flow should do, given the
 * current remote state and the current local state. Returned by
 * `resolveInitialEnable()` so every call site that flips sync on for the first
 * time shares the same "look before leaping" decision.
 *
 * - `unavailable` — iCloud isn't usable (wrong platform, no identity token, or
 *   the container couldn't be read). Caller should abort.
 * - `incomplete` — the remote couldn't be seen in full (see `RemotePeek`), so
 *   every other outcome could be wrong: `seed` would push this device's
 *   onboarding defaults over a backup still downloading. Caller must leave sync
 *   off and try again later.
 * - `seed` — no remote file exists. Safe to enable + push this device's state.
 * - `pull` — remote exists, local has no meaningful user records. Safe to
 *   destructively replace local with remote + enable.
 * - `conflict` — both sides populated. Caller must ask the user to resolve
 *   (Settings renders `FirstEnableSheet`; headless callers like
 *   `SupporterSyncDefault` should leave sync disabled and defer to Settings),
 *   and apply the choice only while `confirmICloudAccount(account)` holds.
 */
export type InitialEnableDecision =
  | { outcome: 'unavailable' }
  | { outcome: 'incomplete'; reason: RemoteIncompleteReason }
  | { outcome: 'seed' }
  | { outcome: 'pull'; remote: SyncPayload }
  | { outcome: 'conflict'; remote: SyncPayload; account: ICloudAccount }

/**
 * Peeks at the remote state and classifies what an initial enable should do.
 * Pure observation — never mutates stores or iCloud. Callers pass the result to
 * `applySeedEnable` / `applyPullEnable`, or surface their own conflict UI.
 *
 * This is the single chokepoint that guards against the new-device hazard
 * described in docs/icloud-sync.md: a fresh device that completes onboarding
 * has `preferenceUpdatedAt` stamps newer than the old device's real values, so
 * any path that enables sync without first checking for remote data risks
 * clobbering the old device on the next pull-and-merge.
 */
export async function resolveInitialEnable(): Promise<InitialEnableDecision> {
  if (Platform.OS !== 'ios') return { outcome: 'unavailable' }
  if (!ICloudBridge.isAvailable()) return { outcome: 'unavailable' }
  // A headless auto-enable must not seed an account it just noticed.
  if (!checkICloudIdentity('initial_enable')) return { outcome: 'unavailable' }
  const peek = await peekRemotePayload()
  switch (peek.status) {
    case 'unavailable':
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

/**
 * Enables sync and pushes this device's state to iCloud. Safe only when the
 * caller has first seen `resolveInitialEnable()` return `seed` — otherwise a
 * concurrent writer's file can get shadowed by a fresh-install payload.
 */
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

/**
 * Destructively replaces local state with `remote` and enables sync. Safe only
 * when the caller has first seen `resolveInitialEnable()` return `pull` — i.e.
 * local had no meaningful user records. Sets `iCloudSyncEnabled` _after_ the
 * replace so ongoing-sync subscribers don't briefly see the half-replaced
 * intermediate state.
 */
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

/**
 * Wires the real `ICloudBridge` + `expo-file-system` into the injectable deps
 * the pure `imageSync` module consumes. The pure module exists to keep
 * upload/download bookkeeping testable without react-native mocks; this is the
 * production adapter.
 */
function buildImageSyncDeps(oneShot = false): ImageSyncDeps {
  return {
    canTransfer: () =>
      usePreferences.getState().iCloudSyncIncludeImages &&
      ICloudBridge.isAvailable() &&
      (oneShot || canSync()),
    bridge: {
      writeBinary: (filename, sourcePath) =>
        ICloudBridge.writeBinary(filename, sourcePath),
      readBinary: (filename, destinationPath) =>
        ICloudBridge.readBinary(filename, destinationPath),
      listBinaryFiles: () => ICloudBridge.listBinaryFiles(),
      deleteBinaryFile: (filename) => ICloudBridge.deleteBinaryFile(filename),
    },
    fs: {
      getModifiedAt: async (path) => {
        // `path` is a `file://` URI with the cache-buster already stripped by
        // `collectLocalAvatarSources`. `getInfoAsync` handles both URI and
        // plain path forms.
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

/**
 * Pushes the local image bookkeeping forward: uploads any dirty or
 * never-uploaded avatars and persists the resulting bookkeeping back to
 * preferences. No-op when image sync is disabled. Failures are logged and
 * surfaced to error tracking; the returned promise resolves regardless.
 */
function pushImagesIfEnabled(
  trigger: 'store-edit' | 'foreground',
  publishedSources?: AvatarSource[]
): Promise<void> {
  return serializeImages(() => pushImagesInner(trigger, publishedSources))
}
async function pushImagesInner(
  trigger: 'store-edit' | 'foreground',
  publishedSources?: AvatarSource[]
): Promise<void> {
  const prefs = usePreferences.getState()
  if (!prefs.iCloudSyncIncludeImages || !canSync()) return
  if (!publishedSources && prefs.iCloudSyncPendingPush) return
  if (Platform.OS !== 'ios') return
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
    usePreferences.setState({ iCloudImageSync: result.bookkeeping })
    // Surface the first failure's error message — lossy when there are many,
    // but keeps the log from exploding and tells the operator exactly why
    // writes are failing (path mismatch, quota, coordinator error, etc.).
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

/**
 * Downloads any images the merged state references as markers but doesn't yet
 * have locally, then rewrites the in-memory records to point at the fresh local
 * URIs. No-op when image sync is disabled; skipping downloads on disabled
 * devices is how receivers naturally fall back to initials (see Q4 in
 * docs/icloud-image-sync-plan.md).
 */
let materializingImages = false
function pullImagesIfEnabled(oneShot = false): Promise<void> {
  return serializeImages(() => pullImagesInner(oneShot))
}
async function pullImagesInner(oneShot = false): Promise<void> {
  const prefs = usePreferences.getState()
  if (!prefs.iCloudSyncIncludeImages) return
  if (Platform.OS !== 'ios') return
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
      // Still persist bookkeeping even without downloads in case we tracked
      // new containerMtime observations via skip-branch.
      usePreferences.setState({ iCloudImageSync: result.bookkeeping })
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
    // Write through the stores' own `set` to avoid bumping `updatedAt` — the
    // helper preserved the records' timestamps, and `set` is a raw state
    // replacement (no stamping). Using `useProfile.setState` directly
    // bypasses the stamping wrapper on the Profile store for the same reason.
    if (applied.contacts !== contactsState.contacts) {
      // File materialization is local display state; the reference was already
      // published. It must not arm another JSON push on every remote echo.
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
      // A prior delete may await IO while another contact/revision is restored.
      // Re-read ownership immediately before each subsequent deletion.
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
    // Discard bookkeeping for removed/superseded identities too.
    for (const download of result.downloaded) {
      if (deletedPaths.has(download.localUri.split('?')[0]))
        delete result.bookkeeping[
          filenameForSource({ ...download, localPath: '' })
        ]
    }
    usePreferences.setState({ iCloudImageSync: result.bookkeeping })
    logger.log(`${tag()} image pull`, {
      downloaded: result.downloaded.length,
      missing: result.missing.length,
    })
  } catch (e) {
    logger.error(`${tag()} image pull failed`, e)
    errorTracking.captureException(e, { iCloudSync: 'image-pull' })
  }
}

/**
 * Deletes container binaries with no corresponding local identity — cleans up
 * after contact deletes that happened while this device was offline. Only safe
 * once local state reflects every remote payload; otherwise it deletes the
 * photos of contacts still on their way in. `catchUp` runs it after a complete
 * pull.
 *
 * Never runs alongside a pull, which could give an orphan an owner mid-sweep:
 * it skips while one is running, and a pull that starts meanwhile stops it
 * before its next delete (see `pull`).
 */
function gcImagesIfEnabled(): Promise<void> {
  if (gcInFlight) return gcInFlight
  if (pullInFlight) return Promise.resolve()
  gcStopRequested = false
  gcInFlight = serializeImages(gcImages).finally(() => {
    gcInFlight = null
  })
  return gcInFlight
}

async function gcImages(): Promise<void> {
  const prefs = usePreferences.getState()
  if (!prefs.iCloudSyncIncludeImages) return
  if (Platform.OS !== 'ios') return
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
      // A pull waiting to merge, or a local edit (a new photo uploading), may
      // give an orphan an owner.
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
    if (result.deleted.length > 0) {
      // Strip the deleted filenames from bookkeeping so we don't keep stale
      // entries forever. Read it fresh: image uploads and downloads may have
      // updated it during the sweep.
      const next: ImageSyncBookkeeping = {
        ...(usePreferences.getState().iCloudImageSync ?? {}),
      }
      for (const filename of result.deleted) delete next[filename]
      usePreferences.setState({ iCloudImageSync: next })
      logger.log(`${tag()} image gc`, { deleted: result.deleted.length })
    }
  } catch (e) {
    logger.error(`${tag()} image gc failed`, e)
    errorTracking.captureException(e, { iCloudSync: 'image-gc' })
  }
}

/**
 * Pushes current local state to iCloud. Safe to call when sync is disabled —
 * it's a no-op. Errors are logged + reported to error tracking but never
 * thrown, so callers (store subscribers, AppState handlers) don't need
 * try/catch.
 */
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
      // A debounce can fire while the successful write is still uploading its
      // photos. Release the coalesced promise before scheduling uncovered edits.
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
    usePreferences.setState({
      iCloudClockOffsetMs: offset,
      iCloudClockCalibrated: true,
    })
}

async function pushInner(reason: string): Promise<boolean> {
  if (!canSync()) {
    usePreferences.setState({ iCloudSyncPendingPush: true })
    logger.log(`${tag()} push skipped (canSync=false)`, { reason })
    return false
  }
  // Every push is a full snapshot, so it covers any deferred edit.
  try {
    await calibrateClock()
    if (!canSync()) {
      usePreferences.setState({ iCloudSyncPendingPush: true })
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
    await ICloudBridge.write(filename, json)
    awaitUpload()
    const covered = generation === editGeneration
    usePreferences.setState({ iCloudSyncPendingPush: !covered })
    cancelPushRetry()
    if (!covered) schedulePush()
    const now = Date.now()
    usePreferences.getState().set({
      lastiCloudSyncAt: now,
      lastiCloudPushedAt: now,
      ...(usePreferences.getState().iCloudSyncIssue === 'push-failed'
        ? { iCloudSyncIssue: null }
        : {}),
    })
    logger.log(`${tag()} push success`, { reason, filename })
    errorTracking.addBreadcrumb({
      category: 'iCloudSync',
      message: `push (${reason})`,
      level: 'info',
    })
    // Piggyback the binary upload on every successful JSON push. No-op when
    // image sync is disabled.
    await pushImagesIfEnabled(
      reason === 'foreground' ? 'foreground' : 'store-edit',
      imageSources
    )
    return true
  } catch (e) {
    logger.error(`${tag()} push failed (${reason})`, e)
    errorTracking.captureException(e, { iCloudSync: 'push' })
    usePreferences.setState({
      iCloudSyncPendingPush: true,
      iCloudSyncIssue: 'push-failed',
    })
    retryPush()
    return false
  }
}

function awaitingUpload(): boolean {
  const prefs = usePreferences.getState()
  return prefs.iCloudUploadPendingSince !== null || !!prefs.iCloudUploadIssue
}

/** After a write: this version waits for iCloud to confirm its upload. */
function awaitUpload(): void {
  // A binary that can't tell keeps showing local activity, as before.
  if (!ICloudBridge.supportsUploadStatus()) return
  uploadGeneration++
  if (usePreferences.getState().iCloudUploadPendingSince === null) {
    usePreferences.setState({ iCloudUploadPendingSince: Date.now() })
  }
  restartUploadChecks()
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

/**
 * Asks iCloud whether this device's snapshot has uploaded and records the
 * answer. Null when nothing is waiting or iCloud couldn't say (the binary
 * predates `uploadStatus`, the file is mid-rebuild, or the read failed).
 */
export function checkUpload(): Promise<UploadVerdict | null> {
  if (uploadCheckInFlight) return uploadCheckInFlight
  uploadCheckInFlight = checkUploadInner().finally(() => {
    uploadCheckInFlight = null
  })
  return uploadCheckInFlight
}

async function checkUploadInner(): Promise<UploadVerdict | null> {
  if (!awaitingUpload() || !canSync()) return null
  if (!ICloudBridge.supportsUploadStatus()) {
    // Recorded by a newer binary before an OTA rollback onto this one.
    usePreferences.setState({
      iCloudUploadPendingSince: null,
      iCloudUploadIssue: null,
    })
    return null
  }
  const generation = uploadGeneration
  let status: ICloudBridge.UploadStatus | null
  try {
    status = await ICloudBridge.uploadStatus(
      filenameForDevice(ensureDeviceId())
    )
  } catch (e) {
    logger.warn(`${tag()} upload status unavailable`, e)
    return null
  }
  // Missing while a rebuild deletes and rewrites it; an account change means
  // the answer is about another container.
  if (!status || !canSync()) return null
  const verdict = classifyUploadStatus(status)
  const previousIssue = usePreferences.getState().iCloudUploadIssue
  switch (verdict) {
    case 'uploaded':
      // A write since the read started is a newer version still uploading.
      if (generation !== uploadGeneration) return 'waiting'
      cancelUploadChecks()
      usePreferences.setState({
        lastiCloudUploadedAt: Date.now(),
        iCloudUploadPendingSince: null,
        iCloudUploadIssue: null,
      })
      if (previousIssue) {
        logger.log(`${tag()} upload recovered`, { previousIssue })
        analytics.capture('icloud_sync_upload_recovered', {
          previous_issue: analyticsReason(previousIssue),
        })
      }
      break
    case 'icloud-full':
    case 'upload-failed':
      if (previousIssue === verdict) break
      usePreferences.setState({ iCloudUploadIssue: verdict })
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
    push('store-change')
  },
  PUSH_DEBOUNCE_MS,
  { leading: false, trailing: true }
)

function schedulePush() {
  editGeneration++
  usePreferences.setState({ iCloudSyncPendingPush: true })
  if (!canSync()) {
    // Most often an edit at cold launch, before supporter status loads.
    // `catchUp` pushes it once sync is ready instead of waiting for the
    // next edit.
    return
  }
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
 * in-flight result and schedules at most one follow-up pull to catch anything
 * the running read raced past. See the `pullInFlight` comment for why
 * at-most-one is sufficient.
 *
 * Also absorbs + cleans up **legacy files** (pre-upgrade single-file scheme
 *
 * - ICloud conflict duplicates) so we converge on the per-device layout over
 *   time, without losing any stranded data.
 */
class ICloudReadError extends Error {}

export async function pullAndMerge(reason: string): Promise<boolean> {
  return (await pull(reason)).changed
}

/** Calendar export must wait for a complete data pull, including queued reads. */
export async function pullBeforeCalendarPublish(): Promise<void> {
  const check = (outcome: PullOutcome) => {
    if (!outcome.complete)
      throw new ICloudReadError('iCloud data could not be fully read')
  }
  if (!canSync()) throw new ICloudReadError('iCloud data sync unavailable')
  if (!(await ICloudBridge.waitForInitialScan()))
    throw new ICloudReadError('iCloud data scan incomplete')
  check(await pull('calendar-publish'))
  while (pullInFlight) check(await pullInFlight)
  if (!canSync()) throw new ICloudReadError('iCloud data sync unavailable')
}

function pull(reason: string): Promise<PullOutcome> {
  if (resetInProgress) {
    pullDeferredReason ??= reason
    // Nothing was read, so GC and device removal wait for the deferred pull.
    lastPullComplete = false
    return Promise.resolve({ changed: false, complete: false })
  }
  if (pullInFlight) {
    if (!pullQueuedReason) pullQueuedReason = reason
    return pullInFlight
  }
  // Defer execution until the promise is assigned, including a skipped pull.
  pullInFlight = Promise.resolve().then(async () => {
    try {
      // GC judges orphans against the contacts it read at its start; merging
      // alongside it could delete the photo of a contact this pull brings in.
      // Stop it before its next delete and let it finish first — within
      // reason, so a coordinated delete that hangs can't stall every pull.
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

/** Arms the next `READ_RETRY_DELAYS_MS` pull after a failed read, if any. */
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

/**
 * Checked after a read, right before applying it: sync may have turned off, or
 * a reset started, while it read. A pull a reset stops runs again after it.
 */
function canApplyPull(reason: string): boolean {
  if (resetInProgress) {
    pullDeferredReason ??= reason
    return false
  }
  return canSync()
}

async function pullAndMergeInner(reason: string): Promise<PullOutcome> {
  if (!canSync()) {
    logger.log(`${tag()} pullAndMerge skipped (canSync=false)`, { reason })
    return { changed: false, complete: false }
  }

  logger.log(`${tag()} pullAndMerge start`, { reason })

  const deviceId = ensureDeviceId()
  const ownFilename = filenameForDevice(deviceId)

  const seenAt = nextReadStamp()
  let read: ICloudBridge.SyncRead
  try {
    read = await ICloudBridge.readFiles(isPayloadFilename)
  } catch (e) {
    logger.error(`${tag()} read failed (${reason})`, e)
    // Retries of the same outage would only repeat the report.
    if (readRetries === 0) {
      errorTracking.captureException(e, { iCloudSync: 'pull' })
    }
    usePreferences.setState({ iCloudSyncIssue: 'read-failed' })
    scheduleReadRetry()
    return { changed: false, complete: false }
  }
  cancelReadRetry()
  let issue: 'newer-version' | 'invalid-file' | 'read-failed' | null = null
  const { files, pending } = read
  lastReadFoundFiles = files.length > 0
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
    usePreferences
      .getState()
      .set({ lastiCloudPulledAt: Date.now(), iCloudSyncIssue: issue })
    logger.log(`${tag()} pullAndMerge: no remote files`, { reason })
    errorTracking.addBreadcrumb({
      category: 'iCloudSync',
      message: `pull (${reason}) — no remote`,
      level: 'info',
    })
    return { changed: false, complete }
  }

  // Parse files independently. Retain legacy sources so an old writer's
  // concurrent update cannot be deleted after our read.
  let remotePayloads: Array<{
    payload: SyncPayload
    filename: string
    modifiedAt: number
  }> = []
  const legacyFilenames: string[] = []
  const unparsed: SyncDeviceFiles = {}
  for (const file of files) {
    if (file.filename === ownFilename) continue
    const parsed = parsePayload(file.json)
    if (!parsed) {
      unparsed[file.filename] = unparsedDeviceFile(file, seenAt)
      complete = false
      issue = isNewerPayloadVersion(file.json)
        ? 'newer-version'
        : (issue ?? 'invalid-file')
      if (isNewerPayloadVersion(file.json)) {
        // A device already on a newer app version. Its data waits until this
        // device updates, and so does image GC, which can't see its
        // contacts. Expected, so a breadcrumb rather than a report.
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
      logger.warn(`${tag()} pullAndMerge: skipping invalid file`, {
        reason,
        filename: file.filename,
        bytes: file.json.length,
      })
      errorTracking.captureMessage('iCloudSync: invalid remote payload', {
        level: 'warning',
      })
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

  // Reset generations: a newer one replaces local data; an older one is a
  // snapshot a reset replaced, and stays out of the merge. Neither makes the
  // read incomplete.
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
    if (!canApplyPull(reason)) return { changed: false, complete: false }
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

  const now = syncNow()
  usePreferences.getState().set({
    lastiCloudPulledAt: now,
    iCloudSyncIssue: issue,
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
    // Keep legacy files: another writer may still be updating them.
    return { changed: false, complete }
  }

  if (!canApplyPull(reason)) return { changed: false, complete: false }
  // Snapshot local state once; fold each remote payload into the accumulator.
  const contactsState = useContacts.getState()
  const conversationsState = useConversations.getState()
  const serviceReportState = useServiceReport.getState()
  const categoriesState = useCategories.getState()
  const preferencesState = usePreferences.getState()
  const profileState = useProfile.getState()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const localPrefValues: Record<string, any> = {}
  for (const [key, value] of Object.entries(preferencesState)) {
    if (typeof value === 'function') continue
    localPrefValues[key] = value
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const localProfileValues: Record<string, any> = {}
  for (const [key, value] of Object.entries(profileState)) {
    if (typeof value === 'function') continue
    localProfileValues[key] = value
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
    deletedDayPlans: serviceReportState.deletedDayPlans.length,
    deletedRecurringPlans: serviceReportState.deletedRecurringPlans.length,
    preferenceUpdatedAtKeys: Object.keys(
      preferencesState.preferenceUpdatedAt ?? {}
    ).length,
  })

  let acc: LocalMergeState = {
    contacts: contactsState.contacts,
    deletedContacts: contactsState.deletedContacts,
    customFieldDefs: contactsState.customFieldDefs,
    deletedCustomFieldDefs: contactsState.deletedCustomFieldDefs,
    conversations: conversationsState.conversations,
    deletedConversations: conversationsState.deletedConversations,
    conversationFieldDefs: conversationsState.conversationFieldDefs,
    deletedConversationFieldDefs:
      conversationsState.deletedConversationFieldDefs,
    serviceReports: serviceReportState.serviceReports,
    dayPlans: serviceReportState.dayPlans,
    recurringPlans: serviceReportState.recurringPlans,
    deletedServiceReports: serviceReportState.deletedServiceReports,
    deletedDayPlans: serviceReportState.deletedDayPlans,
    deletedRecurringPlans: serviceReportState.deletedRecurringPlans,
    categories: categoriesState.categories,
    deletedCategories: categoriesState.deletedCategories,
    ...localMileageSnapshot(),
    preferencesValues: localPrefValues,
    preferenceUpdatedAt: preferencesState.preferenceUpdatedAt ?? {},
    profileValues: localProfileValues,
    profileUpdatedAt: profileState.profileUpdatedAt ?? {},
  }

  let anyChanged = false
  for (const r of remotePayloads) {
    const result = mergePayload(acc, r.payload)
    if (result.changed) anyChanged = true
    const { changed: _changed, ...next } = result
    acc = next
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
    deletedDayPlans: acc.deletedDayPlans.length,
    deletedRecurringPlans: acc.deletedRecurringPlans.length,
  })

  if (!anyChanged) {
    // Even when the JSON merge is a no-op, image state can drift:
    //
    // - User enabled image sync on this device after a previous pull
    //   brought markers into local state; binaries now need to be pulled.
    // - Another device re-uploaded a binary whose mtime advanced without
    //   changing the JSON record (e.g. user re-picked the same image).
    //
    // `pullImagesIfEnabled` is cheap and idempotent, so run it
    // unconditionally on every pull cycle and let its own bookkeeping
    // skip no-op downloads.
    await pullImagesIfEnabled()
    return { changed: false, complete }
  }

  contactsState.set({
    contacts: acc.contacts,
    deletedContacts: acc.deletedContacts,
    customFieldDefs: acc.customFieldDefs,
    deletedCustomFieldDefs: acc.deletedCustomFieldDefs,
  })
  conversationsState.set({
    conversations: acc.conversations,
    deletedConversations: acc.deletedConversations,
    conversationFieldDefs: acc.conversationFieldDefs,
    deletedConversationFieldDefs: acc.deletedConversationFieldDefs,
  })
  // Same rationale as `replaceLocalWithRemote`: a peer device could have
  // written un-normalized dates. Re-anchor before applying. A Plan another
  // device deleted leaves here as a remote mutation: that device already
  // answered any buddy's invitation, and the reminder hook drops its reminder.
  const normalizedAcc = migrateNormalizeDates({
    serviceReports: acc.serviceReports,
    dayPlans: acc.dayPlans,
    recurringPlans: acc.recurringPlans,
  })
  withRemoteDataMutation(() =>
    serviceReportState.set({
      serviceReports: normalizedAcc.serviceReports,
      dayPlans: normalizedAcc.dayPlans,
      recurringPlans: normalizedAcc.recurringPlans,
      deletedServiceReports: acc.deletedServiceReports,
      deletedDayPlans: acc.deletedDayPlans,
      deletedRecurringPlans: acc.deletedRecurringPlans,
    })
  )
  categoriesState.set({
    categories: acc.categories,
    deletedCategories: acc.deletedCategories,
  })
  applyMileageSnapshot(acc)

  usePreferences.setState({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(acc.preferencesValues as any),
    preferenceUpdatedAt: acc.preferenceUpdatedAt,
    lastiCloudSyncAt: Date.now(),
    lastiCloudPulledAt: Date.now(),
  })
  useProfile.setState({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(acc.profileValues as any),
    profileUpdatedAt: acc.profileUpdatedAt,
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

  // A merge that changed anything may have introduced new avatar markers for
  // contacts whose images we haven't downloaded yet. Fire-and-forget — the
  // helper handles its own error reporting and is a no-op when image sync
  // is disabled. Wait on it so `pullAndMerge` callers can sequence their
  // own UI refresh after images land.
  await pullImagesIfEnabled()

  return { changed: true, complete }
}

/**
 * `seenAt` for the Devices list: taken before a read and strictly increasing,
 * so a removal's `since` (see `removeSyncDevice`) is later than every earlier
 * read, even within a millisecond.
 */
let lastReadStamp = 0
function nextReadStamp(): number {
  lastReadStamp = Math.max(Date.now(), lastReadStamp + 1)
  return lastReadStamp
}

function unparsedDeviceFile(
  file: ICloudBridge.SyncFile,
  seenAt: number
): SyncDeviceFile {
  return {
    deviceId: deviceIdFromSyncFilename(file.filename),
    deviceName: null,
    writtenAt: null,
    modifiedAt: file.modifiedAt,
    status: isNewerPayloadVersion(file.json) ? 'newer-version' : 'unreadable',
    seenAt,
  }
}

/**
 * Records what this read saw of each device's file for the Devices list (see
 * `src/lib/syncDevices.ts`), from the files the pull already read; reading more
 * would mark them observed and silence their remote-change events. A file from
 * a generation older than `epoch`, the one local data is in after this pull, is
 * `pre-reset`.
 */
function recordDeviceFiles(args: {
  read: ICloudBridge.SyncRead
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
  // An Apple Account change during the read already cleared these; the files
  // belong to the previous account's container.
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
  usePreferences.setState({
    iCloudSyncDevices: mergeSyncDeviceFiles(
      usePreferences.getState().iCloudSyncDevices ?? {},
      observed,
      // `pending: null` is a binary that can't tell what it skipped.
      Array.isArray(read.pending) && read.pending.length === 0
    ),
  })
}

export type RemoveSyncDeviceOutcome =
  /** Deleted, or a complete read found it already gone. */
  | 'removed'
  /** This device may not hold that device's data yet. */
  | 'sync-first'
  /** A newer app version wrote it; this device can't merge it. */
  | 'update-app'
  | 'unavailable'

/**
 * Settings Devices list: deletes another device's snapshot from iCloud, never
 * this device's or the account file. If that device is still in use, its next
 * push writes the snapshot again. Pulls first so the decision rests on a read
 * made now (`syncDeviceRemoval`): a current-generation snapshot goes only when
 * that pull was complete, so this device already merged it. `entry` is the file
 * as that pull saw it. Throws if the delete fails.
 */
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
  // A pull already running read before `since`; let the one it queued land.
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
  await ICloudBridge.deleteFile(filename)
  const { [filename]: _removed, ...rest } =
    usePreferences.getState().iCloudSyncDevices ?? {}
  usePreferences.setState({ iCloudSyncDevices: rest })
  logger.log(`${tag()} device removed`, { filename, status: entry.status })
  errorTracking.addBreadcrumb({
    category: 'iCloudSync',
    message: `device file removed (${entry.status})`,
    level: 'info',
  })
  return { outcome: 'removed', entry }
}

/**
 * Another device reset the iCloud data: replace local synced data with that
 * generation's payloads, as a restore would, then publish this device's file in
 * it. Never merges local data into the newer generation; unpushed local edits
 * are replaced, which is the point of a reset.
 */
async function adoptResetEpoch(
  reason: string,
  payloads: SyncPayload[],
  complete: boolean,
  issue: 'newer-version' | 'invalid-file' | 'read-failed' | null
): Promise<PullOutcome> {
  const remote = foldRemotePayloads(payloads)!
  const epoch = remote.resetEpoch!
  replaceLocalWithRemote(remote)
  usePreferences.setState({
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

/**
 * One-time backfill: stamps the deterministic legacy value `updatedAt = 1` onto
 * any record that lacks one, so the merge algorithm has something to compare
 * against on the first sync. Runs once per install (gated on
 * `preferences.hasMigratedToSyncSchema`).
 */
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
    usePreferences.setState({ hasReconciledSyncDefinitions: true })
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

/**
 * Brings this device level with iCloud: pull, push any edits made while sync
 * wasn't ready, then upload images and GC. Runs on foreground and whenever sync
 * becomes ready while the app is active.
 *
 * Image steps wait for the pull so the image bookkeeping has one writer and GC
 * sees the merged contact list. GC also needs the initial scan: an early empty
 * listing looks like "no remote payloads".
 */
async function catchUp(reason: string): Promise<void> {
  if (!canSync()) return
  backfillUpdatedAtIfNeeded()
  if (catchUpInFlight) {
    catchUpQueuedReason ??= reason
    return
  }
  catchUpInFlight = true
  try {
    await calibrateClock()
    const scanned = await ICloudBridge.waitForInitialScan(5000)
    await pull(reason)
    // Publish the exact snapshot whose photos the push will upload. Failed
    // writes leave bytes untouched and retain the pending flag for retries.
    await push(reason)
    // A write arms its own checks; this covers a failed push and a snapshot
    // still waiting from an earlier session.
    restartUploadChecks()
    // Joining a running pull returns its (older) result and queues a
    // follow-up, and remote-change pulls may have run meanwhile. Let every
    // queued pull land so GC judges the newest read.
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

/**
 * Wires iCloud sync into store changes, foreground transitions, readiness
 * changes, and remote-change events from the native module. Idempotent.
 *
 * Safe to call unconditionally at app boot — it gates on platform + the opt-in
 * preference, so nothing runs until the user flips the toggle.
 */
export function installiCloudSync(): () => void {
  if (Platform.OS !== 'ios') return () => {}
  if (installed) return () => {}
  installed = true
  // Before the clock offset is read: a copied device resets it. Also catches
  // an Apple Account switch made while the app wasn't running.
  checkICloudIdentity('launch')
  setSyncClockOffset(
    usePreferences.getState().iCloudClockOffsetMs ?? 0,
    usePreferences.getState().iCloudClockCalibrated
  )
  backfillUpdatedAtIfNeeded()

  const unsubContacts = useContacts.subscribe(() => {
    if (!materializingImages) schedulePush()
  })
  const unsubConversations = useConversations.subscribe(() => schedulePush())
  const unsubServiceReports = useServiceReport.subscribe(() => schedulePush())
  const unsubCategories = useCategories.subscribe(() => schedulePush())
  const unsubMileage = useMileage.subscribe(() => schedulePush())
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
  // Profile store mirrors the same per-key stamping pattern, so the same
  // reference check on `profileUpdatedAt` is an accurate filter for
  // "actual syncable change happened."
  const unsubProfile = useProfile.subscribe((state, prev) => {
    if (state.profileUpdatedAt !== prev.profileUpdatedAt) {
      schedulePush()
    }
  })

  const onAppState = (state: AppStateStatus) => {
    if (state === 'active') {
      // Fire and forget — errors are already handled inside the steps.
      void catchUp('foreground')
      return
    }
    // The foreground catch-up pulls anyway, and brings a fresh retry budget.
    cancelReadRetry()
    cancelPushRetry()
    cancelUploadChecks()
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
  const debouncedRemotePull = debounce(
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

  // Sync often becomes ready after launch: supporter status loads
  // asynchronously (and flips again when this device adopts another device's
  // account), and iCloud can sign back in. `canSync` dropped any foreground
  // or remote-change events before then — and a cold launch usually delivers
  // no foreground event at all — so catch up here or nothing pulls until the
  // user taps Sync. Deliberately not keyed on `iCloudSyncEnabled`: enable
  // flows reconcile themselves, and a concurrent pull would race "Keep this
  // device's data".
  const catchUpIfActive = (reason: string) => {
    if (AppState.currentState === 'active') void catchUp(reason)
  }
  const unsubSupporter = useSupporter.subscribe((state, prev) => {
    if (state.isSupporter && !prev.isSupporter) {
      catchUpIfActive('supporter-ready')
    }
  })
  availabilitySub = ICloudBridge.addAvailabilityChangeListener((e) => {
    checkICloudIdentity('availability')
    if (!e.available) {
      logger.warn(`${tag()} iCloud became unavailable`)
      return
    }
    catchUpIfActive('icloud-available')
  })
  catchUpIfActive('launch')

  return () => {
    unsubContacts()
    unsubConversations()
    unsubServiceReports()
    unsubCategories()
    unsubMileage()
    unsubPreferences()
    unsubProfile()
    unsubSupporter()
    appStateSub.remove()
    remoteChangeSub?.remove()
    availabilitySub?.remove()
    debouncedRemotePull.cancel()
    cancelReadRetry()
    cancelPushRetry()
    cancelUploadChecks()
    debouncedPush.cancel()
    pushScheduled = false
    installed = false
  }
}

/** The per-device toggle pauses photo transfer; shared cleanup is explicit. */
export function clearCloudPhotos(): Promise<void> {
  return serializeImages(async () => {
    await ICloudBridge.deleteAllBinaries()
    usePreferences.setState({ iCloudImageSync: {} })
  })
}

export async function disableImageSync(): Promise<void> {
  usePreferences.setState({ iCloudSyncIncludeImages: false })
}

/**
 * Opt-in flip: turns image sync on, then kicks off BOTH directions of the
 * first-pass migration so the device converges on the cross-device image set
 * regardless of which side has bytes:
 *
 * - Push uploads every local `file://` avatar we haven't sent yet (the typical "I
 *   already have photos, now I want them on my other devices" story).
 * - Pull downloads any `icloud://` markers already sitting in local state — for
 *   example, after an onboarding restore where the user said "no" to the
 *   download-photos prompt and later opts in via Settings. Without this pass,
 *   markers would linger with no local files until the next
 *   merge-that-changes-something, which may never come.
 */
export async function enableImageSync(): Promise<void> {
  usePreferences.setState({ iCloudSyncIncludeImages: true })
  if (canSync() && !(await push('images-enabled'))) {
    throw new Error('Could not write photo references to iCloud')
  }
  await pullImagesIfEnabled(!canSync())
}

/** For tests + the Settings "Sync now" button. */
export const iCloudSync = {
  push,
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
}
