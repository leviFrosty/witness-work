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

  oldKey: string

  newKey: string
  oldKeyEpoch: number
  stage: KeyChangeStage

  startedAt: number

  reseal?: { syncSlots: string[]; photos: string[]; backupSlots: string[] }
}

export const stageIndex = (stage: KeyChangeStage) =>
  KeyChangeStage.indexOf(stage)

export const reached = (record: KeyChangeRecord, stage: KeyChangeStage) =>
  stageIndex(record.stage) >= stageIndex(stage)

export const isUnfinished = (record: KeyChangeRecord | null) =>
  record !== null &&
  reached(record, 'stored') &&
  !reached(record, 'buddies-reset')

export const isCommitted = (record: KeyChangeRecord) =>
  reached(record, 'committed')

export type KeyChangeRecordStore = {
  read: () => Promise<KeyChangeRecord | null>
  write: (record: KeyChangeRecord) => Promise<void>
  remove: () => Promise<void>
}

const isKey = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)

const isIds = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((id) => typeof id === 'string')

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
