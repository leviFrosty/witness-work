import { Platform } from 'react-native'
import type { TranslationKey } from '@/lib/locales'
import type { AttestationProblem } from '@/lib/serverAccount/session'

/**
 * The words for a device that couldn't prove it's WitnessWork (ADR 0027): what
 * account features need, on this platform, or that the check only has to wait.
 */
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
