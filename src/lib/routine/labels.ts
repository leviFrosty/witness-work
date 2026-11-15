import moment from 'moment'
import i18n, { type TranslationKey } from '@/lib/locales'
import { bookId, type Chapter } from '@/lib/routine/bible'
import { chapterRanges, type Portion } from '@/lib/routine/readingPlans'
import type { RoutineHabit, WorshipKind } from '@/types/routine'

export const bookName = (book: number): string =>
  i18n.t(`routine.bible.book.${bookId(book)}` as TranslationKey)

export function chaptersLabel(chapters: readonly Chapter[]): string {
  const parts = chapterRanges(chapters).map(({ book, from, to }) =>
    from === to
      ? i18n.t('routine.bible.chapter', { book: bookName(book), chapter: from })
      : i18n.t('routine.bible.range', { book: bookName(book), from, to })
  )
  if (parts.length === 0) return ''
  return parts.reduce((first, rest) =>
    i18n.t('routine.bible.join', { first, rest })
  )
}

export function portionLabel(
  portion: Pick<Portion, 'chapters' | 'verses'>
): string {
  const [chapter] = portion.chapters
  if (!portion.verses || !chapter) return chaptersLabel(portion.chapters)
  const { from, to } = portion.verses
  const book = bookName(chapter.book)
  return from === to
    ? i18n.t('routine.bible.verse', {
        book,
        chapter: chapter.chapter,
        verse: from,
      })
    : i18n.t('routine.bible.verses', {
        book,
        chapter: chapter.chapter,
        from,
        to,
      })
}

export const habitLabel = (
  habit: RoutineHabit,
  worshipKind: WorshipKind = 'family'
): string =>
  habit === 'worship' && worshipKind === 'personal'
    ? i18n.t('routine.habit.worshipPersonal')
    : i18n.t(`routine.habit.${habit}` as TranslationKey)

export const weekdayName = (weekday: number): string =>
  moment().day(weekday).format('dddd')
