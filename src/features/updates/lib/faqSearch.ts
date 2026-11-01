import Fuse from 'fuse.js'
import { foldArabicForSearch } from '@/lib/searchNormalize'
import type { HelpEntry } from '@/features/updates/types/helpCenter'

type FAQSearchEntry = {
  entry: HelpEntry
  question: string
  answer: string
}

const indexes = new WeakMap<HelpEntry[], Fuse<FAQSearchEntry>>()

const getFAQIndex = (entries: HelpEntry[]): Fuse<FAQSearchEntry> => {
  const cached = indexes.get(entries)
  if (cached) return cached

  const fuse = new Fuse(
    entries.map((entry) => ({
      entry,
      question: foldArabicForSearch(entry.question),
      answer: foldArabicForSearch(entry.plainText),
    })),
    {
      keys: [
        { name: 'question', weight: 0.7 },
        { name: 'answer', weight: 0.3 },
      ],
      threshold: 0.4,
      ignoreLocation: true,
      minMatchCharLength: 2,
      includeMatches: false,
      includeScore: false,
    }
  )
  indexes.set(entries, fuse)
  return fuse
}

export const searchFAQsFuzzy = (
  query: string,
  entries: HelpEntry[]
): HelpEntry[] => {
  const trimmed = query.trim()
  if (!trimmed) return entries
  return getFAQIndex(entries)
    .search(foldArabicForSearch(trimmed))
    .map((result) => result.item.entry)
}
