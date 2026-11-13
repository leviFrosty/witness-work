import { streetKey } from '@/features/territories/lib/streetSuggestions'
import { cleanHouses, knownHouses } from '@/features/territories/lib/houseList'
import type {
  Territory,
  TerritoryStreet,
} from '@/features/territories/types/territory'

export type HouseProgress = {
  total: number
  visited: number
  spoke: number
  notHome: number
  doNotCall: number
}

const EMPTY: HouseProgress = {
  total: 0,
  visited: 0,
  spoke: 0,
  notHome: 0,
  doNotCall: 0,
}

export const houseProgress = (
  street: Pick<TerritoryStreet, 'numbering' | 'houses' | 'doors'>
): HouseProgress | undefined => {
  const houses = knownHouses(street)
  if (!houses) return undefined
  const outcomes = new Map(
    street.doors.map((door) => [door.label.trim().toLowerCase(), door.outcome])
  )
  const progress = { ...EMPTY, total: houses.length }
  for (const house of houses) {
    const outcome = outcomes.get(house.toLowerCase())
    if (!outcome) continue
    progress.visited += 1
    progress[outcome] += 1
  }
  return progress
}

export const territoryHouseProgress = (
  territory: Pick<Territory, 'streets'>
): HouseProgress | undefined => {
  let sum: HouseProgress | undefined
  for (const street of territory.streets) {
    const progress = houseProgress(street)
    if (!progress) continue
    sum ??= { ...EMPTY }
    sum.total += progress.total
    sum.visited += progress.visited
    sum.spoke += progress.spoke
    sum.notHome += progress.notHome
    sum.doNotCall += progress.doNotCall
  }
  return sum
}

export const progressShare = (
  progress: Pick<HouseProgress, 'total' | 'visited'>
) => (progress.total === 0 ? 0 : progress.visited / progress.total)

export type FoundAddress = { street: string; number: string }

export type FoundStreet = { name: string; houses: string[] }

export const groupAddresses = (
  addresses: readonly FoundAddress[]
): Map<string, FoundStreet> => {
  const raw = new Map<string, { name: string; labels: string[] }>()
  for (const address of addresses) {
    const name = address.street.trim()
    if (!name) continue
    const key = streetKey(name)
    const entry = raw.get(key) ?? { name, labels: [] }
    entry.labels.push(address.number)
    raw.set(key, entry)
  }
  const grouped = new Map<string, FoundStreet>()
  for (const [key, { name, labels }] of raw) {
    const houses = cleanHouses(labels)
    if (houses.length > 0) grouped.set(key, { name, houses })
  }
  return grouped
}

export const fillHouses = (
  territory: Territory,
  found: ReadonlyMap<string, FoundStreet>
): Territory => {
  let changed = false
  const streets = territory.streets.map((street) => {
    if (street.numbering === 'none' || knownHouses(street)) return street
    const match = found.get(streetKey(street.name))
    if (!match) return street
    changed = true
    return { ...street, houses: match.houses }
  })
  return changed ? { ...territory, streets } : territory
}

export const streetsToFill = (
  streets: readonly Pick<TerritoryStreet, 'name' | 'numbering' | 'houses'>[],
  found: ReadonlyMap<string, FoundStreet>
): number =>
  streets.filter(
    (street) =>
      street.numbering !== 'none' &&
      !knownHouses(street) &&
      found.has(streetKey(street.name))
  ).length
