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
import { analytics } from '@/lib/analytics'
import { AppState, AppStateStatus, Platform } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import debounce from 'lodash/debounce'
import * as ICloudBridge from '../../../modules/icloud-bridge'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
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
import { isAccountFilename } from '@/lib/accountFile'
import { reclaimAccountFile } from '@/lib/account'
import { logger } from '@/lib/logger'
import { errorTracking } from '@/lib/errorTracking'
import * as Device from 'expo-device'
import { EventSubscription } from 'expo-modules-core'
import { CustomFieldDefinition } from '@/types/customField'
import { Category } from '@/types/category'
import { migrateNormalizeDates } from '@/lib/normalizeDate'
import { stripTombstonedCustomFields } from '@/lib/customFields'
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

/** Same coalescing as `pullInFlight`, for `catchUp`. */
let catchUpInFlight = false
let catchUpQueuedReason: string | null = null

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

/**
 * Whether the user has opted into iCloud sync AND is currently entitled to it
 * AND iCloud is actually usable. The supporter check is a runtime gate: if the
 * subscription lapses between syncs, push/pull immediately stop even before the
 * lapse-flip effect in `App.tsx` clears `iCloudSyncEnabled`.
 */
export function canSync(): boolean {
  if (Platform.OS !== 'ios') return false
  const { iCloudSyncEnabled } = usePreferences.getState()
  if (!iCloudSyncEnabled) return false
  if (!useSupporter.getState().isSupporter) return false
  return ICloudBridge.isAvailable()
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

  const reports = useServiceReport.getState()
  if (reports.dayPlans.length > 0) return true
  if (reports.recurringPlans.length > 0) return true
  if (reports.deletedServiceReports.length > 0) return true
  for (const year of Object.values(reports.serviceReports)) {
    for (const month of Object.values(year)) {
      if (month.length > 0) return true
    }
  }
  const categories = useCategories.getState()
  if (categories.categories.length > 0) return true
  if (categories.deletedCategories.length > 0) return true
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
    })
    useCategories.setState({
      categories: (remote.categoryStore?.categories ?? []) as Category[],
      deletedCategories: remote.categoryStore?.deletedCategories ?? [],
    })

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
 * The inverse of `replaceLocalWithRemote`: wipes every remote file so nothing
 * on iCloud shadows what's about to be pushed, then pushes fresh from this
 * device. Used by the first-enable sheet's "Keep this device's data" branch.
 */
export async function overwriteRemoteWithLocal(): Promise<void> {
  await ICloudBridge.deleteAll()
  await clearCloudPhotos()
  await reclaimAccountFile(useSupporter.getState().isSupporter)
  usePreferences.getState().set({
    iCloudSyncEnabled: true,
    iCloudSyncNeedsResolution: false,
    iCloudFreshSetup: false,
  })
  if (!(await push('overwrite-remote'))) throw new Error('iCloud write failed')
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
  | { status: 'found'; remote: SyncPayload }
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
 */
export async function peekRemotePayload(): Promise<RemotePeek> {
  if (Platform.OS !== 'ios') return { status: 'unavailable' }
  if (!ICloudBridge.isAvailable()) return { status: 'unavailable' }
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
        return remote ? { status: 'found', remote } : { status: 'none' }
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
 *   `SupporterSyncDefault` should leave sync disabled and defer to Settings).
 */
export type InitialEnableDecision =
  | { outcome: 'unavailable' }
  | { outcome: 'incomplete'; reason: RemoteIncompleteReason }
  | { outcome: 'seed' }
  | { outcome: 'pull'; remote: SyncPayload }
  | { outcome: 'conflict'; remote: SyncPayload }

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
      return { outcome: 'conflict', remote: peek.remote }
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
      preferenceKeys: Object.keys(payload.preferencesStore.values).length,
    })
    await ICloudBridge.write(filename, json)
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
      const outcome = await pullAndMergeInner(reason)
      lastPullComplete = outcome.complete
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

async function pullAndMergeInner(reason: string): Promise<PullOutcome> {
  if (!canSync()) {
    logger.log(`${tag()} pullAndMerge skipped (canSync=false)`, { reason })
    return { changed: false, complete: false }
  }

  logger.log(`${tag()} pullAndMerge start`, { reason })

  const deviceId = ensureDeviceId()
  const ownFilename = filenameForDevice(deviceId)

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

  if (!canSync()) return { changed: false, complete: false }
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
    serviceReports: serviceReportState.serviceReports,
    dayPlans: serviceReportState.dayPlans,
    recurringPlans: serviceReportState.recurringPlans,
    deletedServiceReports: serviceReportState.deletedServiceReports,
    categories: categoriesState.categories,
    deletedCategories: categoriesState.deletedCategories,
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
  })
  // Same rationale as `replaceLocalWithRemote`: a peer device could have
  // written un-normalized dates. Re-anchor before applying.
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
    })
  )
  categoriesState.set({
    categories: acc.categories,
    deletedCategories: acc.deletedCategories,
  })

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
    unsubPreferences()
    unsubProfile()
    unsubSupporter()
    appStateSub.remove()
    remoteChangeSub?.remove()
    availabilitySub?.remove()
    debouncedRemotePull.cancel()
    cancelReadRetry()
    cancelPushRetry()
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
  backfillUpdatedAtIfNeeded,
  hasMeaningfulLocalData,
  replaceLocalWithRemote,
  overwriteRemoteWithLocal,
  peekRemotePayload,
  resolveInitialEnable,
  applySeedEnable,
  applyPullEnable,
  enableImageSync,
  disableImageSync,
  clearCloudPhotos,
  pushImagesIfEnabled: () => pushImagesIfEnabled('foreground'),
  pullImagesIfEnabled: () => pullImagesIfEnabled(true),
  gcImagesIfEnabled,
  isPushScheduled: () => pushScheduled,
}
