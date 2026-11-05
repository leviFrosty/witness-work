import {
  BIBLE_BOOK_COUNT,
  BIBLE_BOOKS,
  bookIndex,
  chaptersIn,
  type BibleBookId,
  type Chapter,
} from '@/lib/routine/bible'
import type { ReadingPlanRun, RoutineEntry } from '@/types/routine'

export const PLAN_DAYS_IN_A_YEAR = 365

export const MIN_CHAPTERS_PER_DAY = 1
export const MAX_CHAPTERS_PER_DAY = 10
export const DEFAULT_CHAPTERS_PER_DAY = 3

type Segment = readonly [BibleBookId, number?, number?]

const CHRONOLOGICAL: readonly Segment[] = [
  ['genesis', 1, 11],
  ['job'],
  ['genesis', 12, 50],
  ['exodus'],
  ['leviticus'],
  ['numbers'],
  ['deuteronomy'],
  ['psalms', 90, 90],
  ['joshua'],
  ['judges'],
  ['ruth'],
  ['1samuel'],
  ['2samuel'],
  ['1chronicles'],
  ['psalms', 1, 89],
  ['psalms', 91, 150],
  ['1kings', 1, 11],
  ['2chronicles', 1, 9],
  ['proverbs'],
  ['ecclesiastes'],
  ['songOfSolomon'],
  ['1kings', 12, 22],
  ['2chronicles', 10, 20],
  ['2kings', 1, 8],
  ['joel'],
  ['2kings', 9, 14],
  ['jonah'],
  ['amos'],
  ['hosea'],
  ['2kings', 15, 17],
  ['2chronicles', 21, 28],
  ['isaiah'],
  ['micah'],
  ['2kings', 18, 23],
  ['2chronicles', 29, 35],
  ['nahum'],
  ['zephaniah'],
  ['habakkuk'],
  ['jeremiah'],
  ['2kings', 24, 25],
  ['2chronicles', 36, 36],
  ['lamentations'],
  ['obadiah'],
  ['ezekiel'],
  ['daniel'],
  ['ezra', 1, 6],
  ['haggai'],
  ['zechariah'],
  ['esther'],
  ['ezra', 7, 10],
  ['nehemiah'],
  ['malachi'],
  ['matthew'],
  ['mark'],
  ['luke'],
  ['john'],
  ['acts', 1, 15],
  ['james'],
  ['galatians'],
  ['acts', 16, 18],
  ['1thessalonians'],
  ['2thessalonians'],
  ['acts', 19, 20],
  ['1corinthians'],
  ['2corinthians'],
  ['romans'],
  ['acts', 21, 28],
  ['ephesians'],
  ['philippians'],
  ['colossians'],
  ['philemon'],
  ['hebrews'],
  ['1timothy'],
  ['titus'],
  ['1peter'],
  ['2timothy'],
  ['2peter'],
  ['jude'],
  ['1john'],
  ['2john'],
  ['3john'],
  ['revelation'],
]

function chaptersOf([id, from, to]: Segment): Chapter[] {
  const book = bookIndex(id)
  const last = to ?? chaptersIn(book)
  const chapters: Chapter[] = []
  for (let chapter = from ?? 1; chapter <= last; chapter++)
    chapters.push({ book, chapter })
  return chapters
}

const canonicalFrom = (start: number): Chapter[] => {
  const chapters: Chapter[] = []
  for (let i = 0; i < BIBLE_BOOK_COUNT; i++) {
    const book = (start + i) % BIBLE_BOOK_COUNT
    for (let chapter = 1; chapter <= BIBLE_BOOKS[book][1]; chapter++)
      chapters.push({ book, chapter })
  }
  return chapters
}

const sequenceCache = new Map<string, Chapter[]>()

export function planChapters(
  run: Pick<ReadingPlanRun, 'kind' | 'startBook'>
): Chapter[] {
  const key = run.kind === 'custom' ? `custom:${run.startBook ?? 0}` : run.kind
  const cached = sequenceCache.get(key)
  if (cached) return cached
  const chapters =
    run.kind === 'chronological'
      ? CHRONOLOGICAL.flatMap(chaptersOf)
      : canonicalFrom(run.kind === 'custom' ? clampBook(run.startBook) : 0)
  sequenceCache.set(key, chapters)
  return chapters
}

const clampBook = (book: number | undefined): number =>
  Number.isInteger(book) && book! >= 0 && book! < BIBLE_BOOK_COUNT ? book! : 0

export const clampChaptersPerDay = (value: number | undefined): number =>
  Number.isInteger(value)
    ? Math.min(MAX_CHAPTERS_PER_DAY, Math.max(MIN_CHAPTERS_PER_DAY, value!))
    : DEFAULT_CHAPTERS_PER_DAY

export type Portion = { index: number; chapters: Chapter[] }

export function planPortionCount(
  run: Pick<ReadingPlanRun, 'kind' | 'startBook' | 'chaptersPerDay'>
): number {
  const total = planChapters(run).length
  if (run.kind !== 'custom') return Math.min(PLAN_DAYS_IN_A_YEAR, total)
  return Math.ceil(total / clampChaptersPerDay(run.chaptersPerDay))
}

export function planPortion(
  run: Pick<ReadingPlanRun, 'kind' | 'startBook' | 'chaptersPerDay'>,
  index: number
): Portion | null {
  const chapters = planChapters(run)
  const count = planPortionCount(run)
  if (!Number.isInteger(index) || index < 0 || index >= count) return null
  if (run.kind === 'custom') {
    const size = clampChaptersPerDay(run.chaptersPerDay)
    return {
      index,
      chapters: chapters.slice(index * size, (index + 1) * size),
    }
  }
  const from = Math.floor((index * chapters.length) / count)
  const to = Math.floor(((index + 1) * chapters.length) / count)
  return { index, chapters: chapters.slice(from, to) }
}

export function portionsRead(
  run: Pick<ReadingPlanRun, 'id'>,
  entries: readonly RoutineEntry[]
): ReadonlySet<number> {
  const read = new Set<number>()
  for (const entry of entries)
    if (entry.habit === 'bibleReading' && entry.run === run.id)
      for (const portion of entry.portions ?? []) read.add(portion)
  return read
}

export type PlanProgress = {
  read: number
  total: number

  next: Portion | null
  finished: boolean
}

export function planProgress(
  run: ReadingPlanRun,
  entries: readonly RoutineEntry[]
): PlanProgress {
  const total = planPortionCount(run)
  const read = portionsRead(run, entries)
  let next: Portion | null = null
  for (let index = 0; index < total; index++)
    if (!read.has(index)) {
      next = planPortion(run, index)
      break
    }
  let count = 0
  for (const index of read) if (index >= 0 && index < total) count++
  return { read: count, total, next, finished: next === null }
}

export type ChapterRange = {
  book: number
  from: number
  to: number
}

export function chapterRanges(chapters: readonly Chapter[]): ChapterRange[] {
  const ranges: ChapterRange[] = []
  for (const { book, chapter } of chapters) {
    const last = ranges[ranges.length - 1]
    if (last && last.book === book && last.to + 1 === chapter) last.to = chapter
    else ranges.push({ book, from: chapter, to: chapter })
  }
  return ranges
}
