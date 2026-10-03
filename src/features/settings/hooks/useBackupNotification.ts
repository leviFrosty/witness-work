import { FileOutput as FileOutputIcon } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import type { NotificationItem } from '@/types/notifications'
import type { RootStackNavigation } from '@/types/rootStack'
import { backupReminderDueAt } from '@/features/settings/lib/backupReminder'
import * as ICloudBridge from '../../../../modules/icloud-bridge'

/**
 * Tray reminder to export a backup once it's been
 * `backupNotificationFrequencyAsDays` since the last one. Dismissing snoozes it
 * for another period.
 */
export default function useBackupNotification(
  now: number
): NotificationItem | null {
  const navigation = useNavigation<RootStackNavigation>()
  const {
    remindMeAboutBackups,
    backupNotificationFrequencyAsDays: frequencyDays,
    installedOn,
    lastBackupDate,
    backupReminderSnoozedAt,
    iCloudSyncEnabled,
    lastiCloudPushedAt,
    lastiCloudPulledAt,
    lastiCloudUploadedAt,
    set,
  } = usePreferences()

  const dueAt = backupReminderDueAt({
    remindMeAboutBackups,
    frequencyDays,
    installedOn,
    lastBackupDate,
    snoozedAt: backupReminderSnoozedAt,
    iCloudSyncEnabled,
    lastiCloudPushedAt,
    lastiCloudPulledAt,
    lastiCloudUploadedAt,
    uploadConfirmationSupported: ICloudBridge.supportsUploadStatus(),
    now,
  })
  if (dueAt === null) return null

  const properties = {
    source: 'notifications_tray',
    // `compact` was the slim Home bar shown while iCloud Sync is on.
    variant: iCloudSyncEnabled ? 'compact' : 'full',
    frequency_days: frequencyDays,
  }

  return {
    id: `backup:${dueAt}`,
    kind: 'backup',
    icon: FileOutputIcon,
    tone: 'warn',
    title: i18n.t('recommendedBackup'),
    description: i18n.t('recommendedBackup_description', {
      count: frequencyDays,
    }),
    actions: [
      {
        id: 'backup_now',
        label: i18n.t('backupNow'),
        onPress: () => {
          analytics.capture('backup_reminder_clicked', properties)
          navigation.navigate('Import and Export', {
            source: 'backup_reminder',
          })
        },
      },
    ],
    onView: () => analytics.capture('backup_reminder_viewed', properties),
    onDismiss: () => {
      analytics.capture('backup_reminder_dismissed', properties)
      set({ backupReminderSnoozedAt: Date.now() })
    },
  }
}
