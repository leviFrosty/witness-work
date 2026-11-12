import { describe, expect, it } from 'vitest'
import {
  expandRange,
  moveToStreet,
  normaliseStreetName,
  parseDoorNotes,
  type NoteStreet,
} from '@/features/territories/lib/parseDoorNotes'

const oak: NoteStreet = { id: 'oak', name: 'Oak Street', numbering: 'both' }
const elm: NoteStreet = { id: 'elm', name: 'Elm Road', numbering: 'even' }
const pine: NoteStreet = { id: 'pine', name: 'Pine Ave', numbering: 'odd' }
const lane: NoteStreet = { id: 'lane', name: 'Maple Lane', numbering: 'none' }
const streets = [oak, elm, pine, lane]

const onOak = (text: string) =>
  parseDoorNotes(text, { streets, streetId: 'oak' })

const pairs = (text: string) =>
  onOak(text).entries.map((entry) => [entry.label, entry.outcome])

describe('parseDoorNotes', () => {
  it('reads one entry per line in the common shapes', () => {
    expect(pairs('12 NH\n14 - not home\n16: spoke\n18 DNC')).toEqual([
      ['12', 'notHome'],
      ['14', 'notHome'],
      ['16', 'spoke'],
      ['18', 'doNotCall'],
    ])
  })

  it('reads several entries on one line', () => {
    expect(pairs('12 NH, 14 spoke; 16 DNC')).toEqual([
      ['12', 'notHome'],
      ['14', 'spoke'],
      ['16', 'doNotCall'],
    ])
    expect(pairs('12 NH 14 S')).toEqual([
      ['12', 'notHome'],
      ['14', 'spoke'],
    ])
  })

  it('shares a leading outcome with the numbers after it', () => {
    expect(pairs('NH 20, 22, 26')).toEqual([
      ['20', 'notHome'],
      ['22', 'notHome'],
      ['26', 'notHome'],
    ])
    expect(pairs('Not home: 3 5 7')).toEqual([
      ['3', 'notHome'],
      ['5', 'notHome'],
      ['7', 'notHome'],
    ])
  })

  it('shares a trailing outcome with the numbers before it', () => {
    expect(pairs('12, 14 and 16 NH')).toEqual([
      ['12', 'notHome'],
      ['14', 'notHome'],
      ['16', 'notHome'],
    ])
    expect(pairs('12 & 14 spoke')).toEqual([
      ['12', 'spoke'],
      ['14', 'spoke'],
    ])
  })

  it.each([
    ['NH', 'notHome'],
    ['nh', 'notHome'],
    ['N/H', 'notHome'],
    ['n.h.', 'notHome'],
    ['not home', 'notHome'],
    ['Not  At  Home', 'notHome'],
    ['no answer', 'notHome'],
    ['nobody home', 'notHome'],
    ['spoke', 'spoke'],
    ['Talked', 'spoke'],
    ['talked to', 'spoke'],
    ['home', 'spoke'],
    ['H', 'spoke'],
    ['at home', 'spoke'],
    ['DNC', 'doNotCall'],
    ['d.n.c.', 'doNotCall'],
    ['do not call', 'doNotCall'],
    ["don't call", 'doNotCall'],
    ['Do Not Visit', 'doNotCall'],
  ] as const)('reads "%s" as %s', (word, outcome) => {
    expect(pairs(`12 ${word}`)).toEqual([['12', outcome]])
    expect(pairs(`12-${word}`)).toEqual([['12', outcome]])
  })

  it('reads an outcome written straight after the number', () => {
    expect(pairs('12nh\n14h\n16s')).toEqual([
      ['12', 'notHome'],
      ['14', 'spoke'],
      ['16', 'spoke'],
    ])
  })

  it('keeps letters and units with the number', () => {
    expect(pairs('12A NH\n12/3 spoke\nApt 4 DNC\n#20 NH\nunit 5b nh')).toEqual([
      ['12A', 'notHome'],
      ['12/3', 'spoke'],
      ['Apt 4', 'doNotCall'],
      ['20', 'notHome'],
      ['Unit 5B', 'notHome'],
    ])
  })

  it('reads door labels on streets without house numbers', () => {
    const parsed = parseDoorNotes('door 3 NH\n4th door spoke\nDoor #5 DNC', {
      streets,
      streetId: 'lane',
    })
    expect(parsed.entries.map((entry) => [entry.label, entry.outcome])).toEqual(
      [
        ['3', 'notHome'],
        ['4', 'spoke'],
        ['5', 'doNotCall'],
      ]
    )
  })

  it('expands a range on a street with both sides', () => {
    const { entries } = onOak('12-15 NH')
    expect(entries.map((entry) => entry.label)).toEqual([
      '12',
      '13',
      '14',
      '15',
    ])
    expect(entries.every((entry) => entry.range?.text === '12-15')).toBe(true)
  })

  it('expands a range to one side on an odd or even street', () => {
    const elmRange = parseDoorNotes('12-20 NH', { streets, streetId: 'elm' })
    expect(elmRange.entries.map((entry) => entry.label)).toEqual([
      '12',
      '14',
      '16',
      '18',
      '20',
    ])
    const pineRange = parseDoorNotes('2 to 9 spoke', {
      streets,
      streetId: 'pine',
    })
    expect(pineRange.entries.map((entry) => entry.label)).toEqual([
      '3',
      '5',
      '7',
      '9',
    ])
  })

  it('follows the parity the range was written with', () => {
    const { entries } = parseDoorNotes('11-15 NH', {
      streets,
      streetId: 'elm',
    })
    expect(entries.map((entry) => entry.label)).toEqual(['11', '13', '15'])
  })

  it('keeps a range written high to low in that order', () => {
    expect(onOak('15-12 nh').entries.map((entry) => entry.label)).toEqual([
      '15',
      '14',
      '13',
      '12',
    ])
  })

  it('refuses a range too long to be a street', () => {
    const parsed = onOak('555-1234 NH')
    expect(parsed.entries).toEqual([])
    expect(parsed.unrecognised.map((line) => line.text)).toEqual(['555-1234'])
  })

  it('applies street headings to the lines after them', () => {
    const parsed = parseDoorNotes(
      'Oak St:\n12 NH\nelm road\n14 spoke\n  PINE   AVENUE  \n3 DNC',
      { streets }
    )
    expect(
      parsed.entries.map((entry) => [entry.streetId, entry.label])
    ).toEqual([
      ['oak', '12'],
      ['elm', '14'],
      ['pine', '3'],
    ])
    expect(parsed.unrecognised).toEqual([])
  })

  it('reads a heading and entries on the same line', () => {
    const parsed = parseDoorNotes('Elm Rd: 12 NH, 14 spoke\nOak 3 NH', {
      streets,
    })
    expect(
      parsed.entries.map((entry) => [entry.streetId, entry.label])
    ).toEqual([
      ['elm', '12'],
      ['elm', '14'],
      ['oak', '3'],
    ])
  })

  it('switches street from inside a street screen when a heading names another', () => {
    const parsed = onOak('12 NH\nElm Road\n14 NH')
    expect(parsed.entries.map((entry) => entry.streetId)).toEqual([
      'oak',
      'elm',
    ])
  })

  it('leaves entries under an unknown street without a street', () => {
    const parsed = parseDoorNotes('Birch Street\n12 NH\n14 spoke', {
      streets,
      streetId: 'oak',
    })
    expect(
      parsed.entries.map((entry) => [entry.streetId, entry.heading])
    ).toEqual([
      [undefined, 'Birch Street'],
      [undefined, 'Birch Street'],
    ])
    expect(parsed.unrecognised).toEqual([])
  })

  it('reports an unknown heading with nothing under it', () => {
    const parsed = parseDoorNotes('Birch Street:\nOak St\n12 NH', { streets })
    expect(parsed.unrecognised.map((line) => line.text)).toEqual([
      'Birch Street:',
    ])
    expect(parsed.entries[0].streetId).toBe('oak')
  })

  it('has no street before the first heading when the territory has several', () => {
    const parsed = parseDoorNotes('12 NH', { streets })
    expect(parsed.entries[0].streetId).toBeUndefined()
  })

  it('uses the only street of a territory', () => {
    const parsed = parseDoorNotes('12 NH', { streets: [oak] })
    expect(parsed.entries[0].streetId).toBe('oak')
  })

  it('applies an outcome heading to the bare numbers under it', () => {
    expect(pairs('Not home:\n12\n14\nSpoke\n16\n18 DNC')).toEqual([
      ['12', 'notHome'],
      ['14', 'notHome'],
      ['16', 'spoke'],
      ['18', 'doNotCall'],
    ])
  })

  it('returns lines it cannot read without guessing', () => {
    const parsed = onOak('12 NH\nback after lunch\n14\n16 blue house NH')
    expect(pairs('12 NH')).toEqual([['12', 'notHome']])
    expect(parsed.entries.map((entry) => entry.label)).toEqual(['12'])
    expect(parsed.unrecognised.map((line) => [line.line, line.text])).toEqual([
      [1, 'back after lunch'],
      [2, '14'],
      [3, '16 blue house NH'],
    ])
  })

  it('returns the unreadable part of a line that is partly read', () => {
    const parsed = onOak('12 NH, 14')
    expect(parsed.entries.map((entry) => entry.label)).toEqual(['12'])
    expect(parsed.unrecognised.map((line) => [line.text, line.source])).toEqual(
      [['14', '12 NH, 14']]
    )
  })

  it('keeps words after the outcome only as ignored text', () => {
    const parsed = onOak('12 NH dog in yard\nNH 14, 16 came back later')
    expect(parsed.entries.map((entry) => [entry.label, entry.ignored])).toEqual(
      [
        ['12', 'dog in yard'],
        ['14', undefined],
        ['16', 'came back later'],
      ]
    )
    expect(parsed.unrecognised).toEqual([])
  })

  it('skips blank lines and bullets', () => {
    expect(pairs('\n\n- 12 NH\n• 14 spoke\n* 16 dnc\n')).toEqual([
      ['12', 'notHome'],
      ['14', 'spoke'],
      ['16', 'doNotCall'],
    ])
  })

  it('gives every entry a unique key and its source line', () => {
    const { entries } = onOak('12-16 NH\n12 NH')
    expect(new Set(entries.map((entry) => entry.key)).size).toBe(entries.length)
    expect(entries.at(-1)).toMatchObject({ line: 1, source: '12 NH' })
  })
})

