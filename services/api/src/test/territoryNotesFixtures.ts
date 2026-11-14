import type { DoorOutcome, RangeSide, StreetNumbering } from '../scribe/territoryNotes'

/**
 * Territory notes as publishers write them, with the results a careful reader
 * would take from them. Used by `territoryNotes.test.ts` (the validator keeps
 * every expected item) and by the paid eval
 * (`src/e2e/scribeTerritoryNotes.e2e.test.ts`), which scores the real model
 * against them. Made-up streets and people only.
 */

export interface NotesFixture {
  name: string
  locale: string
  streets: { name: string; numbering: StreetNumbering }[]
  notes: string
  doors: { line: number; street: string | null; door: string; outcome: DoorOutcome }[]
  ranges: {
    line: number
    street: string | null
    from: number
    to: number
    side: RangeSide
    outcome: DoorOutcome
  }[]
  /** Words that must never come back (names, reasons). */
  forbidden: string[]
}

export const NOTES_FIXTURES: NotesFixture[] = [
  {
    name: 'english',
    locale: 'en-US',
    streets: [
      { name: 'Oak Street', numbering: 'both' },
      { name: 'Maple Avenue', numbering: 'odd' },
    ],
    notes: ['Oak Street', '12 NH, 14 spoke, 16 DNC', '18-24 nh', 'Maple Ave: 3 spoke, 5 NH'].join('\n'),
    doors: [
      { line: 1, street: 'Oak Street', door: '12', outcome: 'notHome' },
      { line: 1, street: 'Oak Street', door: '14', outcome: 'spoke' },
      { line: 1, street: 'Oak Street', door: '16', outcome: 'doNotCall' },
      { line: 3, street: 'Maple Avenue', door: '3', outcome: 'spoke' },
      { line: 3, street: 'Maple Avenue', door: '5', outcome: 'notHome' },
    ],
    ranges: [{ line: 2, street: 'Oak Street', from: 18, to: 24, side: 'all', outcome: 'notHome' }],
    forbidden: [],
  },
  {
    name: 'spanish',
    locale: 'es-MX',
    streets: [{ name: 'Calle Hidalgo', numbering: 'both' }],
    notes: [
      'Calle Hidalgo',
      'no estaban: 10, 12, 14',
      '15 habló con la señora Marisol, volver el sábado',
      '17 no visitar',
      'del 20 al 30 pares no estaban',
    ].join('\n'),
    doors: [
      { line: 1, street: 'Calle Hidalgo', door: '10', outcome: 'notHome' },
      { line: 1, street: 'Calle Hidalgo', door: '12', outcome: 'notHome' },
      { line: 1, street: 'Calle Hidalgo', door: '14', outcome: 'notHome' },
      { line: 2, street: 'Calle Hidalgo', door: '15', outcome: 'spoke' },
      { line: 3, street: 'Calle Hidalgo', door: '17', outcome: 'doNotCall' },
    ],
    ranges: [{ line: 4, street: 'Calle Hidalgo', from: 20, to: 30, side: 'even', outcome: 'notHome' }],
    forbidden: ['marisol', 'sábado', 'señora'],
  },
  {
    name: 'portuguese',
    locale: 'pt-BR',
    streets: [
      { name: 'Rua das Flores', numbering: 'both' },
      { name: 'Avenida Brasil', numbering: 'both' },
    ],
    notes: [
      'R. das Flores',
      '120 ninguém',
      '122 conversei, deixei revista',
      '124 não bater mais',
      'Av Brasil 45 não estava, 47 atendeu',
    ].join('\n'),
    doors: [
      { line: 1, street: 'Rua das Flores', door: '120', outcome: 'notHome' },
      { line: 2, street: 'Rua das Flores', door: '122', outcome: 'spoke' },
      { line: 3, street: 'Rua das Flores', door: '124', outcome: 'doNotCall' },
      { line: 4, street: 'Avenida Brasil', door: '45', outcome: 'notHome' },
      { line: 4, street: 'Avenida Brasil', door: '47', outcome: 'spoke' },
    ],
    ranges: [],
    forbidden: ['revista'],
  },
  {
    name: 'messy',
    locale: 'en-GB',
    streets: [
      { name: 'Oak Street', numbering: 'both' },
      { name: 'Maple Avenue', numbering: 'none' },
    ],
    notes: [
      'oak st -- 7 nh 9 nh  11 talked to Bram (wants a study) ',
      '',
      'maple',
      '1st door no answer, 2nd door spoke',
      'ring Jorunn back thurs 0412 555 019',
      '3rd -- DNC!!! angry, said never come back',
    ].join('\n'),
    doors: [
      { line: 0, street: 'Oak Street', door: '7', outcome: 'notHome' },
      { line: 0, street: 'Oak Street', door: '9', outcome: 'notHome' },
      { line: 0, street: 'Oak Street', door: '11', outcome: 'spoke' },
      { line: 3, street: 'Maple Avenue', door: '1', outcome: 'notHome' },
      { line: 3, street: 'Maple Avenue', door: '2', outcome: 'spoke' },
      { line: 5, street: 'Maple Avenue', door: '3', outcome: 'doNotCall' },
    ],
    ranges: [],
    forbidden: ['bram', 'jorunn', 'angry', 'study', '555'],
  },
]

/** The answer a careful model gives for a fixture, as JSON text. */
export const answerFor = (fixture: NotesFixture): string =>
  JSON.stringify({
    doors: fixture.doors.map(({ line, ...rest }) => ({ n: line, ...rest })),
    ranges: fixture.ranges.map(({ line, ...rest }) => ({ n: line, ...rest })),
    unread: [],
  })
