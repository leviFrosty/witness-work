import { doorVisits } from '@/features/territories/lib/doors'
import type {
  DoorOutcome,
  Territory,
  TerritoryVisit,
} from '@/features/territories/types/territory'

export type VisitMark = 's' | 'n'
export type CountedVisit = [at: number, mark: VisitMark]
export type VisitCell = [spoke: number, notHome: number]

export type TerritoryTally = {
  title: string
  cells: Record<string, VisitCell>
}

export type CountedDoor = {
  territory: string
  visits: CountedVisit[]
  goneAt?: number
}

export type VisitTally = {
  territories: Record<string, TerritoryTally>
  doors: Record<string, CountedDoor>
  readyAt?: number
  seenAt?: number
}

export type PastVisit = { at: number; outcome: DoorOutcome }

export const EMPTY_TALLY: VisitTally = { territories: {}, doors: {} }

export const MIN_INSIGHT_VISITS = 40

export const GONE_KEPT_MS = 120 * 24 * 60 * 60 * 1000

export const monthOf = (at: number) => {
  const date = new Date(at)
  return date.getFullYear() * 12 + date.getMonth()
}

export const cellKey = (day: number, hour: number, month: number) =>
  `${month}:${day}-${hour}`

export const cellKeyAt = (at: number) => {
  const date = new Date(at)
  return cellKey(date.getDay(), date.getHours(), monthOf(at))
}

export const parseCellKey = (key: string) => {
  const match = /^(\d+):(\d)-(\d{1,2})$/.exec(key)
  if (!match) return undefined
  return {
    month: Number(match[1]),
    day: Number(match[2]),
    hour: Number(match[3]),
  }
}

export const cellsTotal = (cells: TerritoryTally['cells']) =>
  Object.values(cells).reduce(
    (sum, [spoke, notHome]) => sum + spoke + notHome,
    0
  )

export const tallyTotal = (tally: Pick<VisitTally, 'territories'>) =>
  Object.values(tally.territories).reduce(
    (sum, territory) => sum + cellsTotal(territory.cells),
    0
  )

const countable = (visit: TerritoryVisit): CountedVisit | undefined =>
  visit.untimed || visit.outcome === 'doNotCall'
    ? undefined
    : [visit.at, visit.outcome === 'spoke' ? 's' : 'n']

const visitKey = ([at, mark]: CountedVisit) => `${at}:${mark}`

class Draft {
  territories: VisitTally['territories']
  doors: VisitTally['doors']
  changed = false
  private copied = new Set<string>()

  constructor(private readonly from: VisitTally) {
    this.territories = from.territories
    this.doors = from.doors
  }

  private territory(id: string, title?: string): TerritoryTally {
    if (this.territories === this.from.territories)
      this.territories = { ...this.territories }
    if (!this.copied.has(id)) {
      const was = this.territories[id]
      this.territories[id] = {
        title: title ?? was?.title ?? '',
        cells: { ...was?.cells },
      }
      this.copied.add(id)
    } else if (title !== undefined) this.territories[id].title = title
    return this.territories[id]
  }

  title(id: string, title: string) {
    if (this.territories[id]?.title === title) return
    this.territory(id, title)
    this.changed = true
  }

  count(territoryId: string, [at, mark]: CountedVisit, sign: 1 | -1) {
    const { cells } = this.territory(territoryId)
    const key = cellKeyAt(at)
    const [spoke, notHome] = cells[key] ?? [0, 0]
    const next: VisitCell =
      mark === 's'
        ? [Math.max(0, spoke + sign), notHome]
        : [spoke, Math.max(0, notHome + sign)]
    if (next[0] === 0 && next[1] === 0) delete cells[key]
    else cells[key] = next
    this.changed = true
  }

  setDoor(id: string, door: CountedDoor | undefined) {
    if (this.doors === this.from.doors) this.doors = { ...this.doors }
    if (door === undefined) delete this.doors[id]
    else this.doors[id] = door
    this.changed = true
  }

  done(now: number): VisitTally {
    if (!this.changed) return this.from
    const readyAt =
      this.from.readyAt ??
      (tallyTotal({ territories: this.territories }) >= MIN_INSIGHT_VISITS
        ? now
        : undefined)
    return {
      ...this.from,
      territories: this.territories,
      doors: this.doors,
      readyAt,
    }
  }
}

export type TallyOptions = {
  now: number
  title: (territory: Territory) => string
  keepGone: boolean
}

export function tallyDoors(
  tally: VisitTally,
  territories: readonly Territory[],
  { now, title, keepGone }: TallyOptions
): VisitTally {
  const draft = new Draft(tally)
  const present = new Set<string>()
  for (const territory of territories) {
    let counted = false
    for (const street of territory.streets)
      for (const door of street.doors) {
        present.add(door.id)
        counted = true
        const want = doorVisits(door).flatMap((visit) => {
          const countedVisit = countable(visit)
          return countedVisit ? [countedVisit] : []
        })
        const had = draft.doors[door.id]
        const owner = had?.territory ?? territory.id
        const wanted = new Set(want.map(visitKey))
        const haveKeys = new Set((had?.visits ?? []).map(visitKey))
        const dropped = (had?.visits ?? []).filter(
          (visit) => !wanted.has(visitKey(visit))
        )
        const added = want.filter((visit) => !haveKeys.has(visitKey(visit)))
        if (dropped.length === 0 && added.length === 0 && !had?.goneAt) continue
        for (const visit of dropped) draft.count(owner, visit, -1)
        for (const visit of added) draft.count(owner, visit, 1)
        draft.setDoor(door.id, { territory: owner, visits: want })
      }
    if (counted || draft.territories[territory.id])
      draft.title(territory.id, title(territory))
  }
  for (const [id, door] of Object.entries(draft.doors)) {
    if (present.has(id)) continue
    if (!keepGone) draft.setDoor(id, undefined)
    else if (door.goneAt === undefined)
      draft.setDoor(id, { ...door, goneAt: now })
    else if (now - door.goneAt > GONE_KEPT_MS) draft.setDoor(id, undefined)
  }
  return draft.done(now)
}

export function forgetDoors(
  tally: VisitTally,
  doorIds: readonly string[],
  now: number
): VisitTally {
  const draft = new Draft(tally)
  for (const id of doorIds) {
    const counted = draft.doors[id]
    if (!counted) continue
    for (const visit of counted.visits)
      draft.count(counted.territory, visit, -1)
    draft.setDoor(id, undefined)
  }
  return draft.done(now)
}

export function addPastVisits(
  tally: VisitTally,
  territory: { id: string; title: string },
  visits: readonly PastVisit[],
  now: number
): VisitTally {
  const draft = new Draft(tally)
  draft.title(territory.id, territory.title)
  for (const visit of visits) {
    const counted = countable(visit)
    if (counted) draft.count(territory.id, counted, 1)
  }
  return draft.done(now)
}
