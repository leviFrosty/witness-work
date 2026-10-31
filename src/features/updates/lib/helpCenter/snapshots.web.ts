import type { HelpLocale } from '@/features/updates/types/helpCenter'

// Each snapshot is its own chunk, downloaded when its language is first shown,
// which keeps them out of the entry chunk and under the host's file size limit.
const imports: Record<HelpLocale, () => Promise<{ default: unknown }>> = {
  'en-US': () => import('../../../../assets/help-center/en-US.json'),
  ar: () => import('../../../../assets/help-center/ar.json'),
  'bem-ZM': () => import('../../../../assets/help-center/bem-ZM.json'),
  'de-DE': () => import('../../../../assets/help-center/de-DE.json'),
  'es-ES': () => import('../../../../assets/help-center/es-ES.json'),
  'fr-FR': () => import('../../../../assets/help-center/fr-FR.json'),
  'it-IT': () => import('../../../../assets/help-center/it-IT.json'),
  'ja-JP': () => import('../../../../assets/help-center/ja-JP.json'),
  'ko-KR': () => import('../../../../assets/help-center/ko-KR.json'),
  'nl-NL': () => import('../../../../assets/help-center/nl-NL.json'),
  'pt-BR': () => import('../../../../assets/help-center/pt-BR.json'),
  'pt-PT': () => import('../../../../assets/help-center/pt-PT.json'),
  'ru-RU': () => import('../../../../assets/help-center/ru-RU.json'),
  'rw-RW': () => import('../../../../assets/help-center/rw-RW.json'),
  'sw-KE': () => import('../../../../assets/help-center/sw-KE.json'),
  'uk-UA': () => import('../../../../assets/help-center/uk-UA.json'),
  'vi-VN': () => import('../../../../assets/help-center/vi-VN.json'),
  'zh-CN': () => import('../../../../assets/help-center/zh-CN.json'),
  'zh-TW': () => import('../../../../assets/help-center/zh-TW.json'),
}

const fetched: Partial<Record<HelpLocale, unknown>> = {}

/** The Help Center as of this build, once `fetchSnapshot` has downloaded it. */
export const snapshots = Object.fromEntries(
  Object.keys(imports).map((locale) => [
    locale,
    () => fetched[locale as HelpLocale],
  ])
) as Record<HelpLocale, () => unknown>

export async function fetchSnapshot(locale: HelpLocale) {
  fetched[locale] ??= (await imports[locale]()).default
}
