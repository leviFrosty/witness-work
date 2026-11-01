import { FuseResultMatch } from 'fuse.js'
import i18n from '@/lib/locales'
import { buildSnippet } from '@/lib/contactsSearch'

const DETAIL_SEPARATOR = ' · '

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

export const contactRowAccessibilityLabel = ({
  name,
  subtitle,
  study,
  favorite,
}: {
  name: string

  subtitle: string

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
