/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { Alert } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import * as DocumentPicker from 'expo-document-picker'
import i18n, { type TranslationKey } from '@/lib/locales'
import { analytics } from '@/lib/analytics'
import { errorTracking } from '@/lib/errorTracking'
import { isBackupFile } from '@/lib/backupFile'
import {
  type BackupFileLock,
  BackupUnlockError,
  isLockedBackupFile,
  type LockedBackupFile,
  readLockedBackupFile,
} from '@/lib/backupFileLock'
import { restoreBackupFile } from '@/app/sync/backupFileRestore'
import { unlockWithThisAccount } from '@/app/sync/lockedBackupFile'
import { migrateServiceReports } from '@/stores/serviceReport'
import UnlockBackupSheet, {
  type PasswordUnlockResult,
} from '@/features/settings/components/backup/UnlockBackupSheet'

interface Options {
  source: 'settings' | 'onboarding'
  entryPoint?: string
}

/** Why a locked file gave no backup: `import_failed`'s `error_code`. */
type UnlockProblem =
  | 'invalid_file'
  | 'newer_version'
  | 'no_account_key'
  | 'wrong_account'

type Unlocked =
  | { backup: unknown; protection: BackupFileLock; wrongPasswords: number }
  | { problem: UnlockProblem }
  | { cancelled: true; wrongPasswords: number }

const UNLOCK_ALERTS: Partial<
  Record<UnlockProblem, [title: TranslationKey, body: TranslationKey]>
> = {
  no_account_key: [
    'backupUnlock_noAccount_title',
    'backupUnlock_noAccount_description',
  ],
  wrong_account: [
    'backupUnlock_otherAccount_title',
    'backupUnlock_otherAccount_description',
  ],
}

const problemOf = (error: unknown): UnlockProblem => {
  if (!(error instanceof BackupUnlockError)) throw error
  return error.problem === 'newer' ? 'newer_version' : 'invalid_file'
}

/** Opens an `account` file with this device's key. */
async function unlockToAccount(file: LockedBackupFile): Promise<Unlocked> {
  try {
    const opened = await unlockWithThisAccount(file)
    if (!opened) return { problem: 'no_account_key' }
    return { backup: opened.file, protection: 'account', wrongPasswords: 0 }
  } catch (error) {
    if (error instanceof BackupUnlockError && error.problem === 'key')
      return { problem: 'wrong_account' }
    return { problem: problemOf(error) }
  }
}

/**
 * Picks a WitnessWork JSON backup and restores it over the local stores. The
 * same flow backs Settings → Backup and the onboarding "Pick up where you left
 * off" chooser. A locked file (`backupFileLock.ts`) opens with this device's
 * account key, or asks for its password in `unlockSheet`, which the caller
 * renders. Resolves `true` only when the backup was restored; cancel and
 * failures (already alerted) resolve `false`.
 */
