import { useSyncResolutionNotification } from '@/app/sync/useSyncResolutionNotification'
import { useSyncResetNotification } from '@/app/sync/useSyncResetNotification'
import useCalendarSyncNotification from '@/app/calendar/useCalendarSyncNotification'
import type { NotificationItem } from '@/types/notifications'
import useDevNotificationItems from '@/app/notifications/devNotifications'
import useReminderNotifications from '@/app/notifications/useReminderNotifications'
import useDataProtectionRetentionNotification from '@/app/data-protection/useDataProtectionRetentionNotification'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import useBuddyNotifications, {
  syncBuddyNotifications,
  useBuddyTraySyncStatus,
} from '@/features/buddies/hooks/useBuddyNotifications'
import useNotesImportNotifications from '@/features/notes-import/hooks/useNotesImportNotifications'
import NotificationsTray from '@/features/notifications/components/NotificationsTray'
import useNow from '@/hooks/useNow'
import useAuxiliaryMonthNotification from '@/features/service-reports/hooks/useAuxiliaryMonthNotification'
import usePreviousReportNotification from '@/features/service-reports/hooks/usePreviousReportNotification'
import useRolloverNotification from '@/features/service-reports/hooks/useRolloverNotification'
import useBackupNotification from '@/features/settings/hooks/useBackupNotification'
import useSupporterNotifications from '@/features/supporter/hooks/useSupporterNotifications'
import useWhatsNewNotification from '@/features/updates/hooks/useWhatsNewNotification'
import useUpdateRevealNotification from '@/features/updates/hooks/useUpdateRevealNotification'
import useMissedFollowUpNotifications from '@/features/visits/hooks/useMissedFollowUpNotifications'

/**
 * The Home header bell. Each feature derives its own items; the tray merges
 * them, newest first.
 */
export default function NotificationsBell() {
  const { now, refresh } = useNow()
  const buddiesEnabled = useBuddiesEnabled()
  const buddiesSync = useBuddyTraySyncStatus()
  const items: (NotificationItem | null)[] = [
    // Ahead of last month's report on the same day: decide the rollover first.
    useRolloverNotification(),
    usePreviousReportNotification(now),
    useAuxiliaryMonthNotification(now),
    useBackupNotification(now),
    useSyncResolutionNotification(),
    useSyncResetNotification(),
    useDataProtectionRetentionNotification(now),
    ...useReminderNotifications(now),
    ...useMissedFollowUpNotifications(now),
    ...useBuddyNotifications(),
    ...useNotesImportNotifications(),
    useWhatsNewNotification(),
    useCalendarSyncNotification(),
    useUpdateRevealNotification(),
    ...useSupporterNotifications(now),
    ...useDevNotificationItems(now),
  ]

  return (
    <NotificationsTray
      items={items.filter((item) => item !== null)}
      now={now}
      onOpen={() => {
        refresh()
        if (buddiesEnabled) void syncBuddyNotifications()
      }}
      syncState={buddiesSync.state}
      onRetrySync={buddiesSync.retry}
    />
  )
}
