import moment from 'moment'

const loaders: Record<string, () => void> = {
  ar: () => {
    require('moment/locale/ar')
    applyJwArabicMonths()
  },
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

export const JW_ARABIC_MONTHS = [
  'كانون الثاني (يناير)',
  'شباط (فبراير)',
  'آذار (مارس)',
  'نيسان (أبريل)',
  'أيار (مايو)',
  'حزيران (يونيو)',
  'تموز (يوليو)',
  'آب (أغسطس)',
  'أيلول (سبتمبر)',
  'تشرين الأول (أكتوبر)',
  'تشرين الثاني (نوفمبر)',
  'كانون الأول (ديسمبر)',
]

export const JW_ARABIC_MONTHS_SHORT = JW_ARABIC_MONTHS.map((month) =>
  month.replace(/ \(.*\)$/, '')
)

type MutableLocale = moment.Locale & {
  _config: moment.LocaleSpecification
  set(config: moment.LocaleSpecification): void
}

function applyJwArabicMonths(): void {
  const locale = moment.localeData('ar') as MutableLocale
  locale.set({
    ...locale._config,
    months: JW_ARABIC_MONTHS,
    monthsShort: JW_ARABIC_MONTHS_SHORT,
  })
}

const ASCII_PROBE = '0123456789,'
const keepAscii = (text: string) => text

function keepAsciiDigits(key: string): void {
  const locale = moment.localeData(key) as MutableLocale
  if (locale.postformat(ASCII_PROBE) === ASCII_PROBE) return
  locale.set({ ...locale._config, postformat: keepAscii })
}

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
  for (const candidate of missing) {
    loaders[candidate]()
    keepAsciiDigits(candidate)
  }
  moment.locale(active)
}