export function useBackupImport({ source, entryPoint }: Options) {
  const [importing, setImporting] = useState(false)
  const [passwordFile, setPasswordFile] = useState<{
    file: LockedBackupFile
    resolve: (result: PasswordUnlockResult) => void
  } | null>(null)

  const askPassword = (file: LockedBackupFile) =>
    new Promise<PasswordUnlockResult>((resolve) =>
      setPasswordFile({ file, resolve })
    )

  const unlock = async (data: unknown): Promise<Unlocked> => {
    let file: LockedBackupFile
    try {
      file = readLockedBackupFile(data)
    } catch (error) {
      return { problem: problemOf(error) }
    }
    if (file.lock === 'account') return unlockToAccount(file)
    const result = await askPassword(file)
    const { wrongPasswords } = result
    if (result.outcome === 'cancelled')
      return { cancelled: true, wrongPasswords }
    if (result.outcome === 'unlocked')
      return {
        backup: result.unlocked.file,
        protection: 'password',
        wrongPasswords,
      }
    // The import's own catch reports it, as for any other failure.
    if (result.problem === 'unexpected')
      throw new Error("Couldn't unlock the backup file")
    return {
      problem: result.problem === 'newer' ? 'newer_version' : 'invalid_file',
    }
  }

  const importBackup = async (): Promise<boolean> => {
    const startedAt = Date.now()
    let stage = 'file_picker'
    const properties = {
      import_type: 'backup_json',
      source,
      ...(entryPoint ? { entry_point: entryPoint } : {}),
    }
    const rejectInvalidFile = () => {
      analytics.capture('import_failed', {
        ...properties,
        stage,
        elapsed_ms: Date.now() - startedAt,
        error_code: 'invalid_file',
      })
      Alert.alert(
        i18n.t('importErrorInvalidFile_title'),
        i18n.t('importErrorInvalidFile_description')
      )
      return false
    }
    setImporting(true)
    analytics.capture('import_started', properties)

    try {
      const { assets, canceled } = await DocumentPicker.getDocumentAsync({
        multiple: false,
        copyToCacheDirectory: true,
        type: 'application/json',
      })

      if (canceled) {
        analytics.capture('import_cancelled', {
          ...properties,
          stage,
          elapsed_ms: Date.now() - startedAt,
        })
        return false
      }

      stage = 'read_file'
      const contents = await FileSystem.readAsStringAsync(assets[0].uri)

      stage = 'validate_file'
      let data: unknown = JSON.parse(contents)
      let protection: BackupFileLock | 'none' = 'none'
      let wrongPasswords = 0
      if (isLockedBackupFile(data)) {
        stage = 'unlock'
        const unlocked = await unlock(data)
        if ('cancelled' in unlocked) {
          analytics.capture('import_cancelled', {
            ...properties,
            stage,
            elapsed_ms: Date.now() - startedAt,
            ...(unlocked.wrongPasswords > 0
              ? { wrong_passwords: unlocked.wrongPasswords }
              : {}),
          })
          return false
        }
        if ('problem' in unlocked) {
          if (unlocked.problem === 'invalid_file') return rejectInvalidFile()
          analytics.capture('import_failed', {
            ...properties,
            stage,
            elapsed_ms: Date.now() - startedAt,
            error_code: unlocked.problem,
          })
          const [title, body] = UNLOCK_ALERTS[unlocked.problem] ?? [
            'importErrorNewerFile_title',
            'importErrorNewerFile_description',
          ]
          Alert.alert(i18n.t(title), i18n.t(body))
          return false
        }
        ;({ backup: data, protection, wrongPasswords } = unlocked)
        stage = 'validate_file'
      }
      if (!isBackupFile(data)) return rejectInvalidFile()

      stage = 'migrate'
      if (
        data.serviceReportStore &&
        Array.isArray((data.serviceReportStore as any).serviceReports)
      ) {
        ;(data.serviceReportStore as any).serviceReports =
          migrateServiceReports((data.serviceReportStore as any).serviceReports)
      }
      stage = 'restore'

      // Records it can't read drop one by one; a broken frame stops it all.
      const restore = restoreBackupFile(data)
      if (!restore.ok && restore.problem === 'newer') {
        analytics.capture('import_failed', {
          ...properties,
          stage,
          elapsed_ms: Date.now() - startedAt,
          error_code: 'newer_version',
        })
        Alert.alert(
          i18n.t('importErrorNewerFile_title'),
          i18n.t('importErrorNewerFile_description')
        )
        return false
      }
      if (!restore.ok) return rejectInvalidFile()
      analytics.capture('backup_imported', {
        ...properties,
        protection,
        ...(wrongPasswords > 0 ? { wrong_passwords: wrongPasswords } : {}),
        elapsed_ms: Date.now() - startedAt,
        ...(restore.droppedRecords > 0
          ? { dropped_records: restore.droppedRecords }
          : {}),
      })
      if (restore.droppedRecords > 0)
        Alert.alert(
          i18n.t('importPartial_title'),
          // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
          i18n.t('importPartial_description', {
            count: restore.droppedRecords,
          })
        )
      return true
    } catch (error) {
      analytics.capture('import_failed', {
        ...properties,
        stage,
        elapsed_ms: Date.now() - startedAt,
        error_code:
          stage === 'validate_file' && error instanceof SyntaxError
            ? 'invalid_json'
            : 'unexpected',
      })
      errorTracking.captureException(error)
      Alert.alert(
        i18n.t('importError_title'),
        i18n.t('importError_description')
      )
      return false
    } finally {
      setImporting(false)
    }
  }

  const unlockSheet = (
    <UnlockBackupSheet
      file={passwordFile?.file ?? null}
      onFinished={(result) => {
        passwordFile?.resolve(result)
        setPasswordFile(null)
      }}
    />
  )

  return { importing, importBackup, unlockSheet }
}
