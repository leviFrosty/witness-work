import type {
  DoorOutcome,
  StreetNumbering,
  Territory,
  TerritoryDoNotCall,
  TerritoryDoor,
  TerritoryStreet,
  TerritoryVisit,
} from '@/features/territories/types/territory'

export const RETURN_WITHIN_MONTHS = 4

export const stepFor = (numbering: StreetNumbering) =>
  numbering === 'odd' || numbering === 'even' ? 2 : 1

export const startNumber = (numbering: StreetNumbering, typed?: number) => {
  if (numbering === 'none') return 1
  const start = typed && typed > 0 ? Math.floor(typed) : 1
  if (numbering === 'odd' && start % 2 === 0) return start + 1
  if (numbering === 'even' && start % 2 === 1) return start + 1
  return start
}

export const stepNumber = (
  street: Pick<TerritoryStreet, 'numbering'>,
  from: number,
  direction: 1 | -1
) => Math.max(1, from + stepFor(street.numbering) * direction)

export const wholeNumber = (label: string) =>
  /^\d+$/.test(label.trim()) ? Number(label.trim()) : undefined

export const CORRECTION_MS = 30 * 60 * 1000

export const MAX_DOOR_HISTORY = 20

export const doorVisits = (
  door: Pick<TerritoryDoor, 'at' | 'outcome' | 'untimed' | 'history'>
): TerritoryVisit[] => [
  ...(door.history ?? []),
  {
    at: door.at,
    outcome: door.outcome,
    ...(door.untimed && { untimed: true }),
  },
]

const historyAfter = (
  door: TerritoryDoor,
  at: number
): TerritoryVisit[] | undefined => {
  if (at - door.at < CORRECTION_MS) return door.history
  return doorVisits(door).slice(-MAX_DOOR_HISTORY)
}

const sameDay = (left: number, right: number) =>
  new Date(left).toDateString() === new Date(right).toDateString()

export const countsAsAnotherTry = (
  door: Pick<TerritoryDoor, 'at'>,
  at: number
) => !sameDay(door.at, at)

export const nextUnrecorded = (street: TerritoryStreet, from: number) => {
  const direction = street.descending ? -1 : 1
  const taken = new Set(street.doors.map((door) => door.label))
  let next = stepNumber(street, from, direction)
  while (taken.has(String(next))) {
    const after = stepNumber(street, next, direction)
    if (after === next) break
    next = after
  }
  return next
}

const onSide = (
  street: Pick<TerritoryStreet, 'numbering' | 'descending'>,
  number: number
) => {
  const odd = number % 2 === 1
  const otherSide =
    (street.numbering === 'odd' && !odd) || (street.numbering === 'even' && odd)
  if (!otherSide) return number
  return street.descending ? number + 1 : number - 1
}

const OTHER_SIDE = { odd: 'even', even: 'odd' } as const

export const switchSide = (street: TerritoryStreet): TerritoryStreet => {
  if (street.numbering !== 'odd' && street.numbering !== 'even') return street
  const numbering = OTHER_SIDE[street.numbering]
  if (street.doors.length === 0)
    return {
      ...street,
      numbering,
      next: startNumber(numbering, street.next - 1),
    }
  const crossed: TerritoryStreet = {
    ...street,
    numbering,
    descending: street.descending ? undefined : true,
  }
  const facing = startNumber(
    numbering,
    street.descending ? street.next + 1 : street.next - 1
  )
  const taken = street.doors.some((door) => door.label === String(facing))
  return { ...crossed, next: taken ? nextUnrecorded(crossed, facing) : facing }
}

export const logDoor = (
  street: TerritoryStreet,
  entry: {
    id: string
    label: string
    outcome: DoorOutcome
    at: number
    description?: string
    by?: string
    untimed?: boolean
  }
): TerritoryStreet => {
  const label = entry.label.trim()
  const existing = street.doors.find((door) => door.label === label)
  const doors = existing
    ? street.doors.map((door) =>
        door === existing
          ? {
              ...door,
              outcome: entry.outcome,
              at: entry.at,
              tries: countsAsAnotherTry(door, entry.at)
                ? door.tries + 1
                : door.tries,
              description: entry.description,
              by: entry.by,
              untimed: entry.untimed || undefined,
              history: historyAfter(door, entry.at),
            }
          : door
      )
    : [
        ...street.doors,
        {
          id: entry.id,
          label,
          outcome: entry.outcome,
          at: entry.at,
          tries: 1,
          description: entry.description,
          by: entry.by,
          ...(entry.untimed && { untimed: true }),
        },
      ]
  const number = wholeNumber(label)
  return {
    ...street,
    doors,
    next:
      number === undefined
        ? street.next
        : nextUnrecorded({ ...street, doors }, onSide(street, number)),
  }
}

