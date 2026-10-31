import enUS from '@/locales/en-US.json'

/**
 * Each language's translations, by app locale. English is the fallback for
 * every missing key, so it's always loaded; the others (about 7 MB together)
 * load when they become the active language. The web loads them from its own
 * origin instead (`translationLoaders.web.ts`).
 */
export const translationLoaders = {
  'en-us': () => enUS,
  'de-de': () => require('../locales/de-DE.json'),
  'es-es': () => require('../locales/es-ES.json'),
  'fr-fr': () => require('../locales/fr-FR.json'),
  'it-it': () => require('../locales/it-IT.json'),
  'ja-jp': () => require('../locales/ja-JP.json'),
  'ko-kr': () => require('../locales/ko-KR.json'),
  'nl-nl': () => require('../locales/nl-NL.json'),
  'pt-br': () => require('../locales/pt-BR.json'),
  'pt-pt': () => require('../locales/pt-PT.json'),
  'ru-ru': () => require('../locales/ru-RU.json'),
  'vi-vn': () => require('../locales/vi-VN.json'),
  'zh-hant-tw': () => require('../locales/zh-TW.json'), // Traditional
  'zh-hans-cn': () => require('../locales/zh-CN.json'), // Simplified
  'sw-ke': () => require('../locales/sw-KE.json'),
  'uk-ua': () => require('../locales/uk-UA.json'),
  'bem-zm': () => require('../locales/bem-ZM.json'), // Bemba
  'rw-rw': () => require('../locales/rw-RW.json'),
  ar: () => require('../locales/ar.json'), // One Arabic for every country
}
