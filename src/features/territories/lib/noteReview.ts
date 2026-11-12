import {
  doNotCallAt,
  type DoNotCallEntry,
  type FormatDoorAddress,
} from '@/features/territories/lib/doors'
import {
  OUTCOME_WORDS,
  type NoteEntry,
  type NoteProblem,
} from '@/features/territories/lib/parseDoorNotes'
import type {
  DoorOutcome,
  Territory,
  TerritoryDoor,
} from '@/features/territories/types/territory'

export type NoteGroup = {
  key: string
  streetId?: string
  heading?: string
  entries: NoteEntry[]
}

export const groupKey = (entry: Pick<NoteEntry, 'streetId' | 'heading'>) =>
  entry.streetId ? `street:${entry.streetId}` : `heading:${entry.heading ?? ''}`

export const groupNoteEntries = (
  entries: readonly NoteEntry[]
): NoteGroup[] => {
  const groups = new Map<string, NoteGroup>()
  for (const entry of entries) {
    const key = groupKey(entry)
    const group = groups.get(key)
    if (group) group.entries.push(entry)
    else
      groups.set(key, {
        key,
        streetId: entry.streetId,
        heading: entry.streetId ? undefined : entry.heading,
        entries: [entry],
      })
  }
  return [...groups.values()]
}

export type NoteFlags = {
  recorded?: TerritoryDoor
  doNotCall?: DoNotCallEntry
  twice: boolean
  rangeStart: boolean
}

export const noteFlags = (
  entry: NoteEntry,
  entries: readonly NoteEntry[],
  territory: Territory,
  formatAddress: FormatDoorAddress
): NoteFlags => {
  const street = territory.streets.find((had) => had.id === entry.streetId)
  const label = entry.label.trim()
  const doNotCall =
    street && label
      ? doNotCallAt(territory, street, label, formatAddress)
      : undefined
  const recorded = street?.doors.find((door) => door.label === label)
  return {
    recorded: recorded && recorded.id !== doNotCall?.id ? recorded : undefined,
    doNotCall,
    twice:
      !!label &&
      entries.some(
        (other) =>
          other.key !== entry.key &&
          other.streetId === entry.streetId &&
          other.heading === entry.heading &&
          other.label.trim() === label
      ),
    rangeStart:
      !!entry.range &&
      entries.find((other) => other.range?.key === entry.range?.key)?.key ===
        entry.key,
  }
}

const OUTCOME_ORDER: readonly DoorOutcome[] = ['doNotCall', 'notHome', 'spoke']

const outcomeIn = (text: string): DoorOutcome | undefined => {
  const lower = ` ${text.toLowerCase().replace(/\s+/g, ' ')} `
  for (const outcome of OUTCOME_ORDER)
    if (
      OUTCOME_WORDS[outcome].some(
        (word) => word.length > 1 && lower.includes(` ${word} `)
      )
    )
      return outcome
  return undefined
}

export const entryFromProblem = (
  problem: NoteProblem,
  fallbackStreetId: string | undefined
): NoteEntry => {
  const number = /\d+[a-z]?/i.exec(problem.text)
  const streetId =
    problem.streetId ?? (problem.heading ? undefined : fallbackStreetId)
  return {
    key: `${problem.key}-entry`,
    label: number ? number[0].toUpperCase() : '',
    outcome: outcomeIn(problem.text) ?? 'notHome',
    streetId,
    heading: streetId ? undefined : problem.heading,
    line: problem.line,
    source: problem.source,
    written: problem.text,
  }
}

export const readyNoteDoors = (entries: readonly NoteEntry[]) =>
  entries.flatMap((entry) =>
    entry.streetId && entry.label.trim()
      ? [
          {
            streetId: entry.streetId,
            label: entry.label.trim(),
            outcome: entry.outcome,
          },
        ]
      : []
  )

export const entriesWithoutStreet = (entries: readonly NoteEntry[]) =>
  entries.filter((entry) => !entry.streetId).length
