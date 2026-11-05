import { describe, expect, it } from 'vitest'
import { BIBLE_CHAPTER_COUNT } from '@/lib/routine/bible'
import {
  chapterRanges,
  planChapters,
  planPortion,
  planPortionCount,
  planProgress,
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
