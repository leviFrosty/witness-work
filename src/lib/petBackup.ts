import { z } from 'zod'
import {
  PET_SPECIES_IDS,
  type PetKeepsake,
  type PetRecord,
  type PetRoomRecord,
  type PetTombstone,
} from '@/types/pet'
import {
  keptKeepsakes,
  keptPurchases,
  keptRoomItems,
  keptWakes,
} from '@/lib/petHistory'

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const stamp = z.number().finite().nonnegative()

const petSchema = z
  .object({
    id: z.string().min(1),
    species: z.enum(PET_SPECIES_IDS),
    coat: z.string(),
    name: z.string().optional(),
    adoptedOn: dayKey,

    wakes: z.array(z.unknown()).optional().catch(undefined),
    keepsakes: z.array(z.unknown()).optional().catch(undefined),
    earnedRoomItems: z.array(z.unknown()).optional().catch(undefined),
    purchases: z.array(z.unknown()).optional().catch(undefined),
    seed: z.string().min(1).max(64).optional().catch(undefined),
    updatedAt: stamp,
  })
  .passthrough()

const roomSchema = z
  .object({
    id: z.string().min(1),
    window: z.object({ time: z.string(), season: z.string() }).partial(),
    updatedAt: stamp,
  })
  .passthrough()

const tombstoneSchema = z.object({ id: z.string().min(1), deletedAt: stamp })
const keepsakeSchema = z.object({ kind: z.string(), on: dayKey })

type PetSlice = {
  pet?: PetRecord | null
  room?: PetRoomRecord | null
  deletedPetRecords?: PetTombstone[]
}

export function petSliceFromBackup(value: unknown): PetSlice {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const slice = value as Record<string, unknown>
  const result: PetSlice = {}

  if (slice.pet === null) result.pet = null
  else {
    const parsed = petSchema.safeParse(slice.pet)
    if (parsed.success) {
      const { wakes, keepsakes, earnedRoomItems, purchases, seed, ...rest } =
        parsed.data
      const bought = keptPurchases(purchases ?? [])

      const earned = keptRoomItems(
        (earnedRoomItems ?? []).filter(
          (item): item is string => typeof item === 'string'
        )
      )
      result.pet = {
        ...rest,
        ...(seed ? { seed } : {}),
        ...(earned.length > 0 ? { earnedRoomItems: earned } : {}),
        ...(bought.length > 0 ? { purchases: bought } : {}),
        wakes: keptWakes(
          (wakes ?? []).filter(
            (day): day is string => dayKey.safeParse(day).success
          )
        ),

        keepsakes: keptKeepsakes(
          (keepsakes ?? []).flatMap((keepsake) => {
            const entry = keepsakeSchema.safeParse(keepsake)
            return entry.success ? [entry.data as PetKeepsake] : []
          })
        ),
      } as PetRecord
    }
  }

  if (slice.room === null) result.room = null
  else {
    const parsed = roomSchema.safeParse(slice.room)
    if (parsed.success) result.room = parsed.data as unknown as PetRoomRecord
  }

  if (Array.isArray(slice.deletedPetRecords))
    result.deletedPetRecords = slice.deletedPetRecords.flatMap((tombstone) => {
      const parsed = tombstoneSchema.safeParse(tombstone)
      return parsed.success ? [parsed.data] : []
    })

  return result
}
