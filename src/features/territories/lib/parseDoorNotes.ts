import type {
  DoorOutcome,
  StreetNumbering,
  TerritoryStreet,
} from '@/features/territories/types/territory'

export type NoteStreet = Pick<TerritoryStreet, 'id' | 'name' | 'numbering'>

export type NoteRange = {
  key: string
  from: number
  to: number
  text: string
}

export type NoteEntry = {
  key: string
  label: string
  outcome: DoorOutcome
  streetId?: string
  heading?: string
  line: number
  source: string
  range?: NoteRange
  ignored?: string
  written?: string
}

export type NoteProblem = {
  key: string
  text: string
  line: number
  source: string
  streetId?: string
  heading?: string
}

export type ParsedNotes = {
  entries: NoteEntry[]
  unrecognised: NoteProblem[]
}

export const OUTCOME_WORDS: Record<DoorOutcome, readonly string[]> = {
  notHome: [
    'nh',
    'n/h',
    'n.h',
    'n.h.',
    'n-h',
    'nah',
    'nh.',
    'not home',
    'not at home',
    'not in',
    'nobody home',
    'no one home',
    'noone home',
    'no answer',
    'no ans',
    'na',
    'n/a',
    'out',
    'away',
  ],
  spoke: [
    'spoke',
    'spoke to',
    'spoken',
    'spoke with',
    'talked',
    'talked to',
    'talked with',
    'talk',
    'answered',
    'home',
    'at home',
    'h',
    's',
    'sp',
  ],
  doNotCall: [
    'dnc',
    'd/n/c',
    'd.n.c',
    'd.n.c.',
    'do not call',
    'dont call',
    "don't call",
    'do not visit',
    'dont visit',
    "don't visit",
    'no calls',
    'no call',
    'no visits',
    'do not knock',
    "don't knock",
  ],
}

export const MAX_RANGE = 60

const STREET_SUFFIXES: Record<string, string> = {
  street: 'st',
  str: 'st',
  avenue: 'ave',
  av: 'ave',
  road: 'rd',
  drive: 'dr',
  lane: 'ln',
  court: 'ct',
  place: 'pl',
  boulevard: 'blvd',
  terrace: 'ter',
  circle: 'cir',
  crescent: 'cres',
  highway: 'hwy',
  parkway: 'pkwy',
  square: 'sq',
  close: 'cl',
  trail: 'trl',
}

const SUFFIX_WORDS = new Set([
  ...Object.keys(STREET_SUFFIXES),
  ...Object.values(STREET_SUFFIXES),
  'way',
  'row',
  'grove',
  'hill',
  'mews',
])

const DIRECTION_WORDS: Record<string, string> = {
  north: 'n',
  south: 's',
  east: 'e',
  west: 'w',
}

const CONNECTORS = new Set(['and', '&', '+'])

const FILLER = /^[\s\-:=.>→)(|*•·–—]+/

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

const OUTCOME_PATTERNS = (Object.keys(OUTCOME_WORDS) as DoorOutcome[])
  .flatMap((outcome) =>
    OUTCOME_WORDS[outcome].map((word) => ({ word, outcome }))
  )
  .sort((a, b) => b.word.length - a.word.length)
  .map(({ word, outcome }) => ({
    outcome,
    pattern: new RegExp(
      `^${word
        .split(' ')
        .map(escape)
        .join('\\s+')
        .replace("'", "['’]?")}(?![a-z0-9])`,
      'i'
    ),
  }))

const matchOutcome = (text: string) => {
  for (const { outcome, pattern } of OUTCOME_PATTERNS) {
    const found = pattern.exec(text)
    if (found) return { outcome, length: found[0].length }
  }
  return undefined
}

const isOutcomeOnly = (text: string) => {
  const trimmed = text.replace(/[\s:.-]+$/, '').trim()
  const found = matchOutcome(trimmed)
  return found && found.length === trimmed.length ? found.outcome : undefined
}

