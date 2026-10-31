import { HELP_LOCALES, type HelpLocale } from '@/lib/help-center/locales'
import ar from './ar'
import bemZM from './bem-ZM'
import deDE from './de-DE'
import enUS, { type LandingMessages } from './en-US'
import esES from './es-ES'
import frFR from './fr-FR'
import itIT from './it-IT'
import jaJP from './ja-JP'
import koKR from './ko-KR'
import nlNL from './nl-NL'
import ptBR from './pt-BR'
import ptPT from './pt-PT'
import ruRU from './ru-RU'
import rwRW from './rw-RW'
import swKE from './sw-KE'
import ukUA from './uk-UA'
import viVN from './vi-VN'
import zhCN from './zh-CN'
import zhTW from './zh-TW'

export type { LandingMessages }

/** The landing page ships in every language the app and Help Center do. */
export const LANDING_LOCALES = HELP_LOCALES
export type LandingLocale = HelpLocale

const MESSAGES: Record<LandingLocale, LandingMessages> = {
  'en-US': enUS,
  ar,
  'bem-ZM': bemZM,
  'de-DE': deDE,
  'es-ES': esES,
  'fr-FR': frFR,
  'it-IT': itIT,
  'ja-JP': jaJP,
  'ko-KR': koKR,
  'nl-NL': nlNL,
  'pt-BR': ptBR,
  'pt-PT': ptPT,
  'ru-RU': ruRU,
  'rw-RW': rwRW,
  'sw-KE': swKE,
  'uk-UA': ukUA,
  'vi-VN': viVN,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
}

export const messagesFor = (locale: LandingLocale) => MESSAGES[locale]

/** English is unprefixed; every other locale lives at /<locale>. */
export { landingPath } from '@/lib/paths'
