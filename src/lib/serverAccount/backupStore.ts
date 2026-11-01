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

export type BackupLogEntry = {
  at: number
  level: 'info' | 'warn'
  message: string
}

const LOG_LIMIT = 60

type Persisted = {
  enabled: boolean

  slotId: string | null

  slotBinding: string | null
  schedule: BackupSchedule

  restoreOfferedFor: string | null
  log: BackupLogEntry[]
}

export type BackupState = Persisted & {
  uploading: boolean

  restoring: boolean

  slots: BackupSlot[] | null
  slotsAccountId: string | null
  slotsListedAt: number | null

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

  set: (patch: Partial<BackupSchedule>) =>
    useBackupState.setState((state) =>
      Object.entries(patch).every(
        ([key, value]) => state.schedule[key as keyof BackupSchedule] === value
      )
        ? state
        : { schedule: { ...state.schedule, ...patch } }
    ),
}

export function logBackup(level: BackupLogEntry['level'], message: string) {
  if (level === 'warn') logger.warn(`[backup] ${message}`)
  else logger.log(`[backup] ${message}`)
  useBackupState.setState((state) => ({
    log: [{ at: Date.now(), level, message }, ...state.log].slice(0, LOG_LIMIT),
  }))
}

function installBinding(): string | null {
  try {
    return Platform.OS === 'android'
      ? androidDeviceInstallId()
      : getOrCreateInstallId()
  } catch {
    return null
  }
}

export function ensureBackupSlotId(): string {
  const { slotId, slotBinding } = useBackupState.getState()
  const binding = installBinding()
  if (slotId && (binding === null || slotBinding === binding)) return slotId
  if (slotId && slotBinding === null) {
    useBackupState.setState({ slotBinding: binding })
    return slotId
  }
  const next = newBackupSlotId(getRandomBytes)
  useBackupState.setState({
    slotId: next,
    slotBinding: binding,

    schedule: { ...EMPTY_BACKUP_SCHEDULE, pending: true },
  })
  return next
}

export const requestBackupSoon = () =>
  useBackupState.setState((state) => ({ nudge: state.nudge + 1 }))
