import {
  BIBLE_BOOK_COUNT,
  BIBLE_BOOKS,
  bookIndex,
  chaptersIn,
  type BibleBookId,
  type Chapter,
} from '@/lib/routine/bible'
import { firstVerse, versesIn } from '@/lib/routine/bibleVerses'
import type { ReadingPlanRun, RoutineEntry } from '@/types/routine'

export const PLAN_DAYS_IN_A_YEAR = 365

export const MIN_CHAPTERS_PER_DAY = 1
export const MAX_CHAPTERS_PER_DAY = 10
export const DEFAULT_CHAPTERS_PER_DAY = 3

export const MIN_VERSES_PER_DAY = 2
export const MAX_VERSES_PER_DAY = 20
export const DEFAULT_VERSES_PER_DAY = 5

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

const clampBook = (book: number | undefined): number | null =>
  Number.isInteger(book) && book! >= 0 && book! < BIBLE_BOOK_COUNT
    ? book!
    : null

export type BookRange = { startBook: number; endBook: number }

export function planBooks(
  run: Pick<ReadingPlanRun, 'startBook' | 'endBook'>
): BookRange {
  const startBook = clampBook(run.startBook) ?? 0
  const endBook =
    clampBook(run.endBook) ??
    (startBook + BIBLE_BOOK_COUNT - 1) % BIBLE_BOOK_COUNT
  return { startBook, endBook }
}

const booksIn = ({ startBook, endBook }: BookRange): number[] => {
  const count =
    ((endBook - startBook + BIBLE_BOOK_COUNT) % BIBLE_BOOK_COUNT) + 1
  return Array.from(
    { length: count },
    (_, i) => (startBook + i) % BIBLE_BOOK_COUNT
  )
}

export const coversWholeBible = (
  run: Pick<ReadingPlanRun, 'kind' | 'startBook' | 'endBook'>
): boolean =>
  run.kind !== 'custom' || booksIn(planBooks(run)).length === BIBLE_BOOK_COUNT

export const clampChaptersPerDay = (value: number | undefined): number =>
  Number.isInteger(value)
    ? Math.min(MAX_CHAPTERS_PER_DAY, Math.max(MIN_CHAPTERS_PER_DAY, value!))
    : DEFAULT_CHAPTERS_PER_DAY

export const clampVersesPerDay = (value: number | undefined): number =>
  Number.isInteger(value)
    ? Math.min(MAX_VERSES_PER_DAY, Math.max(MIN_VERSES_PER_DAY, value!))
    : DEFAULT_VERSES_PER_DAY

export type ReadingUnit = 'chapters' | 'verses'
export type PlanAmount = { unit: ReadingUnit; count: number }

export const planAmount = (
  run: Pick<ReadingPlanRun, 'chaptersPerDay' | 'versesPerDay'>
): PlanAmount =>
  run.versesPerDay !== undefined
    ? { unit: 'verses', count: clampVersesPerDay(run.versesPerDay) }
    : { unit: 'chapters', count: clampChaptersPerDay(run.chaptersPerDay) }

export type PlanShape = Pick<
  ReadingPlanRun,
  'kind' | 'startBook' | 'endBook' | 'chaptersPerDay' | 'versesPerDay'
>

const shapeKey = (run: PlanShape): string => {
  if (run.kind !== 'custom') return run.kind
  const { startBook, endBook } = planBooks(run)
  const { unit, count } = planAmount(run)
  return `custom:${startBook}-${endBook}:${count}${unit}`
}

export function planChapters(
  run: Pick<ReadingPlanRun, 'kind' | 'startBook' | 'endBook'>
): Chapter[] {
  if (run.kind === 'chronological') return CHRONOLOGICAL.flatMap(chaptersOf)
  const books =
    run.kind === 'custom'
      ? booksIn(planBooks(run))
      : booksIn({ startBook: 0, endBook: BIBLE_BOOK_COUNT - 1 })
  const chapters: Chapter[] = []
  for (const book of books)
    for (let chapter = 1; chapter <= BIBLE_BOOKS[book][1]; chapter++)
      chapters.push({ book, chapter })
  return chapters
}

export type VerseRange = { from: number; to: number }

export type Portion = {
  index: number
  chapters: Chapter[]
  verses?: VerseRange
}

function versePortions(chapters: readonly Chapter[], perDay: number) {
  const portions: Omit<Portion, 'index'>[] = []
  for (const chapter of chapters) {
    const verses = versesIn(chapter)
    const first = firstVerse(chapter)
    const parts = Math.ceil(verses / perDay)
    if (parts <= 1) {
      portions.push({ chapters: [chapter] })
      continue
    }
    for (let part = 0; part < parts; part++)
      portions.push({
        chapters: [chapter],
        verses: {
          from: first + Math.floor((part * verses) / parts),
          to: first + Math.floor(((part + 1) * verses) / parts) - 1,
        },
      })
  }
  return portions
}

function buildPortions(run: PlanShape): Portion[] {
  const chapters = planChapters(run)
  if (run.kind !== 'custom') {
    const count = Math.min(PLAN_DAYS_IN_A_YEAR, chapters.length)
    return Array.from({ length: count }, (_, index) => ({
      index,
      chapters: chapters.slice(
        Math.floor((index * chapters.length) / count),
        Math.floor(((index + 1) * chapters.length) / count)
      ),
    }))
  }
  const { unit, count } = planAmount(run)
  if (unit === 'verses')
    return versePortions(chapters, count).map((portion, index) => ({
      index,
      ...portion,
    }))
  return Array.from(
    { length: Math.ceil(chapters.length / count) },
    (_, index) => ({
      index,
      chapters: chapters.slice(index * count, (index + 1) * count),
    })
  )
}

const portionCache = new Map<string, Portion[]>()

export function planPortions(run: PlanShape): readonly Portion[] {
  const key = shapeKey(run)
  const cached = portionCache.get(key)
  if (cached) return cached
  const portions = buildPortions(run)
  portionCache.set(key, portions)
  return portions
}

export const planPortionCount = (run: PlanShape): number =>
  planPortions(run).length

export function planPortion(run: PlanShape, index: number): Portion | null {
  if (!Number.isInteger(index)) return null
  return planPortions(run)[index] ?? null
}

export const portionVerses = (
  portion: Pick<Portion, 'chapters' | 'verses'>
): number =>
  portion.verses
    ? portion.verses.to - portion.verses.from + 1
    : portion.chapters.reduce((sum, chapter) => sum + versesIn(chapter), 0)

const VERSES_PER_MINUTE = 7

export function planMinutesADay(run: PlanShape): number {
  const portions = planPortions(run)
  if (portions.length === 0) return 0
  const verses = portions.reduce((sum, p) => sum + portionVerses(p), 0)
  return Math.max(1, Math.round(verses / portions.length / VERSES_PER_MINUTE))
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
