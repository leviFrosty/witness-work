import links from '@/constants/links'
import { parseHelpBundle } from '@/features/updates/lib/helpCenter/validate'
import { DEFAULT_HELP_LOCALE } from '@/features/updates/lib/helpCenter/locale'
import type {
  HelpBundle,
  HelpLocale,
} from '@/features/updates/types/helpCenter'

// The Help Center as of this build (`pnpm sync:help`), for a first open with no
// connection. Each loads only when its language is the one shown.
const snapshots: Record<HelpLocale, () => unknown> = {
  'en-US': () => require('../../../../assets/help-center/en-US.json'),
  ar: () => require('../../../../assets/help-center/ar.json'),
  'bem-ZM': () => require('../../../../assets/help-center/bem-ZM.json'),
  'de-DE': () => require('../../../../assets/help-center/de-DE.json'),
  'es-ES': () => require('../../../../assets/help-center/es-ES.json'),
  'fr-FR': () => require('../../../../assets/help-center/fr-FR.json'),
  'it-IT': () => require('../../../../assets/help-center/it-IT.json'),
  'ja-JP': () => require('../../../../assets/help-center/ja-JP.json'),
  'ko-KR': () => require('../../../../assets/help-center/ko-KR.json'),
  'nl-NL': () => require('../../../../assets/help-center/nl-NL.json'),
  'pt-BR': () => require('../../../../assets/help-center/pt-BR.json'),
  'pt-PT': () => require('../../../../assets/help-center/pt-PT.json'),
  'ru-RU': () => require('../../../../assets/help-center/ru-RU.json'),
  'rw-RW': () => require('../../../../assets/help-center/rw-RW.json'),
  'sw-KE': () => require('../../../../assets/help-center/sw-KE.json'),
  'uk-UA': () => require('../../../../assets/help-center/uk-UA.json'),
  'vi-VN': () => require('../../../../assets/help-center/vi-VN.json'),
  'zh-CN': () => require('../../../../assets/help-center/zh-CN.json'),
  'zh-TW': () => require('../../../../assets/help-center/zh-TW.json'),
}

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

function readSnapshotFor(locale: HelpLocale): HelpBundle | null {
  if (!parsed.has(locale)) {
    const load = snapshots[locale]
    const english = snapshots[DEFAULT_HELP_LOCALE]() as Snapshot
    parsed.set(
      locale,
      load ? parseHelpBundle(expandSnapshot(load() as Snapshot, english)) : null
    )
  }
  return parsed.get(locale) ?? null
}