export const removeDoor = (
  street: TerritoryStreet,
  doorId: string
): TerritoryStreet => ({
  ...street,
  doors: street.doors.filter((door) => door.id !== doorId),
})

export const updateStreet = (
  territory: Territory,
  streetId: string,
  change: (street: TerritoryStreet) => TerritoryStreet
): Territory => ({
  ...territory,
  streets: territory.streets.map((street) =>
    street.id === streetId ? change(street) : street
  ),
})

export const saveStreet = (
  territory: Territory,
  street: TerritoryStreet
): Territory =>
  territory.streets.some((existing) => existing.id === street.id)
    ? updateStreet(territory, street.id, () => street)
    : { ...territory, streets: [...territory.streets, street] }

export const removeStreet = (
  territory: Territory,
  streetId: string
): Territory => ({
  ...territory,
  streets: territory.streets.filter((street) => street.id !== streetId),
})

export type DoorCounts = {
  total: number
  notHome: number
  spoke: number
  doNotCall: number
}

export const doorCounts = (doors: readonly TerritoryDoor[]): DoorCounts => ({
  total: doors.length,
  notHome: doors.filter((door) => door.outcome === 'notHome').length,
  spoke: doors.filter((door) => door.outcome === 'spoke').length,
  doNotCall: doors.filter((door) => door.outcome === 'doNotCall').length,
})

export const isHandedOff = (street: Pick<TerritoryStreet, 'handoff'>) =>
  street.handoff !== undefined

export const workingStreets = (territory: Pick<Territory, 'streets'>) =>
  territory.streets.filter((street) => !isHandedOff(street))

export const territoryCounts = (territory: Territory) => {
  const working = workingStreets(territory)
  return {
    ...doorCounts(working.flatMap((street) => street.doors)),
    streets: territory.streets.length,
    streetsWorked: territory.streets.filter(
      (street) => street.workedAt !== undefined
    ).length,
    handedOff: territory.streets.length - working.length,
  }
}

export const doorsInWalkingOrder = (
  doors: readonly TerritoryDoor[],
  descending = false
): TerritoryDoor[] => {
  const ordered = [...doors].sort((a, b) => {
    const left = wholeNumber(a.label)
    const right = wholeNumber(b.label)
    if (left !== undefined && right !== undefined) return left - right
    if (left !== undefined) return -1
    if (right !== undefined) return 1
    return a.label.localeCompare(b.label)
  })
  return descending ? ordered.reverse() : ordered
}

export type FormatDoorAddress = (
  street: Pick<TerritoryStreet, 'name' | 'numbering'>,
  door: Pick<TerritoryDoor, 'label' | 'description'>
) => string

export type DoNotCallEntry = TerritoryDoNotCall & { fromDoor?: boolean }

const doorDoNotCalls = (
  territory: Territory,
  formatAddress: FormatDoorAddress
): DoNotCallEntry[] =>
  territory.streets.flatMap((street) =>
    street.doors
      .filter((door) => door.outcome === 'doNotCall')
      .map((door) => ({
        id: door.id,
        address: formatAddress(street, door),
        at: door.at,
        coordinate: door.coordinate,
        streetId: street.id,
        label: street.numbering === 'none' ? undefined : door.label,
        fromDoor: true,
      }))
  )

export const territoryDoNotCalls = (
  territory: Territory,
  formatAddress: FormatDoorAddress
): DoNotCallEntry[] =>
  [
    ...territory.doNotCalls,
    ...doorDoNotCalls(territory, formatAddress).filter(
      (entry) => !territory.doNotCalls.some((had) => had.id === entry.id)
    ),
  ].sort((a, b) => a.at - b.at)

export const removeDoNotCall = (
  territory: Territory,
  entry: Pick<DoNotCallEntry, 'id' | 'streetId' | 'fromDoor'>
): Territory =>
  entry.fromDoor && entry.streetId
    ? updateStreet(territory, entry.streetId, (street) =>
        removeDoor(street, entry.id)
      )
    : {
        ...territory,
        doNotCalls: territory.doNotCalls.filter((had) => had.id !== entry.id),
      }

