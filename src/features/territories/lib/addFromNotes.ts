import { logDoor, updateStreet } from '@/features/territories/lib/doors'
import type {
  DoorOutcome,
  Territory,
  TerritoryDoor,
  TerritoryPerson,
} from '@/features/territories/types/territory'

export type NoteDoor = {
  streetId: string
  label: string
  outcome: DoorOutcome
}

export type NotesUndo = {
  streets: {
    streetId: string
    added: string[]
    previous: TerritoryDoor[]
    next: number
  }[]
  personId?: string
}

const sameName = (left: string, right: string) =>
  left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase()

export const findPerson = (
  territory: Pick<Territory, 'people'>,
  name: string
): TerritoryPerson | undefined =>
  name.trim()
    ? territory.people?.find((person) => sameName(person.name, name))
    : undefined

export type NotesAuthor =
  | { kind: 'me' }
  | { kind: 'person'; personId: string }
  | { kind: 'other'; name: string }

export const notesAuthorName = (
  territory: Pick<Territory, 'people'>,
  author: NotesAuthor
): string | undefined =>
  author.kind === 'me'
    ? undefined
    : author.kind === 'person'
      ? territory.people?.find((person) => person.id === author.personId)?.name
      : author.name.trim() || undefined

export const notesAuthorReady = (author: NotesAuthor) =>
  author.kind !== 'other' || author.name.trim().length > 0

export const addNoteDoors = (
  territory: Territory,
  doors: readonly NoteDoor[],
  options: { at: number; recordedBy?: string; newId: () => string }
): { territory: Territory; undo: NotesUndo } => {
  const name = options.recordedBy?.trim()
  const known = name ? findPerson(territory, name) : undefined
  const person: TerritoryPerson | undefined = name
    ? (known ?? { id: options.newId(), name, kind: 'guest' })
    : undefined
  let result: Territory =
    person && !known
      ? { ...territory, people: [...(territory.people ?? []), person] }
      : territory
  const undo: NotesUndo = {
    streets: [],
    personId: person && !known ? person.id : undefined,
  }

  for (const streetId of new Set(doors.map((door) => door.streetId))) {
    const street = result.streets.find((had) => had.id === streetId)
    if (!street) continue
    const added: string[] = []
    const previous: TerritoryDoor[] = []
    result = updateStreet(result, streetId, (current) => {
      let next = current
      for (const door of doors.filter((entry) => entry.streetId === streetId)) {
        const label = door.label.trim()
        if (!label) continue
        const had = next.doors.find((existing) => existing.label === label)
        if (
          had &&
          !added.includes(had.id) &&
          !previous.some((p) => p.id === had.id)
        )
          previous.push(had)
        const id = options.newId()
        next = logDoor(next, {
          id,
          label,
          outcome: door.outcome,
          at: options.at,
        })
        if (!had) added.push(id)
        next = {
          ...next,
          doors: next.doors.map((entry) =>
            entry.label === label
              ? person
                ? { ...entry, by: person.id }
                : { ...entry, by: undefined }
              : entry
          ),
        }
      }
      return next
    })
    undo.streets.push({ streetId, added, previous, next: street.next })
  }
  return { territory: result, undo }
}

export const undoNoteDoors = (
  territory: Territory,
  undo: NotesUndo
): Territory => {
  let result = territory
  for (const change of undo.streets)
    result = updateStreet(result, change.streetId, (street) => ({
      ...street,
      next: change.next,
      doors: street.doors
        .filter((door) => !change.added.includes(door.id))
        .map(
          (door) => change.previous.find((had) => had.id === door.id) ?? door
        ),
    }))
  if (!undo.personId) return result
  const stillUsed = result.streets.some((street) =>
    street.doors.some((door) => door.by === undo.personId)
  )
  return stillUsed
    ? result
    : {
        ...result,
        people: result.people?.filter((person) => person.id !== undo.personId),
      }
}

export const noteDoorCount = (
  doors: readonly NoteDoor[],
  outcome: DoorOutcome
) => doors.filter((door) => door.outcome === outcome).length
