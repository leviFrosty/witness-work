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
