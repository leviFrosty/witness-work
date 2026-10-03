/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { Alert } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import * as DocumentPicker from 'expo-document-picker'
import i18n from '@/lib/locales'
import { analytics } from '@/lib/analytics'
import { errorTracking } from '@/lib/errorTracking'
import { BackupFile, restoreBackupFile } from '@/lib/backupFile'
import { migrateServiceReports } from '@/stores/serviceReport'
import { useTimeCache } from '@/stores/timeCache'

interface Options {
  source: 'settings' | 'onboarding'
  entryPoint?: string
}

const validImportFile = (data: unknown): data is BackupFile =>
  typeof data === 'object' && data !== null

/**
 * Picks a WitnessWork JSON backup and restores it over the local stores. The
 * same flow backs Settings → Backup and the onboarding "Pick up where you left
 * off" chooser. Resolves `true` only when the backup was restored; cancel and
 * failures (already alerted) resolve `false`.
 */
export function useBackupImport({ source, entryPoint }: Options) {
  const [importing, setImporting] = useState(false)

  const importBackup = async (): Promise<boolean> => {
    const startedAt = Date.now()
    let stage = 'file_picker'
    const properties = {
      import_type: 'backup_json',
      source,
      ...(entryPoint ? { entry_point: entryPoint } : {}),
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

      analytics.capture('import_file_selected', properties)
      stage = 'read_file'
      const contents = await FileSystem.readAsStringAsync(assets[0].uri)

      stage = 'validate_file'
      const data: unknown = JSON.parse(contents)
      if (!validImportFile(data)) {
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

      stage = 'migrate'
      if (
        data.serviceReportStore &&
        Array.isArray((data.serviceReportStore as any).serviceReports)
      ) {
        ;(data.serviceReportStore as any).serviceReports =
          migrateServiceReports((data.serviceReportStore as any).serviceReports)
      }
      stage = 'restore'
      analytics.capture('import_commit_started', properties)
      restoreBackupFile(data)
      useTimeCache.getState().invalidateAllCache()
      analytics.capture('backup_imported', {
        ...properties,
        elapsed_ms: Date.now() - startedAt,
      })
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

  return { importing, importBackup }
}
