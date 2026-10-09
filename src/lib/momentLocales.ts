import moment from 'moment'

/**
 * Moment locales the app can use, loaded on first use instead of at launch.
 * Every Format Region in `FORMAT_REGIONS` and every Language's base must be
 * here: moment's own fallback, a dynamic `require('./locale/<key>')`, is an
 * uncatchable fatal under Metro. `'en'` ships inside moment itself.
 */
const loaders: Record<string, () => void> = {
  'en-au': () => require('moment/locale/en-au'),
  'en-ca': () => require('moment/locale/en-ca'),
  'en-gb': () => require('moment/locale/en-gb'),
  'en-ie': () => require('moment/locale/en-ie'),
  'en-il': () => require('moment/locale/en-il'),
  'en-nz': () => require('moment/locale/en-nz'),
  'en-sg': () => require('moment/locale/en-sg'),
  'de-at': () => require('moment/locale/de-at'),
  'de-ch': () => require('moment/locale/de-ch'),
  de: () => require('moment/locale/de'),
  'fr-ca': () => require('moment/locale/fr-ca'),
  'fr-ch': () => require('moment/locale/fr-ch'),
  fr: () => require('moment/locale/fr'),
  it: () => require('moment/locale/it'),
  'it-ch': () => require('moment/locale/it-ch'),
  ja: () => require('moment/locale/ja'),
  ko: () => require('moment/locale/ko'),
  pt: () => require('moment/locale/pt'),
  'pt-br': () => require('moment/locale/pt-br'),
  ru: () => require('moment/locale/ru'),
  vi: () => require('moment/locale/vi'),
  'nl-be': () => require('moment/locale/nl-be'),
  nl: () => require('moment/locale/nl'),
  es: () => require('moment/locale/es'),
  'es-do': () => require('moment/locale/es-do'),
  'es-us': () => require('moment/locale/es-us'),
  'zh-cn': () => require('moment/locale/zh-cn'),
  'zh-tw': () => require('moment/locale/zh-tw'),
  sw: () => require('moment/locale/sw'),
  uk: () => require('moment/locale/uk'),
}

export const loadableMomentLocales = Object.keys(loaders)

/**
 * Loads the moment locale for `key` and for its base language, when the app
 * ships them. Keeps the active global locale: defining a locale also switches
 * moment to it.
 */
export function loadMomentLocale(key: string | undefined): void {
  if (!key) return
  const tag = key.toLowerCase()
  const candidates = [tag, tag.split('-')[0]]
  const loaded = moment.locales()
  const missing = candidates.filter(
    (candidate) => loaders[candidate] && !loaded.includes(candidate)
  )
  if (missing.length === 0) return
  const active = moment.locale()
  for (const candidate of missing) loaders[candidate]()
  moment.locale(active)
}
