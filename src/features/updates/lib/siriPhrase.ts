import Constants from 'expo-constants'
import i18n, { TranslationKey } from '@/lib/locales'

/**
 * A watch Siri phrase (`watchShortcut*`) as the user would say it. The
 * translations keep Apple's `${applicationName}` placeholder, which Siri fills
 * with the app's display name.
 */
export const siriPhrase = (key: TranslationKey) =>
  i18n
    .t(key)
    .replace('${applicationName}', Constants.expoConfig?.name ?? 'WitnessWork')
