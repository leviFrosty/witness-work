import { parseRichText } from '@/lib/richText/parse'
import type { MileageRecord } from '@/lib/mileage/records'
import { COLLECTION_OF_KIND } from '@/lib/mileage/sharedCar'
import type {
  Fuel,
  FuelPrice,
  Trip,
  Vehicle,
  VehicleSetup,
} from '@/types/mileage'
import type { SharedCarRecordKind } from '@/types/sharedCars'

/**
 * A Shared Car's mileage records as Shared Spaces records
 * (docs/shared-cars-protocol.md, "Records"): each record's `recordId` is its
 * id, its `stamp` its `updatedAt`, and its `data` the record's own fields
 * without `id` (`mileageRecordData`). Readers take the fields they can use, and
 * keep every other one as it came (`extraFields`): fields they don't know, and
 * known ones holding a value they can't read (a newer note format, say). Those
 * go back out when they write the record, unless they set that field
 * themselves, so an older build never strips what a newer one added. A record
 * that isn't one never fails the sync.
 */

export const SHARED_CAR_KINDS: readonly SharedCarRecordKind[] = [
  'car',
  'setup',
  'fuel',
  'price',
  'trip',
]

export const isSharedCarKind = (kind: string): kind is SharedCarRecordKind =>
  (SHARED_CAR_KINDS as readonly string[]).includes(kind)

type AnyRecord = Record<string, unknown>

/**
 * The fields of `data` this version doesn't know (a newer app's), or null when
 * there are none. `known` lists the ones it does.
 */
export function unknownFields(
  data: AnyRecord,
  known: readonly string[]
): AnyRecord | null {
  const extra = Object.entries(data).filter(
    ([name, value]) => !known.includes(name) && value !== undefined
  )
  return extra.length > 0 ? Object.fromEntries(extra) : null
}

/**
 * The fields of a mileage record's `data` this version didn't read into
 * `record`: ones it doesn't know, and known ones whose value it can't use. Null
 * when it read them all.
 */
export function unreadMileageFields(
  data: AnyRecord,
  record: MileageRecord
): AnyRecord | null {
  const read = record as AnyRecord
  const extra = Object.entries(data).filter(
    ([name, value]) => value !== undefined && read[name] === undefined
  )
  return extra.length > 0 ? Object.fromEntries(extra) : null
}

const isString = (value: unknown): value is string => typeof value === 'string'
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)
const isDate = (value: unknown): value is string =>
  isString(value) && /^\d{4}-\d{2}-\d{2}$/.test(value)

/** The optional fields of `data` that pass `check`, by name. */
function optional(
  data: AnyRecord,
  checks: Record<string, (value: unknown) => boolean>
): AnyRecord {
  return Object.fromEntries(
    Object.entries(checks).flatMap(([name, check]) =>
      data[name] !== undefined && check(data[name]) ? [[name, data[name]]] : []
    )
  )
}

const readVehicle = (id: string, data: AnyRecord): Vehicle | null =>
  isString(data.name) && isNumber(data.createdAt)
    ? {
        id,
        name: data.name,
        ...optional(data, { archived: (v) => typeof v === 'boolean' }),
        createdAt: data.createdAt,
      }
    : null

const readFuel = (id: string, data: AnyRecord): Fuel | null =>
  isString(data.name) && isNumber(data.createdAt)
    ? { id, name: data.name, createdAt: data.createdAt }
    : null

const readPrice = (id: string, data: AnyRecord): FuelPrice | null =>
  isString(data.fuelId) &&
  isDate(data.effectiveFrom) &&
  isNumber(data.pricePerGallon)
    ? {
        id,
        fuelId: data.fuelId,
        effectiveFrom: data.effectiveFrom,
        pricePerGallon: data.pricePerGallon,
      }
    : null

const readSetup = (id: string, data: AnyRecord): VehicleSetup | null =>
  isString(data.vehicleId) && isDate(data.effectiveFrom)
    ? {
        id,
        vehicleId: data.vehicleId,
        effectiveFrom: data.effectiveFrom,
        ...optional(data, { fuelId: isString, milesPerGallon: isNumber }),
      }
    : null

function readTrip(id: string, data: AnyRecord): Trip | null {
  if (
    !isString(data.vehicleId) ||
    !isDate(data.date) ||
    !isNumber(data.distanceMiles) ||
    !isNumber(data.createdAt)
  )
    return null
  const noteDoc =
    data.noteDoc === undefined ? null : parseRichText(data.noteDoc)
  return {
    id,
    vehicleId: data.vehicleId,
    date: data.date,
    distanceMiles: data.distanceMiles,
    ...optional(data, {
      roundTrip: (v) => typeof v === 'boolean',
      odometerStartMiles: isNumber,
      odometerEndMiles: isNumber,
      note: isString,
      loggedBy: isString,
      editedBy: isString,
    }),
    ...(noteDoc && { noteDoc }),
    createdAt: data.createdAt,
  }
}

const READERS: Record<
  SharedCarRecordKind,
  (id: string, data: AnyRecord) => MileageRecord | null
> = {
  car: readVehicle,
  fuel: readFuel,
  price: readPrice,
  setup: readSetup,
  trip: readTrip,
}

/**
 * The mileage record a live record holds, its id the `recordId` and its
 * `updatedAt` the record's stamp (which the AAD binds, unlike `data`). Null
 * when `data` isn't one.
 */
export function readMileageRecord(
  kind: SharedCarRecordKind,
  recordId: string,
  stamp: number,
  data: AnyRecord
): MileageRecord | null {
  const record = READERS[kind](recordId, data)
  return record && ({ ...record, updatedAt: stamp } as MileageRecord)
}

/** The collection a kind's records live in. */
export const collectionOf = (kind: SharedCarRecordKind) =>
  COLLECTION_OF_KIND[kind]
