import Constants from 'expo-constants'
import i18n, { TranslationKey } from '@/lib/locales'

export const siriPhrase = (key: TranslationKey) =>
  i18n
    .t(key)
    .replace('${applicationName}', Constants.expoConfig?.name ?? 'WitnessWork')
