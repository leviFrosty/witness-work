import type { NotificationItem } from '@/types/notifications'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import useBuddyNotifications, {
  syncBuddyNotifications,
} from '@/features/buddies/hooks/useBuddyNotifications'
import useMilestoneUpdateNotification from '@/features/milestones/hooks/useMilestoneUpdateNotification'
import useNotesImportNotifications from '@/features/notes-import/hooks/useNotesImportNotifications'
import NotificationsTray from '@/features/notifications/components/NotificationsTray'
import useNow from '@/features/notifications/hooks/useNow'
import useAuxiliaryMonthNotification from '@/features/service-reports/hooks/useAuxiliaryMonthNotification'
import usePreviousReportNotification from '@/features/service-reports/hooks/usePreviousReportNotification'
import useBackupNotification from '@/features/settings/hooks/useBackupNotification'
import useSupporterNotifications from '@/features/supporter/hooks/useSupporterNotifications'
import useWhatsNewNotification from '@/features/updates/hooks/useWhatsNewNotification'
import useMissedFollowUpNotifications from '@/features/visits/hooks/useMissedFollowUpNotifications'

/**
 * The Home header bell. Each feature derives its own items; the tray merges
 * them, newest first.
 */
export default function NotificationsBell() {
  const { now, refresh } = useNow()
  const buddiesEnabled = useBuddiesEnabled()
  const items: (NotificationItem | null)[] = [
    usePreviousReportNotification(now),
    useAuxiliaryMonthNotification(now),
    useBackupNotification(now),
    ...useMissedFollowUpNotifications(now),
    ...useBuddyNotifications(),
    ...useNotesImportNotifications(),
    useWhatsNewNotification(),
    useMilestoneUpdateNotification(),
    ...useSupporterNotifications(now),
  ]

  return (
    <NotificationsTray
      items={items.filter((item) => item !== null)}
      now={now}
      onOpen={() => {
        refresh()
        if (buddiesEnabled) syncBuddyNotifications()
      }}
    />
  )
}
