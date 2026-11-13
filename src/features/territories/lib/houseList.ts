import type { TerritoryStreet } from '@/features/territories/types/territory'

export const MAX_HOUSES = 300

export const MAX_HOUSE_LABEL = 12

type Parsed = { number: number; rest: string }

const parse = (label: string): Parsed | undefined => {
  const match = /^(\d+)\s*(.*)$/.exec(label.trim())
  if (!match) return undefined
  return { number: Number(match[1]), rest: match[2]!.toLowerCase() }
}

export const compareHouses = (left: string, right: string) => {
  const a = parse(left)
  const b = parse(right)
  if (a && b)
    return a.number - b.number || a.rest.localeCompare(b.rest, undefined)
  if (a) return -1
  if (b) return 1
  return left.localeCompare(right)
}

export const cleanHouses = (labels: readonly unknown[]): string[] => {
  const seen = new Set<string>()
  const houses: string[] = []
  for (const value of labels) {
    if (typeof value !== 'string') continue
    const label = value.trim()
    if (!label || label.length > MAX_HOUSE_LABEL) continue
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    houses.push(label)
  }
  return houses.sort(compareHouses).slice(0, MAX_HOUSES)
}

export const knownHouses = (
  street: Pick<TerritoryStreet, 'numbering' | 'houses'>
): readonly string[] | undefined =>
  street.numbering !== 'none' && street.houses && street.houses.length > 0
    ? street.houses
    : undefined

const onSide = (
  numbering: TerritoryStreet['numbering'],
  number: number
): boolean =>
  numbering === 'odd'
    ? number % 2 === 1
    : numbering === 'even'
      ? number % 2 === 0
      : true

export const nextKnownHouse = (
  street: Pick<TerritoryStreet, 'numbering' | 'houses'>,
  from: number,
  direction: 1 | -1
): number | undefined => {
  const houses = knownHouses(street)
  if (!houses) return undefined
  let best: number | undefined
  for (const label of houses) {
    if (!/^\d+$/.test(label)) continue
    const number = Number(label)
    if (!onSide(street.numbering, number)) continue
    if (direction === 1 ? number <= from : number >= from) continue
    if (best === undefined || (direction === 1 ? number < best : number > best))
      best = number
  }
  return best
}

export const firstKnownHouse = (
  street: Pick<TerritoryStreet, 'numbering' | 'houses' | 'descending'>
): number | undefined =>
  street.descending
    ? nextKnownHouse(street, Number.MAX_SAFE_INTEGER, -1)
    : nextKnownHouse(street, 0, 1)
