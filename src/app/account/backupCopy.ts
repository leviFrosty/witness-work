import { attestationProblemBody } from '@/app/account/attestationCopy'
import type { TranslationKey } from '@/lib/locales'
import type { BackupFailure } from '@/lib/serverAccount/backupScheduler'

/** The backup's status line after a failed upload. */
export const BACKUP_FAILURE_STATUS: Record<BackupFailure, TranslationKey> = {
  offline: 'backup_statusOffline',
  unavailable: 'backup_statusUnavailable',
  too_large: 'backup_statusTooLarge',
  limit: 'backup_statusLimit',
  rate_limited: 'backup_statusWaiting',
  key: 'backup_statusKey',
  server: 'backup_statusServer',
  unverified: 'backup_statusUnverified',
  verify_later: 'backup_statusVerifyLater',
  update: 'backup_statusUpdate',
}

/** What the User can do about it, under the section. */
export const BACKUP_FAILURE_DETAIL: Record<BackupFailure, TranslationKey> = {
  offline: 'backup_errorOffline',
  unavailable: 'backup_errorUnavailable',
  too_large: 'backup_errorTooLarge',
  limit: 'backup_errorLimit',
  rate_limited: 'backup_errorWaiting',
  key: 'account_keyFailedBody',
  server: 'backup_errorServer',
  unverified: attestationProblemBody('device'),
  verify_later: 'backup_errorVerifyLater',
  update: 'account_updateRequired',
}

/** Why turning backup on didn't work. */
export const backupTurnOnFailure = (code: BackupFailure): TranslationKey => {
  switch (code) {
    case 'offline':
      return 'backup_turnOnOffline'
    case 'unavailable':
      return 'backup_errorUnavailable'
    case 'key':
      return 'account_keyFailedBody'
    case 'unverified':
      return attestationProblemBody('device')
    case 'verify_later':
      return attestationProblemBody('temporary')
    case 'update':
      return 'account_updateRequired'
    default:
      return 'backup_errorServer'
  }
}
