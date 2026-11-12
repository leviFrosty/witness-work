import { fromB64u } from '@/lib/bytes'
import { clip } from '@/lib/sharedSpaces/records'
import { isScopeId } from '@/lib/sharedSpaces/scopes'
import {
  type DoorFields,
  type GuestFields,
  readDoNotCallData,
  readDoorData,
  readGuestData,
  readStreetData,
  readWorkedData,
  type StreetFields,
  TERRITORY_LIMITS,
  type WorkedFields,
  withUnknownFields,
  doNotCallData as territoryDoNotCallData,
  doorData as territoryDoorData,
  guestData as territoryGuestData,
  workedData as territoryWorkedData,
} from '@/features/territories/lib/shared/territoryRecords'
import type { Coordinate } from '@/types/contact'

export const GUEST_FIELD_LIMITS = {
  title: TERRITORY_LIMITS.title,
  from: TERRITORY_LIMITS.personName,
  streetName: TERRITORY_LIMITS.streetName,
  doorLabel: TERRITORY_LIMITS.doorLabel,
  description: TERRITORY_LIMITS.description,
  address: TERRITORY_LIMITS.address,
  name: TERRITORY_LIMITS.personName,
} as const

export type RecordData = Record<string, unknown>

export type GuestKeysData = {
  title: string
  from: string
  houseRecords: boolean
  scopes: Record<string, Record<number, Uint8Array>>
  expiresAt: number
}

export type StreetData = StreetFields
export type WorkedData = WorkedFields
export type DoorData = DoorFields
export type DoNotCallData = {
  address: string
  at: number
  coordinate?: Coordinate
  label?: string
}
export type GuestData = GuestFields

const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

function readKey(value: unknown): Uint8Array | null {
  if (typeof value !== 'string') return null
  try {
    const key = fromB64u(value)
    return key.length === 32 ? key : null
  } catch {
    return null
  }
}

export function readGuestKeys(data: RecordData): GuestKeysData | null {
  const { title, from, houseRecords, scopes, expiresAt } = data
  if (
    typeof title !== 'string' ||
    typeof from !== 'string' ||
    typeof houseRecords !== 'boolean' ||
    !isTime(expiresAt) ||
    typeof scopes !== 'object' ||
    scopes === null ||
    Array.isArray(scopes)
  )
    return null
  const keys: GuestKeysData['scopes'] = {}
  for (const [scopeId, epochs] of Object.entries(scopes)) {
    if (!isScopeId(scopeId) || typeof epochs !== 'object' || epochs === null)
      continue
    const byEpoch: Record<number, Uint8Array> = {}
    for (const [epoch, key] of Object.entries(epochs)) {
      const number = Number(epoch)
      const bytes = readKey(key)
      if (Number.isSafeInteger(number) && number >= 1 && bytes)
        byEpoch[number] = bytes
    }
    if (Object.keys(byEpoch).length > 0) keys[scopeId] = byEpoch
  }
  return {
    title: clip(title, GUEST_FIELD_LIMITS.title),
    from: clip(from, GUEST_FIELD_LIMITS.from),
    houseRecords,
    scopes: keys,
    expiresAt,
  }
}

export const readStreet = (data: RecordData): StreetData | null =>
  readStreetData(data)

export const readWorked = (data: RecordData): WorkedData | null =>
  readWorkedData(data)

export const readDoor = (data: RecordData): DoorData | null =>
  readDoorData(data)

export const readDoNotCall = (data: RecordData): DoNotCallData | null =>
  readDoNotCallData(data)

export const readGuest = (data: RecordData): GuestData | null =>
  readGuestData(data)

export const doorData = (door: DoorData, previous?: RecordData): RecordData =>
  withUnknownFields(
    'door',
    previous,
    territoryDoorData({ ...door, id: '' }, door.by ?? '', door.byName)
  )

export const workedData = (
  worked: WorkedData,
  previous?: RecordData
): RecordData =>
  withUnknownFields(
    'worked',
    previous,
    territoryWorkedData(worked.at, worked.by ?? '', worked.byName)
  )

export const doNotCallData = (
  entry: DoNotCallData,
  previous?: RecordData
): RecordData =>
  withUnknownFields(
    'doNotCall',
    previous,
    territoryDoNotCallData({ ...entry, id: '' })
  )

export const guestData = (guest: GuestData, previous?: RecordData) =>
  withUnknownFields('guest', previous, territoryGuestData(guest))
