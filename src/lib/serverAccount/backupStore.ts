import { Platform } from 'react-native'
import { getRandomBytes } from 'expo-crypto'
import { MMKV } from 'react-native-mmkv'
import { create } from 'zustand'
import { androidDeviceInstallId, getOrCreateInstallId } from '@/lib/installId'
import { logger } from '@/lib/logger'
import { newBackupSlotId } from '@/lib/serverAccount/backupCrypto'
import type { BackupSlot } from '@/lib/serverAccount/backupClient'
import {
  type BackupSchedule,
  EMPTY_BACKUP_SCHEDULE,
} from '@/lib/serverAccount/backupScheduler'

/**
 * This install's backup state (ADR 0026 §4), in the device-local
 * `server-account` MMKV next to the cached account: never synced or backed up
 * itself. Holds no data and no keys, only whether backup is on, this install's
 * slot id, when it last uploaded, and a short log of codes for Tools.
 */

export type BackupLogEntry = {
  at: number
  level: 'info' | 'warn'
  message: string
}

const LOG_LIMIT = 60

type Persisted = {
  enabled: boolean
  /** This install's slot, `v1/<accountId>/<slotId>` on the server. */
  slotId: string | null
  /** The install id the slot belongs to; a copied install gets a new slot. */
  slotBinding: string | null
  schedule: BackupSchedule
  /** The `accountPub` whose backup this install was offered to restore. */
  restoreOfferedFor: string | null
  log: BackupLogEntry[]
}

export type BackupState = Persisted & {
  /** An upload is running. */
  uploading: boolean
  /** A restore is downloading or applying. */
  restoring: boolean
  /** The account's slots as last listed, for Settings. */
  slots: BackupSlot[] | null
  slotsAccountId: string | null
  slotsListedAt: number | null
  /** Bumped to ask the running backup to upload soon (`requestBackupSoon`). */
  nudge: number
}

const DEFAULTS: Persisted = {
  enabled: false,
  slotId: null,
  slotBinding: null,
  schedule: EMPTY_BACKUP_SCHEDULE,
  restoreOfferedFor: null,
  log: [],
}

const KEY = 'backup'
let _store: MMKV | null = null
const mmkv = (): MMKV => (_store ??= new MMKV({ id: 'server-account' }))

function load(): Persisted {
  try {
    const raw = mmkv().getString(KEY)
    if (!raw) return DEFAULTS
    const saved = JSON.parse(raw) as Partial<Persisted>
    return {
      ...DEFAULTS,
      ...saved,
      schedule: { ...EMPTY_BACKUP_SCHEDULE, ...saved.schedule },
    }
  } catch (error) {
    logger.warn('[backup] state unreadable; starting over', error)
    return DEFAULTS
  }
}

export const useBackupState = create<BackupState>(() => ({
  ...load(),
  uploading: false,
  restoring: false,
  slots: null,
  slotsAccountId: null,
  slotsListedAt: null,
  nudge: 0,
}))

useBackupState.subscribe((state, previous) => {
  if (
    state.enabled === previous.enabled &&
    state.slotId === previous.slotId &&
    state.slotBinding === previous.slotBinding &&
    state.schedule === previous.schedule &&
    state.restoreOfferedFor === previous.restoreOfferedFor &&
    state.log === previous.log
  )
    return
  const persisted: Persisted = {
    enabled: state.enabled,
    slotId: state.slotId,
    slotBinding: state.slotBinding,
    schedule: state.schedule,
    restoreOfferedFor: state.restoreOfferedFor,
    log: state.log,
  }
  try {
    mmkv().set(KEY, JSON.stringify(persisted))
  } catch (error) {
    logger.warn('[backup] state not saved', error)
  }
})

export const backupSchedule = {
  get: () => useBackupState.getState().schedule,
  // A patch that changes nothing (re-arming the same attempt) keeps the state,
  // so it isn't saved again.
  set: (patch: Partial<BackupSchedule>) =>
    useBackupState.setState((state) =>
      Object.entries(patch).every(
        ([key, value]) => state.schedule[key as keyof BackupSchedule] === value
      )
        ? state
        : { schedule: { ...state.schedule, ...patch } }
    ),
}

/** Adds a line to the Tools log: codes and sizes, never data or ids. */
export function logBackup(level: BackupLogEntry['level'], message: string) {
  if (level === 'warn') logger.warn(`[backup] ${message}`)
  else logger.log(`[backup] ${message}`)
  useBackupState.setState((state) => ({
    log: [{ at: Date.now(), level, message }, ...state.log].slice(0, LOG_LIMIT),
  }))
}

/**
 * What binds a slot to this install. Android uses the `ANDROID_ID`-derived id,
 * because Auto Backup copies MMKV (and a stored id) to a restored phone, which
 * must not write into the old phone's slot.
 */
function installBinding(): string | null {
  try {
    // The web keeps its own random id, as an iPhone without a Keychain one does.
    if (Platform.OS === 'android') return androidDeviceInstallId()
    return getOrCreateInstallId()
  } catch {
    return null
  }
}

/** This install's slot id, made the first time and again for a copied install. */
export function ensureBackupSlotId(): string {
  const { slotId, slotBinding } = useBackupState.getState()
  const binding = installBinding()
  if (slotId && (binding === null || slotBinding === binding)) return slotId
  if (slotId && slotBinding === null) {
    // Kept from before the binding was known.
    useBackupState.setState({ slotBinding: binding })
    return slotId
  }
  const next = newBackupSlotId(getRandomBytes)
  useBackupState.setState({
    slotId: next,
    slotBinding: binding,
    // Another install's history isn't this one's.
    schedule: { ...EMPTY_BACKUP_SCHEDULE, pending: true },
  })
  return next
}

/**
 * Asks the app's backup to upload soon, as a data change would: for changes
 * outside the synced stores, such as a new account key after Delete Buddies.
 */
export const requestBackupSoon = () =>
  useBackupState.setState((state) => ({ nudge: state.nudge + 1 }))
