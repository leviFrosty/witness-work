import { describe, expect, it } from 'vitest'
import { BIBLE_CHAPTER_COUNT } from '@/lib/routine/bible'
import { versesIn } from '@/lib/routine/bibleVerses'
import {
  chapterRanges,
  coversWholeBible,
  planChapters,
  planMinutesADay,
  planPortion,
  planPortionCount,
  planPortions,
  planProgress,
  portionVerses,
} from '@/lib/routine/readingPlans'
import type { ReadingPlanRun, RoutineEntry } from '@/types/routine'

const run = (patch: Partial<ReadingPlanRun> = {}): ReadingPlanRun => ({
  id: 'run-1',
  kind: 'canonical',
  startedOn: '2026-11-01',
  updatedAt: 1,
  ...patch,
})

const key = ({ book, chapter }: { book: number; chapter: number }) =>
  `${book}:${chapter}`

describe('reading plans', () => {
  it('has the 1,189 chapters of the Bible', () => {
    expect(BIBLE_CHAPTER_COUNT).toBe(1189)
  })

  it.each(['canonical', 'chronological', 'custom'] as const)(
    'reads every chapter exactly once in the %s plan',
    (kind) => {
      const chapters = planChapters({ kind, startBook: 39 })
      expect(chapters).toHaveLength(1189)
      expect(new Set(chapters.map(key)).size).toBe(1189)
    }
  )

  it('splits a year plan into 365 portions that cover the plan in order', () => {
    const plan = run()
    expect(planPortionCount(plan)).toBe(365)
    const all = Array.from(
      { length: 365 },
      (_, i) => planPortion(plan, i)!.chapters
    ).flat()
    expect(all.map(key)).toEqual(planChapters(plan).map(key))
    expect(planPortion(plan, 0)!.chapters).toHaveLength(3)
    expect(planPortion(plan, 365)).toBeNull()
  })

  it('has the 31,078 verses of the revised New World Translation', () => {
    const chapters = planChapters({ kind: 'canonical' })
    expect(chapters.reduce((sum, c) => sum + versesIn(c), 0)).toBe(31078)
    expect(versesIn({ book: 18, chapter: 119 })).toBe(176)
    expect(versesIn({ book: 42, chapter: 8 })).toBe(48)
  })

  it('reads only the books between From and To', () => {
    const plan = run({
      kind: 'custom',
      startBook: 39,
      endBook: 42,
      chaptersPerDay: 3,
    })
    const chapters = planChapters(plan)
    expect(chapters[0]).toEqual({ book: 39, chapter: 1 })
    expect(chapters.at(-1)).toEqual({ book: 42, chapter: 21 })
    expect(chapters).toHaveLength(28 + 16 + 24 + 21)
    expect(planPortionCount(plan)).toBe(Math.ceil(89 / 3))
    expect(coversWholeBible(plan)).toBe(false)
  })

  it('splits each chapter into near-even verse portions that stay in it', () => {
    const plan = run({
      kind: 'custom',
      startBook: 30,
      endBook: 30,
      versesPerDay: 5,
    })
    const portions = planPortions(plan)
    expect(portions.map((p) => p.verses)).toEqual([
      { from: 1, to: 4 },
      { from: 5, to: 8 },
      { from: 9, to: 12 },
      { from: 13, to: 16 },
      { from: 17, to: 21 },
    ])
    expect(portions.every((p) => p.chapters.length === 1)).toBe(true)
  })

  it('reads every verse once in a verse plan, starting John 8 at verse 12', () => {
    const plan = run({
      kind: 'custom',
      startBook: 42,
      endBook: 42,
      versesPerDay: 2,
    })
    const portions = planPortions(plan)
    const total = portions.reduce((sum, p) => sum + portionVerses(p), 0)
    expect(total).toBe(
      planChapters(plan).reduce((sum, c) => sum + versesIn(c), 0)
    )
    expect(
      portions.find((p) => p.chapters[0].chapter === 8)?.verses?.from
    ).toBe(12)
    expect(portions.every((p) => portionVerses(p) <= 2)).toBe(true)
  })

  it('reads a chapter shorter than the day whole', () => {
    const plan = run({
      kind: 'custom',
      startBook: 18,
      endBook: 18,
      versesPerDay: 5,
    })
    const psalm117 = planPortions(plan).find(
      (p) => p.chapters[0].chapter === 117
    )
    expect(psalm117?.verses).toBeUndefined()
  })

  it('estimates the minutes a day takes', () => {
    expect(planMinutesADay({ kind: 'canonical' })).toBe(24)
    expect(
      planMinutesADay({
        kind: 'custom',
        startBook: 19,
        endBook: 19,
        versesPerDay: 7,
      })
    ).toBe(2)
  })

  it('reads a whole-Bible plan at a chosen amount', () => {
    expect(planPortionCount({ kind: 'canonical', chaptersPerDay: 4 })).toBe(
      Math.ceil(1189 / 4)
    )
    const chronological = planPortions({
      kind: 'chronological',
      versesPerDay: 5,
    })
    expect(chronological[0].verses?.from).toBe(1)
    expect(chronological.every((p) => portionVerses(p) <= 5)).toBe(true)
  })

  it('starts a custom plan at its book and wraps around to it', () => {
    const plan = run({ kind: 'custom', startBook: 39, chaptersPerDay: 4 })
    expect(planPortionCount(plan)).toBe(Math.ceil(1189 / 4))
    expect(planPortion(plan, 0)!.chapters).toEqual([
      { book: 39, chapter: 1 },
      { book: 39, chapter: 2 },
      { book: 39, chapter: 3 },
      { book: 39, chapter: 4 },
    ])
    const last = planChapters(plan).at(-1)
    expect(last).toEqual({ book: 38, chapter: 4 })
  })

  it('picks up at the first unread portion, however long it has been', () => {
    const plan = run()
    const entries: RoutineEntry[] = [
      {
        id: 'bibleReading:2026-11-01',
        habit: 'bibleReading',
        on: '2026-11-01',
        run: 'run-1',
        portions: [0, 1],
        updatedAt: 1,
      },
      {
        id: 'bibleReading:2026-12-20',
        habit: 'bibleReading',
        on: '2026-12-20',
        run: 'other-run',
        portions: [2],
        updatedAt: 1,
      },
    ]
    const progress = planProgress(plan, entries)
    expect(progress.read).toBe(2)
    expect(progress.next?.index).toBe(2)
    expect(progress.finished).toBe(false)
  })

  it('finishes once every portion is read', () => {
    const plan = run({ kind: 'custom', startBook: 0, chaptersPerDay: 10 })
    const total = planPortionCount(plan)
    const progress = planProgress(plan, [
      {
        id: 'bibleReading:2026-11-01',
        habit: 'bibleReading',
        on: '2026-11-01',
        run: 'run-1',
        portions: Array.from({ length: total }, (_, i) => i),
        updatedAt: 1,
      },
    ])
    expect(progress).toMatchObject({ read: total, finished: true, next: null })
  })

  it('joins chapters into ranges by book', () => {
    expect(
      chapterRanges([
        { book: 0, chapter: 49 },
        { book: 0, chapter: 50 },
        { book: 1, chapter: 1 },
      ])
    ).toEqual([
      { book: 0, from: 49, to: 50 },
      { book: 1, from: 1, to: 1 },
    ])
  })
})
