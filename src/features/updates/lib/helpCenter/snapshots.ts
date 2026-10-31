import type { HelpLocale } from '@/features/updates/types/helpCenter'

// The Help Center as of this build (`pnpm sync:help`), for a first open with no
// connection. Each loads only when its language is the one shown.
export const snapshots: Record<HelpLocale, () => unknown> = {
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

/** Every snapshot is in the bundle, so there's nothing to fetch. */
export const fetchSnapshot = (_locale: HelpLocale): Promise<void> =>
  Promise.resolve()
