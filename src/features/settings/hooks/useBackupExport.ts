import { useRef, useState } from 'react'
import { Alert, Platform } from 'react-native'
import {
  type BackupFileLockChoice,
  createLockedBackupFile,
} from '@/app/sync/lockedBackupFile'
import { analytics } from '@/lib/analytics'
import {
  canExportFiles,
  deliverExport,
  prepareExport,
} from '@/lib/files/exportFile'
import type { BackupFileLock, LockedBackupFile } from '@/lib/backupFileLock'
import { errorTracking } from '@/lib/errorTracking'
import i18n from '@/lib/locales'
import { BACKUP_EXPORT_FILE_NAME } from '@/lib/temporaryCopies'
import { usePreferences } from '@/stores/preferences'

/**
 * Settings → Backup's Create Backup: `start` when the User asks for one (the
 * protection sheet opens), `lock` once they've chosen, then `share` the locked
 * file once the sheet has closed; or `cancel` when they close it.
 */
export default function useBackupExport(entryPoint: string) {
  const [sharing, setSharing] = useState(false)
  const run = useRef<{ startedAt: number; protection?: BackupFileLock }>({
    startedAt: 0,
  })
  const properties = () => ({
    source: 'settings',
    entry_point: entryPoint,
    destination: Platform.OS === 'web' ? 'download' : 'share_sheet',
    ...(run.current.protection ? { protection: run.current.protection } : {}),
  })
  const elapsed = () => Date.now() - run.current.startedAt

  const fail = (stage: string, errorCode: string, error?: unknown) => {
    analytics.capture('backup_export_failed', {
      ...properties(),
      stage,
      elapsed_ms: elapsed(),
      error_code: errorCode,
    })
    if (error) errorTracking.captureException(error)
  }

  const start = () => {
    run.current = { startedAt: Date.now() }
    analytics.capture('backup_export_started', properties())
  }

  const cancel = (protection: BackupFileLock) => {
    run.current.protection = protection
    analytics.capture('backup_export_cancelled', {
      ...properties(),
      stage: 'protection',
      elapsed_ms: elapsed(),
    })
  }

  /** The stores as they are now, locked; null after a failure it alerted. */
  const lock = async (
    choice: BackupFileLockChoice,
    onProgress: (fraction: number) => void
  ): Promise<LockedBackupFile | null> => {
    run.current.protection = choice.lock
    try {
      return await createLockedBackupFile(choice, onProgress)
    } catch (error) {
      fail('lock', 'unexpected', error)
      Alert.alert(
        i18n.t('errorExporting'),
        i18n.t('errorExporting_description')
      )
      return null
    }
  }

  const share = async (file: LockedBackupFile) => {
    let stage = 'sharing_availability'
    setSharing(true)
    try {
      if (!(await canExportFiles())) {
        fail(stage, 'sharing_unavailable')
        Alert.alert(i18n.t('sharingIsNotAvailable'))
        return
      }
      usePreferences.getState().set({ lastBackupDate: new Date() })
      stage = 'write_file'
      const prepared = await prepareExport({
        fileName: BACKUP_EXPORT_FILE_NAME,
        mimeType: 'application/json',
        text: JSON.stringify(file),
        purpose: 'save',
      })
      stage = 'share_sheet'
      await deliverExport(prepared)
      // Expo resolves on both sharing and cancellation; this is not proof
      // that the user saved a backup outside the app.
      analytics.capture('backup_exported', {
        ...properties(),
        outcome: 'unknown',
        elapsed_ms: elapsed(),
      })
    } catch (error) {
      fail(stage, 'unexpected', error)
      Alert.alert(
        i18n.t('errorExporting'),
        i18n.t('errorExporting_description')
      )
    } finally {
      setSharing(false)
    }
  }

  return { sharing, start, cancel, lock, share }
}
