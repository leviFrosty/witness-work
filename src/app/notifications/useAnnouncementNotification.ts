import { Platform } from 'react-native'
import {
  Info as InfoIcon,
  TriangleAlert as TriangleAlertIcon,
} from 'lucide-react-native'
import { analytics } from '@/lib/analytics'
import { useFeatureFlag, useFeatureFlagPayload } from '@/lib/featureFlags'
import { openURL } from '@/lib/links'
import { _i18n } from '@/lib/locales'
import { parseAnnouncement } from '@/features/notifications/lib/announcement'
import type { NotificationItem } from '@/types/notifications'

export default function useAnnouncementNotification(): NotificationItem | null {
  const enabled = useFeatureFlag('announcement')
  const payload = useFeatureFlagPayload('announcement')
  if (!enabled) return null
  const announcement = parseAnnouncement(payload, {
    platform: Platform.OS,
    locale: _i18n.locale,
  })
  if (!announcement) return null

  const { id, tone, title, body, link } = announcement
  return {
    id: `announcement:${id}`,
    kind: 'announcement',
    icon: tone === 'accent' ? InfoIcon : TriangleAlertIcon,
    tone,
    title,
    description: body,
    actions: link
      ? [
          {
            id: 'open_link',
            label: link.label,
            onPress: () => {
              analytics.capture('announcement_link_opened', {
                announcement_id: id,
              })
              void openURL(link.url)
            },
          },
        ]
      : undefined,
    onDismiss: () =>
      analytics.capture('announcement_dismissed', { announcement_id: id }),
  }
}
