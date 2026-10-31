import {
  normalizeRecoveryKey,
  parseRecoveryKey,
  RECOVERY_KEY_LENGTH,
} from '@/lib/accountKey/recoveryKey'
import i18n from '@/lib/locales'

export type RecoveryKeyStatus = {
  text: string
  tone: 'hint' | 'error' | 'ok'
}

/**
 * A recovery key as it's typed (`parseRecoveryKey`), and the line under the
 * field: `emptyHint` until something is typed, then progress, the mistake, or
 * that it looks right. On phones and on the web's sign-in screen.
 */
export function recoveryKeyStatus(
  value: string,
  emptyHint: string
): {
  parsed: ReturnType<typeof parseRecoveryKey>
  status: RecoveryKeyStatus
} {
  const parsed = parseRecoveryKey(value)
  const status: RecoveryKeyStatus = parsed.ok
    ? { text: i18n.t('account_enterValid'), tone: 'ok' }
    : parsed.problem === 'empty'
      ? { text: emptyHint, tone: 'hint' }
      : parsed.problem === 'incomplete'
        ? {
            text: i18n.t('account_enterProgress', {
              count: normalizeRecoveryKey(value).length,
              total: RECOVERY_KEY_LENGTH,
            }),
            tone: 'hint',
          }
        : {
            text: i18n.t(
              parsed.problem === 'character'
                ? 'account_enterCharacter'
                : parsed.problem === 'tooLong'
                  ? 'account_enterTooLong'
                  : 'account_enterChecksum'
            ),
            tone: 'error',
          }
  return { parsed, status }
}
