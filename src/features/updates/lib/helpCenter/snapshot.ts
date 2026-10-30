import links from '@/constants/links'
import { parseHelpBundle } from '@/features/updates/lib/helpCenter/validate'
import { DEFAULT_HELP_LOCALE } from '@/features/updates/lib/helpCenter/locale'
import {
  fetchSnapshot,
  snapshots,
} from '@/features/updates/lib/helpCenter/snapshots'
import type {
  HelpBundle,
  HelpLocale,
} from '@/features/updates/types/helpCenter'

type SnapshotEntry = Record<string, unknown> & {
  id: string
  slug: string
  category: string
}
type Snapshot = Record<string, unknown> & {
  locale: string
  entries: SnapshotEntry[]
}

/** An entry's page, by the contract's URL pattern (English is unprefixed). */
export const helpEntryURL = (
  locale: HelpLocale,
  category: string,
  slug: string
) =>
  `${links.helpCenterSite}/witness-work/help-center/${
    locale === DEFAULT_HELP_LOCALE ? '' : `${locale}/`
  }${category}/${slug}`

/**
 * Restores what `pnpm sync:help` leaves out of a snapshot: each entry's URL,
 * and, outside English, the English entries this locale has no translation of
 * (in English order, marked `fallback`).
 */
export function expandSnapshot(
  snapshot: Snapshot,
  english: Snapshot | null
): unknown {
  const withURL = (entry: SnapshotEntry) => ({
    ...entry,
    url: helpEntryURL(snapshot.locale, entry.category, entry.slug),
  })
  if (!english || snapshot.locale === english.locale)
    return { ...snapshot, entries: snapshot.entries.map(withURL) }
  const translated = new Map(snapshot.entries.map((e) => [e.id, e]))
  return {
    ...snapshot,
    entries: english.entries.map((entry) => {
      const own = translated.get(entry.id)
      return own ? withURL(own) : { ...withURL(entry), fallback: true as const }
    }),
  }
}

const parsed = new Map<HelpLocale, HelpBundle | null>()

/** The bundled Help Center for `locale`, or English when it has none. */
export function readSnapshot(locale: HelpLocale): HelpBundle {
  const bundle = readSnapshotFor(locale) ?? readSnapshotFor(DEFAULT_HELP_LOCALE)
  if (!bundle) throw new Error('[HelpCenter] English snapshot is missing')
  return bundle
}

/**
 * Makes `readSnapshot(locale)` ready: the web downloads `locale`'s snapshot and
 * English's (`snapshots.web.ts`). Until then it reads English, if downloaded.
 */
export const loadSnapshot = (locale: HelpLocale) =>
  Promise.all([fetchSnapshot(DEFAULT_HELP_LOCALE), fetchSnapshot(locale)])

function readSnapshotFor(locale: HelpLocale): HelpBundle | null {
  if (!parsed.has(locale)) {
    const snapshot = snapshots[locale]?.() as Snapshot | undefined
    const english = snapshots[DEFAULT_HELP_LOCALE]() as Snapshot | undefined
    // Not downloaded yet (the web); read again once it is.
    if (!snapshot || !english) return null
    parsed.set(locale, parseHelpBundle(expandSnapshot(snapshot, english)))
  }
  return parsed.get(locale) ?? null
}
