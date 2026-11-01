import { Platform } from 'react-native'
import type { TranslationKey } from '@/lib/locales'
import type { AttestationProblem } from '@/lib/serverAccount/session'

export const platformKey = (
  ios: TranslationKey,
  android: TranslationKey
): TranslationKey => (Platform.OS === 'android' ? android : ios)

export const attestationProblemBody = (
  problem: AttestationProblem
): TranslationKey =>
  problem === 'temporary'
    ? 'account_verifyLaterBody'
    : platformKey('account_unverifiedBody', 'account_unverifiedBodyAndroid')
