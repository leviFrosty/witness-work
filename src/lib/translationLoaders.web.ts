import enUS from '@/locales/en-US.json'

const translations = (json: { default: Record<string, unknown> }) =>
  json.default

/**
 * The web downloads a language's translations when it becomes the active one,
 * so the entry bundle carries English only (`translationLoaders.ts`).
 * `@/lib/locales` waits for them before the app renders.
 */
export const translationLoaders = {
  'en-us': () => enUS,
  'de-de': () => import('../locales/de-DE.json').then(translations),
  'es-es': () => import('../locales/es-ES.json').then(translations),
  'fr-fr': () => import('../locales/fr-FR.json').then(translations),
  'it-it': () => import('../locales/it-IT.json').then(translations),
  'ja-jp': () => import('../locales/ja-JP.json').then(translations),
  'ko-kr': () => import('../locales/ko-KR.json').then(translations),
  'nl-nl': () => import('../locales/nl-NL.json').then(translations),
  'pt-br': () => import('../locales/pt-BR.json').then(translations),
  'pt-pt': () => import('../locales/pt-PT.json').then(translations),
  'ru-ru': () => import('../locales/ru-RU.json').then(translations),
  'vi-vn': () => import('../locales/vi-VN.json').then(translations),
  'zh-hant-tw': () => import('../locales/zh-TW.json').then(translations), // Traditional
  'zh-hans-cn': () => import('../locales/zh-CN.json').then(translations), // Simplified
  'sw-ke': () => import('../locales/sw-KE.json').then(translations),
  'uk-ua': () => import('../locales/uk-UA.json').then(translations),
  'bem-zm': () => import('../locales/bem-ZM.json').then(translations), // Bemba
  'rw-rw': () => import('../locales/rw-RW.json').then(translations),
  ar: () => import('../locales/ar.json').then(translations), // One Arabic for every country
}
