import {
  expandRange,
  normaliseStreetName,
  type NoteEntry,
  type NoteProblem,
  type NoteStreet,
  type ParsedNotes,
} from '@/features/territories/lib/parseDoorNotes'
import type {
  DoorOutcome,
  StreetNumbering,
} from '@/features/territories/types/territory'

export type ScribeNotesAnswer = {
  doors: readonly unknown[]
  ranges: readonly unknown[]
  unread: readonly unknown[]
}

export type NotesFallbackReason =
  | 'notOffered'
  | 'scribeOff'
  | 'limited'
  | 'offline'
  | 'unavailable'
  | 'failed'
  | 'tooLong'

export type NotesAiMode =
  | 'available'
  | 'limited'
  | 'offline'
  | 'unavailable'
  | 'off'
  | 'notOffered'

export type NotesAiRead =
  | { status: 'read'; answer: ScribeNotesAnswer }
  | {
      status: 'failed'
      reason: 'limited' | 'offline' | 'unavailable' | 'failed'
    }
  | { status: 'cancelled' }
  | { status: 'consent' }

export type NotesAiRequest = {
  notes: string
  streets: { name: string; numbering: StreetNumbering }[]
}

export type NotesAi = {
  mode: NotesAiMode
  read: (request: NotesAiRequest, signal: AbortSignal) => Promise<NotesAiRead>
}

export const NO_NOTES_AI: NotesAi = {
  mode: 'notOffered',
  read: async () => ({ status: 'failed', reason: 'unavailable' }),
}

export const fallbackReasonFor = (
  mode: Exclude<NotesAiMode, 'available'>
): NotesFallbackReason => (mode === 'off' ? 'scribeOff' : mode)

export type NotesReader =
  | { kind: 'scribe' }
  | { kind: 'device'; reason: NotesFallbackReason }

export const NOTES_MAX_CHARS = 8_000
export const NOTES_MAX_LINES = 300
export const NOTES_MAX_STREETS = 100

export const fitsScribe = (text: string) =>
  text.length <= NOTES_MAX_CHARS && noteLines(text).length <= NOTES_MAX_LINES

const OUTCOMES: readonly DoorOutcome[] = ['notHome', 'spoke', 'doNotCall']
const SIDES = ['all', 'odd', 'even'] as const
const DOOR_LABEL = /^[\p{L}\p{N}][\p{L}\p{N} ./#-]*$/u
const MAX_DOOR_CHARS = 24
const MAX_STREET_CHARS = 120

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const numbersIn = (text: string) =>
  new Set((text.match(/\d+/g) ?? []).map((run) => String(Number(run))))

const letterWords = (label: string) =>
  label.split(/[\s./#-]+/).filter((word) => /^\p{L}{2,}$/u.test(word)).length

const plain = (text: string) =>
  text.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim()

export const noteLines = (text: string) =>
  text.replace(/\r\n?/g, '\n').split('\n')

export const validNoteDoor = (label: string, line: string): boolean => {
  if (label.length > MAX_DOOR_CHARS || !DOOR_LABEL.test(label)) return false
  const digits = label.match(/\d+/g) ?? []
  if (digits.length === 0 || letterWords(label) > 2) return false
  const written = numbersIn(line)
  return digits.every((run) => written.has(String(Number(run))))
}

export function notesFromScribe(
  answer: ScribeNotesAnswer,
  text: string,
  options: { streets: readonly NoteStreet[]; streetId?: string }
): ParsedNotes {
  const lines = noteLines(text)
  const notesText = plain(lines.join('\n'))
  const fallbackStreetId =
    options.streetId ??
    (options.streets.length === 1 ? options.streets[0].id : undefined)

  const lineAt = (value: unknown) =>
    Number.isInteger(value) &&
    (value as number) >= 0 &&
    (value as number) < lines.length &&
    lines[value as number].trim()
      ? (value as number)
      : undefined

  const placeOf = (
    value: unknown
  ): { streetId?: string; heading?: string } | undefined => {
    if (value == null || (typeof value === 'string' && !value.trim()))
      return { streetId: fallbackStreetId }
    if (typeof value !== 'string' || value.length > MAX_STREET_CHARS)
      return undefined
    const name = value.trim()
    const own =
      options.streets.find((street) => plain(street.name) === plain(name)) ??
      options.streets.find(
        (street) =>
          normaliseStreetName(street.name) === normaliseStreetName(name)
      )
    if (own) return { streetId: own.id }
    return notesText.includes(plain(name)) ? { heading: name } : undefined
  }

  const outcomeOf = (value: unknown) =>
    OUTCOMES.find((outcome) => outcome === value)

  const numberingOf = (streetId: string | undefined): StreetNumbering =>
    options.streets.find((street) => street.id === streetId)?.numbering ??
    'both'

  const made: NoteEntry[] = []
  const unreadLines = new Set<number>()
  let index = 0

  for (const item of answer.doors) {
    const record = isRecord(item) ? item : {}
    const line = lineAt(record.n ?? record.line)
    const place = placeOf(record.street)
    const outcome = outcomeOf(record.outcome)
    const label = typeof record.door === 'string' ? record.door.trim() : ''
    if (
      line === undefined ||
      !place ||
      !outcome ||
      !validNoteDoor(label, lines[line])
    ) {
      if (line !== undefined) unreadLines.add(line)
      continue
    }
    made.push({
      key: `s${line}-${index++}`,
      label,
      outcome,
      ...place,
      line,
      source: lines[line].trim(),
    })
  }

  for (const item of answer.ranges) {
    const record = isRecord(item) ? item : {}
    const line = lineAt(record.n ?? record.line)
    const place = placeOf(record.street)
    const outcome = outcomeOf(record.outcome)
    const side = SIDES.find((had) => had === record.side)
    const { from, to } = record
    const written = line === undefined ? new Set() : numbersIn(lines[line])
    const numbers =
      line !== undefined &&
      place &&
      outcome &&
      side &&
      Number.isInteger(from) &&
      Number.isInteger(to) &&
      from !== to &&
      written.has(String(from)) &&
      written.has(String(to))
        ? expandRange(
            { from: from as number, to: to as number },
            side === 'all' ? numberingOf(place.streetId) : side
          )
        : undefined
    if (line === undefined || !place || !outcome || !numbers) {
      if (line !== undefined) unreadLines.add(line)
      continue
    }
    const range = {
      key: `r${line}-${index}`,
      from: from as number,
      to: to as number,
      text: `${from as number}-${to as number}`,
    }
    for (const value of numbers)
      made.push({
        key: `s${line}-${index++}`,
        label: String(value),
        outcome,
        ...place,
        line,
        source: lines[line].trim(),
        range,
      })
  }

  for (const value of answer.unread) {
    const line = lineAt(value)
    if (line !== undefined) unreadLines.add(line)
  }

  const entries = made
    .map((entry, order) => ({ entry, order }))
    .sort((a, b) => a.entry.line - b.entry.line || a.order - b.order)
    .map(({ entry }) => entry)
  const read = new Set(entries.map((entry) => entry.line))
  const unrecognised: NoteProblem[] = [...unreadLines]
    .filter((line) => !read.has(line))
    .sort((a, b) => a - b)
    .map((line) => ({
      key: `u${line}-s`,
      text: lines[line].trim(),
      line,
      source: lines[line].trim(),
    }))
  return { entries, unrecognised }
}
