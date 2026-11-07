import type { LandingLocale } from './i18n'

const APP_ID = '6469723047'
const PACKAGE = 'com.leviwilkerson.jwtime'

const APPLE_BADGES = new Set<LandingLocale>([
  'en-US',
  'de-DE',
  'es-ES',
  'fr-FR',
  'it-IT',
  'ja-JP',
  'ko-KR',
  'nl-NL',
  'pt-BR',
  'pt-PT',
  'ru-RU',
  'uk-UA',
  'vi-VN',
  'zh-CN',
  'zh-TW',
])

const GOOGLE_BADGES = new Set<LandingLocale>([
  'en-US',
  'ar',
  'de-DE',
  'es-ES',
  'fr-FR',
  'it-IT',
  'ja-JP',
  'ko-KR',
  'nl-NL',
  'pt-BR',
  'pt-PT',
  'ru-RU',
  'sw-KE',
  'uk-UA',
  'vi-VN',
  'zh-CN',
  'zh-TW',
])

const BADGES = '/images/badges'

export function storeBadges(locale: LandingLocale) {
  const apple = APPLE_BADGES.has(locale) ? locale : 'en-US'
  const google = GOOGLE_BADGES.has(locale) ? locale : 'en-US'
  return {
    appStore: `${BADGES}/app-store-${apple}.svg`,
    googlePlay: `${BADGES}/google-play-${google}.webp`,
  }
}

export function storeLinks(locale: LandingLocale) {
  const hl = locale.replace('-', '_')
  return {
    appStore: `https://apps.apple.com/app/witnesswork/id${APP_ID}`,
    googlePlay: `https://play.google.com/store/apps/details?id=${PACKAGE}&hl=${hl}`,
  }
}
