import enUS from '@/locales/en-US.json'

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
  'zh-hant-tw': () => require('../locales/zh-TW.json'),
  'zh-hans-cn': () => require('../locales/zh-CN.json'),
  'sw-ke': () => require('../locales/sw-KE.json'),
  'uk-ua': () => require('../locales/uk-UA.json'),
  'bem-zm': () => require('../locales/bem-ZM.json'),
  'rw-rw': () => require('../locales/rw-RW.json'),
  ar: () => require('../locales/ar.json'),
}