describe('normaliseStreetName', () => {
  it('ignores case, spacing, and street word spellings', () => {
    expect(normaliseStreetName('  Oak   STREET ')).toBe('oak st')
    expect(normaliseStreetName('Oak St.')).toBe('oak st')
    expect(normaliseStreetName('North Pine Avenue')).toBe('n pine ave')
  })
})

describe('expandRange', () => {
  it('steps by one on streets with both sides', () => {
    expect(expandRange({ from: 1, to: 4 }, 'both')).toEqual([1, 2, 3, 4])
  })

  it('takes the street side when the ends differ in parity', () => {
    expect(expandRange({ from: 2, to: 9 }, 'odd')).toEqual([3, 5, 7, 9])
    expect(expandRange({ from: 3, to: 10 }, 'even')).toEqual([4, 6, 8, 10])
  })
})

describe('moveToStreet', () => {
  it('assigns entries and re-expands ranges for the chosen street', () => {
    const { entries } = parseDoorNotes('Birch Street\n2-6 NH\n9 spoke', {
      streets,
    })
    expect(entries).toHaveLength(6)
    const moved = moveToStreet(entries, elm)
    expect(moved.map((entry) => [entry.label, entry.streetId])).toEqual([
      ['2', 'elm'],
      ['4', 'elm'],
      ['6', 'elm'],
      ['9', 'elm'],
    ])
    expect(moved.every((entry) => entry.heading === undefined)).toBe(true)
  })
})