const streetWords = (name: string) =>
  name
    .toLowerCase()
    .replace(/[.,'’]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => STREET_SUFFIXES[word] ?? DIRECTION_WORDS[word] ?? word)

export const normaliseStreetName = (name: string) => streetWords(name).join(' ')

const baseStreetName = (name: string) => {
  const words = streetWords(name)
  if (words.length < 2 || !SUFFIX_WORDS.has(words[words.length - 1]))
    return undefined
  return words.slice(0, -1).join(' ')
}

type StreetKey = { key: string; streetId: string }

const streetKeys = (streets: readonly NoteStreet[]): StreetKey[] => {
  const full = streets.map((street) => ({
    key: normaliseStreetName(street.name),
    streetId: street.id,
  }))
  const bases = streets.flatMap((street) => {
    const key = baseStreetName(street.name)
    if (!key || isOutcomeOnly(key)) return []
    const shared = streets.filter((other) => {
      const otherBase = baseStreetName(other.name)
      return otherBase === key || normaliseStreetName(other.name) === key
    })
    return shared.length === 1 ? [{ key, streetId: street.id }] : []
  })
  return [...full, ...bases]
    .filter((entry) => entry.key.length > 0)
    .sort((a, b) => b.key.length - a.key.length)
}

const matchStreetAt = (text: string, keys: readonly StreetKey[]) => {
  const tokens = [...text.matchAll(/[^\s,;:]+/g)]
  for (const { key, streetId } of keys) {
    const size = key.split(' ').length
    if (tokens.length < size) continue
    const end = tokens[size - 1]
    const candidate = text.slice(0, (end.index ?? 0) + end[0].length)
    if (normaliseStreetName(candidate) === key)
      return { streetId, length: candidate.length }
  }
  return undefined
}

type Item =
  | { kind: 'outcome'; outcome: DoorOutcome; text: string }
  | { kind: 'label'; label: string; text: string }
  | { kind: 'range'; from: number; to: number; text: string }
  | { kind: 'street'; streetId: string; text: string }
  | { kind: 'junk'; text: string }

const titleWord = (word: string) =>
  word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()

const ORDINAL_DOOR = /^(\d+)\s*(?:st|nd|rd|th)\s+door(?![a-z])/i
const DOOR = /^(?:door|dr)\s*(?:no\.?|#)?\s*(\d+)(?![a-z0-9])/i
const UNIT =
  /^(apt|apartment|unit|flat|suite|ste)\.?\s*#?\s*(\d+[a-z]?)(?![a-z0-9])/i
const RANGE = /^#?(\d+)\s*(?:-|–|—|to|thru|through)\s*#?(\d+)(?![a-z0-9/])/i
const NUMBER = /^#?(\d+)(?:([a-z])(?![a-z]))?(?:\/(\d+[a-z]?))?(?![0-9/])/i
const SINGLE_LETTER_OUTCOMES = new Set(['h', 's'])

const readItem = (text: string, keys: readonly StreetKey[]): Item => {
  const outcome = matchOutcome(text)
  const ordinal = ORDINAL_DOOR.exec(text)
  if (ordinal) return { kind: 'label', label: ordinal[1], text: ordinal[0] }
  const door = DOOR.exec(text)
  if (door) return { kind: 'label', label: door[1], text: door[0] }
  const unit = UNIT.exec(text)
  if (unit)
    return {
      kind: 'label',
      label: `${titleWord(unit[1])} ${unit[2].toUpperCase()}`,
      text: unit[0],
    }
  const range = RANGE.exec(text)
  if (range)
    return {
      kind: 'range',
      from: Number(range[1]),
      to: Number(range[2]),
      text: range[0],
    }
  const number = NUMBER.exec(text)
  if (number) {
    const [whole, digits, letter, unitPart] = number
    if (letter && !unitPart && SINGLE_LETTER_OUTCOMES.has(letter.toLowerCase()))
      return {
        kind: 'label',
        label: digits,
        text: whole.slice(0, whole.length - 1),
      }
    return {
      kind: 'label',
      label: `${digits}${letter ? letter.toUpperCase() : ''}${unitPart ? `/${unitPart.toUpperCase()}` : ''}`,
      text: whole,
    }
  }
  const street = matchStreetAt(text, keys)
  if (outcome && (!street || outcome.length >= street.length))
    return {
      kind: 'outcome',
      outcome: outcome.outcome,
      text: text.slice(0, outcome.length),
    }
  if (street)
    return {
      kind: 'street',
      streetId: street.streetId,
      text: text.slice(0, street.length),
    }
  const word = /^[^\s,;]+/.exec(text)
  return { kind: 'junk', text: word ? word[0] : text.charAt(0) }
}

const readItems = (segment: string, keys: readonly StreetKey[]) => {
  const items: { item: Item; start: number }[] = []
  let rest = segment
  let offset = 0
  while (rest.length > 0) {
    const filler = FILLER.exec(rest)
    if (filler) {
      rest = rest.slice(filler[0].length)
      offset += filler[0].length
      continue
    }
    const connector = /^(and|&|\+)(?![a-z0-9])/i.exec(rest)
    if (connector && CONNECTORS.has(connector[1].toLowerCase())) {
      rest = rest.slice(connector[0].length)
      offset += connector[0].length
      continue
    }
    const item = readItem(rest, keys)
    items.push({ item, start: offset })
    rest = rest.slice(item.text.length)
    offset += item.text.length
  }
  return items
}

const sideStep = (numbering: StreetNumbering) =>
  numbering === 'odd' || numbering === 'even' ? 2 : 1

export const expandRange = (
  range: Pick<NoteRange, 'from' | 'to'>,
  numbering: StreetNumbering | undefined
): number[] | undefined => {
  const low = Math.min(range.from, range.to)
  const high = Math.max(range.from, range.to)
  const step = sideStep(numbering ?? 'both')
  let start = low
  if (step === 2 && low % 2 !== high % 2)
    start = (numbering === 'odd') === (low % 2 === 1) ? low : low + 1
  const numbers: number[] = []
  for (let value = start; value <= high; value += step) numbers.push(value)
  if (numbers.length === 0 || numbers.length > MAX_RANGE) return undefined
  return range.from > range.to ? numbers.reverse() : numbers
}

const HEADING_HINT = /:\s*$/

const looksLikeStreet = (text: string) => {
  const words = streetWords(text)
  return (
    words.length >= 2 &&
    words.length <= 5 &&
    SUFFIX_WORDS.has(words[words.length - 1]) &&
    !/\d/.test(text)
  )
}

export function parseDoorNotes(
  text: string,
  options: { streets: readonly NoteStreet[]; streetId?: string }
): ParsedNotes {
  const keys = streetKeys(options.streets)
  const numberingOf = (streetId: string | undefined) =>
    options.streets.find((street) => street.id === streetId)?.numbering
  const entries: NoteEntry[] = []
  const unrecognised: NoteProblem[] = []
  let streetId =
    options.streetId ??
    (options.streets.length === 1 ? options.streets[0].id : undefined)
  let heading: string | undefined
  let headingOutcome: DoorOutcome | undefined
  let headingLine: { line: number; text: string; used: boolean } | undefined

  const settleHeading = () => {
    if (headingLine && !headingLine.used)
      unrecognised.push({
        key: `u${headingLine.line}-h`,
        text: headingLine.text,
        line: headingLine.line,
        source: headingLine.text,
      })
    headingLine = undefined
  }

  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  lines.forEach((raw, line) => {
    const source = raw.trim()
    if (!source) return
    const bare = source.replace(/^[\s\-*•·]+/, '').trim()
    let count = 0
    const problem = (fragment: string) =>
      unrecognised.push({
        key: `u${line}-${count++}`,
        text: fragment.trim(),
        line,
        source,
        streetId,
        heading,
      })

    const outcomeHeading = isOutcomeOnly(bare)
    if (outcomeHeading) {
      headingOutcome = outcomeHeading
      return
    }

    const headingText = bare.replace(/[\s:.-]+$/, '').trim()
    const named = matchStreetAt(headingText, keys)
    if (named && named.length === headingText.length) {
      settleHeading()
      streetId = named.streetId
      heading = undefined
      headingOutcome = undefined
      return
    }
    if (
      !/\d/.test(headingText) &&
      headingText.length > 0 &&
      (HEADING_HINT.test(bare) || looksLikeStreet(headingText)) &&
      !readItems(headingText, keys).some(({ item }) => item.kind === 'outcome')
    ) {
      settleHeading()
      streetId = undefined
      heading = headingText
      headingOutcome = undefined
      headingLine = { line, text: source, used: false }
      return
    }

    let body = bare
    const colon = /^([^:\d]+):\s*(.*)$/.exec(bare)
    if (colon) {
      const inline = matchStreetAt(colon[1].trim(), keys)
      if (inline && inline.length === colon[1].trim().length) {
        settleHeading()
        streetId = inline.streetId
        heading = undefined
        headingOutcome = undefined
        body = colon[2]
      }
    }

    let lead: DoorOutcome | undefined = headingOutcome
    let deferred: { items: Item[]; text: string; streetId?: string }[] = []
    let index = 0

    const emit = (
      labels: Item[],
      outcome: DoorOutcome,
      at: string | undefined,
      ignored?: string
    ) => {
      const made: NoteEntry[] = []
      for (const label of labels) {
        if (label.kind === 'label')
          made.push({
            key: `e${line}-${index++}`,
            label: label.label,
            outcome,
            streetId: at,
            heading: at ? undefined : heading,
            line,
            source,
          })
        if (label.kind === 'range') {
          const numbers = expandRange(label, numberingOf(at))
          if (!numbers) {
            problem(label.text)
            continue
          }
          const range = {
            key: `r${line}-${index}`,
            from: label.from,
            to: label.to,
            text: label.text,
          }
          for (const value of numbers)
            made.push({
              key: `e${line}-${index++}`,
              label: String(value),
              outcome,
              streetId: at,
              heading: at ? undefined : heading,
              line,
              source,
              range,
            })
        }
      }
      if (made.length > 0 && ignored)
        made[made.length - 1] = { ...made[made.length - 1], ignored }
      entries.push(...made)
      if (made.length > 0 && headingLine) headingLine.used = true
    }

    const flush = (outcome: DoorOutcome) => {
      for (const waiting of deferred)
        emit(waiting.items, outcome, waiting.streetId)
      deferred = []
    }

    for (const segment of body.split(/[,;]/)) {
      if (!segment.trim()) continue
      const items = readItems(segment, keys)
      let pending: Item[] = []
      let emitted = false
      for (let at = 0; at < items.length; at++) {
        const { item, start } = items[at]
        if (item.kind === 'street') {
          settleHeading()
          streetId = item.streetId
          heading = undefined
          continue
        }
        if (item.kind === 'outcome') {
          if (pending.length > 0) {
            flush(item.outcome)
            emit(pending, item.outcome, streetId)
            pending = []
            emitted = true
          } else if (!emitted) {
            lead = item.outcome
            flush(item.outcome)
          }
          continue
        }
        if (item.kind === 'label' || item.kind === 'range') {
          pending.push(item)
          continue
        }
        const rest = segment.slice(start).trim()
        const later = items
          .slice(at + 1)
          .some(({ item: next }) => next.kind === 'outcome')
        if (pending.length > 0 && !later && lead) {
          emit(pending, lead, streetId, rest)
        } else if (pending.length > 0 || !emitted) {
          problem(segment)
        } else {
          const last = entries[entries.length - 1]
          if (last) entries[entries.length - 1] = { ...last, ignored: rest }
        }
        pending = []
        break
      }
      if (pending.length === 0) continue
      if (lead) emit(pending, lead, streetId)
      else deferred.push({ items: pending, text: segment.trim(), streetId })
    }
    for (const waiting of deferred) problem(waiting.text)
  })
  settleHeading()
  return { entries, unrecognised }
}

export const moveToStreet = (
  entries: readonly NoteEntry[],
  street: NoteStreet
): NoteEntry[] => {
  const result: NoteEntry[] = []
  const expanded = new Set<string>()
  for (const entry of entries) {
    if (!entry.range) {
      result.push({ ...entry, streetId: street.id, heading: undefined })
      continue
    }
    if (expanded.has(entry.range.key)) continue
    expanded.add(entry.range.key)
    const siblings = entries.filter(
      (other) => other.range?.key === entry.range?.key
    )
    const numbers = expandRange(entry.range, street.numbering) ?? []
    numbers.forEach((value, at) =>
      result.push({
        ...entry,
        key: `${entry.range?.key}-${street.id}-${at}`,
        label: String(value),
        outcome: siblings[0].outcome,
        ignored:
          at === numbers.length - 1 ? siblings.at(-1)?.ignored : undefined,
        streetId: street.id,
        heading: undefined,
      })
    )
  }
  return result
}
