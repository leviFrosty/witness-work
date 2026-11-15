import { firstVerse } from '@/lib/routine/bibleVerses'
import type { Portion } from '@/lib/routine/readingPlans'

const JW_LANGUAGE: Readonly<Record<string, string>> = {
  'en-us': 'E',
  'de-de': 'X',
  'es-es': 'S',
  'fr-fr': 'F',
  'it-it': 'I',
  'ja-jp': 'J',
  'ko-kr': 'KO',
  'nl-nl': 'O',
  'pt-br': 'T',
  'pt-pt': 'TPO',
  'ru-ru': 'U',
  'vi-vn': 'VT',
  'zh-hant-tw': 'CH',
  'zh-hans-cn': 'CHS',
  'sw-ke': 'SW',
  'uk-ua': 'K',
  'bem-zm': 'CW',
  'rw-rw': 'YW',
  ar: 'A',
}

export const jwLanguage = (locale: string): string =>
  JW_LANGUAGE[locale.toLowerCase()] ?? 'E'

const coord = (book: number, chapter: number, verse: number): string =>
  String(book + 1).padStart(2, '0') +
  String(chapter).padStart(3, '0') +
  String(verse).padStart(3, '0')

export function readingLink(
  portion: Pick<Portion, 'chapters' | 'verses'>,
  locale: string
): string | null {
  const [first] = portion.chapters
  if (!first) return null
  const { book, chapter } = first
  const from = portion.verses
    ? portion.verses.from === firstVerse(first)
      ? 0
      : portion.verses.from
    : 0
  const to = portion.verses ? portion.verses.to : 999
  const params = new URLSearchParams({
    wtlocale: jwLanguage(locale),
    prefer: 'lang',
    bible: `${coord(book, chapter, from)}-${coord(book, chapter, to)}`,
  })
  return `https://www.jw.org/finder?${params.toString()}`
}
