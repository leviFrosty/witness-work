export const BIBLE_BOOKS = [
  ['genesis', 50],
  ['exodus', 40],
  ['leviticus', 27],
  ['numbers', 36],
  ['deuteronomy', 34],
  ['joshua', 24],
  ['judges', 21],
  ['ruth', 4],
  ['1samuel', 31],
  ['2samuel', 24],
  ['1kings', 22],
  ['2kings', 25],
  ['1chronicles', 29],
  ['2chronicles', 36],
  ['ezra', 10],
  ['nehemiah', 13],
  ['esther', 10],
  ['job', 42],
  ['psalms', 150],
  ['proverbs', 31],
  ['ecclesiastes', 12],
  ['songOfSolomon', 8],
  ['isaiah', 66],
  ['jeremiah', 52],
  ['lamentations', 5],
  ['ezekiel', 48],
  ['daniel', 12],
  ['hosea', 14],
  ['joel', 3],
  ['amos', 9],
  ['obadiah', 1],
  ['jonah', 4],
  ['micah', 7],
  ['nahum', 3],
  ['habakkuk', 3],
  ['zephaniah', 3],
  ['haggai', 2],
  ['zechariah', 14],
  ['malachi', 4],
  ['matthew', 28],
  ['mark', 16],
  ['luke', 24],
  ['john', 21],
  ['acts', 28],
  ['romans', 16],
  ['1corinthians', 16],
  ['2corinthians', 13],
  ['galatians', 6],
  ['ephesians', 6],
  ['philippians', 4],
  ['colossians', 4],
  ['1thessalonians', 5],
  ['2thessalonians', 3],
  ['1timothy', 6],
  ['2timothy', 4],
  ['titus', 3],
  ['philemon', 1],
  ['hebrews', 13],
  ['james', 5],
  ['1peter', 5],
  ['2peter', 3],
  ['1john', 5],
  ['2john', 1],
  ['3john', 1],
  ['jude', 1],
  ['revelation', 22],
] as const

export type BibleBookId = (typeof BIBLE_BOOKS)[number][0]

export const BIBLE_BOOK_COUNT = BIBLE_BOOKS.length

export const bookId = (book: number): BibleBookId => BIBLE_BOOKS[book][0]

export const chaptersIn = (book: number): number => BIBLE_BOOKS[book][1]

export const bookIndex = (id: BibleBookId): number =>
  BIBLE_BOOKS.findIndex(([book]) => book === id)

export type Chapter = { book: number; chapter: number }

export const BIBLE_CHAPTER_COUNT = BIBLE_BOOKS.reduce(
  (total, [, chapters]) => total + chapters,
  0
)
