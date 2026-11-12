import { describe, expect, it } from 'vitest'
import type { NoteStreet } from '@/features/territories/lib/parseDoorNotes'
import {
  notesFromScribe,
  validNoteDoor,
} from '@/features/territories/lib/scribeNotes'

const oak: NoteStreet = { id: 'oak', name: 'Oak Street', numbering: 'both' }
const flores: NoteStreet = {
  id: 'flores',
  name: 'Rua das Flores',
  numbering: 'odd',
}
const lane: NoteStreet = { id: 'lane', name: 'Maple Lane', numbering: 'none' }
const streets = [oak, flores, lane]

const door = (
  n: number,
  label: string,
  outcome: string,
  street: string | null = null
) => ({ n, street, door: label, outcome })

const read = (
  text: string,
  answer: { doors?: unknown[]; ranges?: unknown[]; unread?: unknown[] },
  streetId?: string
) =>
  notesFromScribe({ doors: [], ranges: [], unread: [], ...answer }, text, {
    streets,
    streetId,
  })

describe('notesFromScribe', () => {
  it('turns doors into review entries on the territory’s streets, in line order', () => {
    const text = 'R. das Flores\n120 ninguém\n122 conversei\n124 não bater'
    const parsed = read(text, {
      doors: [
        door(3, '124', 'doNotCall', 'Rua das Flores'),
        door(1, '120', 'notHome', 'rua das flores'),
        door(2, '122', 'spoke', 'Rua das Flores'),
      ],
    })
    expect(
      parsed.entries.map((entry) => [
        entry.line,
        entry.label,
        entry.outcome,
        entry.streetId,
        entry.source,
      ])
    ).toEqual([
      [1, '120', 'notHome', 'flores', '120 ninguém'],
      [2, '122', 'spoke', 'flores', '122 conversei'],
      [3, '124', 'doNotCall', 'flores', '124 não bater'],
    ])
    expect(parsed.unrecognised).toEqual([])
    expect(new Set(parsed.entries.map((entry) => entry.key)).size).toBe(3)
  })

  it('matches a street written another way and keeps an unknown one written in the notes as a heading', () => {
    const parsed = read('Oak St 12 NH\nBirch Close 4 spoke', {
      doors: [
        door(0, '12', 'notHome', 'Oak St'),
        door(1, '4', 'spoke', 'Birch Close'),
      ],
    })
    expect(parsed.entries).toMatchObject([
      { label: '12', streetId: 'oak' },
      { label: '4', heading: 'Birch Close' },
    ])
    expect(parsed.entries[1].streetId).toBeUndefined()
  })

  it('puts doors with no street on the screen’s street', () => {
    expect(
      read('12 NH', { doors: [door(0, '12', 'notHome')] }, 'lane').entries[0]
        .streetId
    ).toBe('lane')
    expect(
      read('12 NH', { doors: [door(0, '12', 'notHome')] }).entries[0].streetId
    ).toBeUndefined()
  })

  it('expands a range on the side the notes named, or the street’s numbering', () => {
    const parsed = read('20-30 pares no estaban\nflores 1-9 nh', {
      ranges: [
        {
          n: 0,
          street: 'Oak Street',
          from: 20,
          to: 30,
          side: 'even',
          outcome: 'notHome',
        },
        {
          n: 1,
          street: 'Rua das Flores',
          from: 1,
          to: 9,
          side: 'all',
          outcome: 'notHome',
        },
      ],
    })
    expect(parsed.entries.map((entry) => entry.label)).toEqual([
      '20',
      '22',
      '24',
      '26',
      '28',
      '30',
      '1',
      '3',
      '5',
      '7',
      '9',
    ])
    expect(parsed.entries[0].range).toMatchObject({
      from: 20,
      to: 30,
      text: '20-30',
    })
    expect(new Set(parsed.entries.map((entry) => entry.range?.key)).size).toBe(
      2
    )
  })

  it('drops an invented house, a name, a bad outcome or line, and an unwritten street, and lists their lines', () => {
    const parsed = read('12 NH\n14 talked to Bram Hale\n16 ??\n18 dnc', {
      doors: [
        door(0, '12', 'notHome'),
        door(0, '13', 'notHome'),
        door(1, 'Bram Hale', 'spoke'),
        door(1, 'Mr Bram Hale 14', 'spoke'),
        door(3, '18', 'maybe'),
        door(3, '18', 'doNotCall', 'Pine Avenue'),
        door(9, '20', 'spoke'),
        'garbage',
      ],
      ranges: [
        {
          n: 0,
          street: null,
          from: 1,
          to: 500,
          side: 'all',
          outcome: 'notHome',
        },
      ],
      unread: [2, 7, 'x'],
    })
    expect(parsed.entries.map((entry) => entry.label)).toEqual(['12'])
    expect(
      parsed.unrecognised.map((problem) => [problem.line, problem.text])
    ).toEqual([
      [1, '14 talked to Bram Hale'],
      [2, '16 ??'],
      [3, '18 dnc'],
    ])
  })

  it('accepts the answer’s `line` field as well as `n`', () => {
    expect(
      read('12 NH', {
        doors: [{ line: 0, street: null, door: '12', outcome: 'notHome' }],
      }).entries
    ).toHaveLength(1)
  })
})

describe('validNoteDoor', () => {
  it.each([
    ['12', '12 NH', true],
    ['12A', '12a spoke', true],
    ['Apt 4', 'apt 4 nh', true],
    ['Depto 3B', 'depto 3b no estaba', true],
    ['3', '3rd door DNC', true],
    ['13', '12 NH', false],
    ['Oak', 'Oak NH', false],
    ['Sra Marisol Vega 4', 'Sra Marisol Vega 4', false],
  ])('%s on "%s" → %s', (label, line, valid) => {
    expect(validNoteDoor(label, line)).toBe(valid)
  })
})