export const clearDoorRecords = (
  territory: Territory,
  formatAddress: FormatDoorAddress
): Territory => ({
  ...territory,
  doNotCalls: territoryDoNotCalls(territory, formatAddress).map(
    ({ id, address, at, coordinate, streetId, label }) => ({
      id,
      address,
      at,
      coordinate,
      streetId,
      label,
    })
  ),
  streets: territory.streets.map((street) => ({ ...street, doors: [] })),
})

export const nextStreet = (
  territory: Pick<Territory, 'streets'>,
  after?: string
): TerritoryStreet | undefined =>
  territory.streets.find(
    (street) =>
      street.id !== after &&
      street.workedAt === undefined &&
      !isHandedOff(street)
  )

export type TerritoryWorkState =
  | 'empty'
  | 'working'
  | 'allWorked'
  | 'allHandedOff'

export const territoryWorkState = (
  territory: Pick<Territory, 'streets'>
): TerritoryWorkState => {
  if (territory.streets.length === 0) return 'empty'
  if (workingStreets(territory).length === 0) return 'allHandedOff'
  return nextStreet(territory) ? 'working' : 'allWorked'
}

export const hasDoorRecords = (territory: Territory) =>
  territory.streets.some((street) => street.doors.length > 0)

export const finishTerritory = (
  territory: Territory,
  at: number,
  formatAddress: FormatDoorAddress
): Territory => {
  const cleared = clearDoorRecords(territory, formatAddress)
  return {
    ...cleared,
    finishedAt: at,
    streets: cleared.streets.map((street) => ({
      ...street,
      handoff: undefined,
    })),
    shares: cleared.shares?.map((share) =>
      share.endedAt === undefined ? { ...share, endedAt: at } : share
    ),
  }
}

export const sharesWithOthers = (territory: Territory): boolean =>
  territory.streets.some((street) => street.handoff !== undefined) ||
  (territory.shares ?? []).some((share) => share.endedAt === undefined)

export const reopenTerritory = (territory: Territory): Territory => ({
  ...territory,
  finishedAt: undefined,
})

export const checkOutAgain = (territory: Territory, at: number): Territory => ({
  ...territory,
  checkedOutAt: at,
  returnBy: undefined,
  finishedAt: undefined,
  streets: territory.streets.map((street) => ({
    ...street,
    doors: [],
    next: startNumber(street.numbering, street.first),
    workedAt: undefined,
    workedBy: undefined,
    handoff: undefined,
  })),
})

const sameAddress = (left: string, right: string) =>
  left.trim().toLowerCase() === right.trim().toLowerCase()

export const doNotCallAt = (
  territory: Territory,
  street: TerritoryStreet,
  label: string,
  formatAddress: FormatDoorAddress
): DoNotCallEntry | undefined => {
  const at = label.trim()
  const entries = territoryDoNotCalls(territory, formatAddress)
  const door = street.doors.find(
    (had) => had.label === at && had.outcome === 'doNotCall'
  )
  if (door) return entries.find((entry) => entry.id === door.id)
  if (street.numbering === 'none') return undefined
  const address = formatAddress(street, { label: at })
  return entries.find((entry) =>
    entry.streetId === street.id && entry.label !== undefined
      ? entry.label === at
      : sameAddress(entry.address, address)
  )
}

export const streetDoNotCalls = (
  territory: Territory,
  street: TerritoryStreet,
  formatAddress: FormatDoorAddress
): DoNotCallEntry[] => {
  const name = street.name.trim().toLowerCase()
  return territoryDoNotCalls(territory, formatAddress).filter((entry) =>
    entry.streetId !== undefined
      ? entry.streetId === street.id
      : entry.address.toLowerCase().includes(name)
  )
}

export const returnBy = (checkedOutAt: number): Date => {
  const due = new Date(checkedOutAt)
  due.setMonth(due.getMonth() + RETURN_WITHIN_MONTHS)
  return due
}

export const dueDate = (
  territory: Pick<Territory, 'checkedOutAt' | 'returnBy'>
): Date =>
  territory.returnBy !== undefined
    ? new Date(territory.returnBy)
    : returnBy(territory.checkedOutAt)

export const isOverdue = (
  territory: Pick<Territory, 'checkedOutAt' | 'returnBy' | 'finishedAt'>,
  now: number
) => {
  if (territory.finishedAt !== undefined) return false
  const due = dueDate(territory)
  due.setHours(23, 59, 59, 999)
  return now > due.getTime()
}

export const savesDoorLocations = (
  street: Pick<TerritoryStreet, 'numbering' | 'saveLocations'>
) => street.saveLocations ?? true
