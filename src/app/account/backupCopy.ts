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
}

/** Why turning backup on didn't work. */
export const backupTurnOnFailure = (code: BackupFailure): TranslationKey =>
  code === 'offline'
    ? 'backup_turnOnOffline'
    : code === 'unavailable'
      ? 'backup_errorUnavailable'
      : code === 'key'
        ? 'account_keyFailedBody'
        : 'backup_errorServer'
