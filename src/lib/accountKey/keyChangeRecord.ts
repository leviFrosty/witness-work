/**
 * The change record (docs/account-key-change.md, "The device flow"): what a key
 * change in progress on this device has done, so it resumes after a crash at
 * any step. It holds both account keys, so it lives in this-device-only secret
 * storage, never synced or backed up, and is deleted when the change is done.
 */

/** In order; each stage is reached once the steps before it are done. */
export const KeyChangeStage = [
  'pending',
  'confirmed',
  'committed',
  'stored',
  'resealed',
  'buddies-reset',
] as const
export type KeyChangeStage = (typeof KeyChangeStage)[number]

export type KeyChangeRecord = {
  v: 1
  accountId: string
  /** K1, b64u. */
  oldKey: string
  /** K2, b64u. */
  newKey: string
  oldKeyEpoch: number
  stage: KeyChangeStage
  /** Epoch ms. */
  startedAt: number
  /** What the re-seal step finished, by id. */
  reseal?: { syncSlots: string[]; photos: string[]; backupSlots: string[] }
}

export const stageIndex = (stage: KeyChangeStage) =>
  KeyChangeStage.indexOf(stage)

/** Whether `record` reached `stage`. */
export const reached = (record: KeyChangeRecord, stage: KeyChangeStage) =>
  stageIndex(record.stage) >= stageIndex(stage)

/** From here on the account's key is K2, whatever the platform store holds. */
export const isCommitted = (record: KeyChangeRecord) =>
  reached(record, 'committed')

/** Where the record is kept: one per device. */
export type KeyChangeRecordStore = {
  read: () => Promise<KeyChangeRecord | null>
  write: (record: KeyChangeRecord) => Promise<void>
  remove: () => Promise<void>
}

const isKey = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)

const isIds = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((id) => typeof id === 'string')

/** Null when it isn't a record this version can resume. */
export function parseKeyChangeRecord(
  raw: string | null
): KeyChangeRecord | null {
  if (!raw) return null
  let value: Partial<KeyChangeRecord> | null
  try {
    value = JSON.parse(raw) as Partial<KeyChangeRecord> | null
  } catch {
    return null
  }
  if (
    value?.v !== 1 ||
    typeof value.accountId !== 'string' ||
    !isKey(value.oldKey) ||
    !isKey(value.newKey) ||
    value.oldKey === value.newKey ||
    typeof value.oldKeyEpoch !== 'number' ||
    !Number.isSafeInteger(value.oldKeyEpoch) ||
    value.oldKeyEpoch < 0 ||
    !KeyChangeStage.includes(value.stage as KeyChangeStage) ||
    typeof value.startedAt !== 'number'
  )
    return null
  const reseal = value.reseal
  return {
    v: 1,
    accountId: value.accountId,
    oldKey: value.oldKey,
    newKey: value.newKey,
    oldKeyEpoch: value.oldKeyEpoch,
    stage: value.stage as KeyChangeStage,
    startedAt: value.startedAt,
    ...(reseal &&
      isIds(reseal.syncSlots) &&
      isIds(reseal.photos) &&
      isIds(reseal.backupSlots) && {
        reseal: {
          syncSlots: [...reseal.syncSlots],
          photos: [...reseal.photos],
          backupSlots: [...reseal.backupSlots],
        },
      }),
  }
}

/** For tests and the developer Tools. */
export function memoryKeyChangeRecordStore(): KeyChangeRecordStore {
  let value: string | null = null
  return {
    read: async () => parseKeyChangeRecord(value),
    write: async (record) => {
      value = JSON.stringify(record)
    },
    remove: async () => {
      value = null
    },
  }
}
