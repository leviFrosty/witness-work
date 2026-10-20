import { FuseResultMatch } from 'fuse.js'
import i18n from '@/lib/locales'
import { buildSnippet } from '@/lib/contactsSearch'

/** The " · " a Contact row's second line puts between its details. */
const DETAIL_SEPARATOR = ' · '

/**
 * A search preview line's text as `HighlightedText` shows it: the snippet
 * window around the match, with its ellipses.
 */
export const previewText = (
  match: FuseResultMatch,
  contextChars: number
): string => {
  const value = match.value ?? ''
  if (!match.indices?.length) return value
  const snippet = buildSnippet(value, match.indices, contextChars)
  if (!snippet.segments.length) return value
  return [
    snippet.truncatedStart ? '…' : '',
    ...snippet.segments.map((s) => s.text),
    snippet.truncatedEnd ? '…' : '',
  ].join('')
}

/**
 * One screen-reader label for a Contact row: the name, then what the row shows
 * beside it in the same order and wording. Details the row separates with " · "
 * are read with a pause instead.
 */
export const contactRowAccessibilityLabel = ({
  name,
  subtitle,
  study,
  favorite,
}: {
  name: string
  /** The row's second line, exactly as shown. */
  subtitle: string
  /** The book icon: filled for a study this month, outlined for a past one. */
  study: 'active' | 'past' | null
  favorite: boolean
}): string =>
  [
    name,
    ...subtitle.split(DETAIL_SEPARATOR),
    study === 'active' && i18n.t('contactRow_a11yStudyActive'),
    study === 'past' && i18n.t('contactRow_a11yStudyPast'),
    favorite && i18n.t('contactRow_a11yFavorite'),
  ]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join(', ')
