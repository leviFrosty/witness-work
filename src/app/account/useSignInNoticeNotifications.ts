import { useEffect } from 'react'
import { useNavigation } from '@react-navigation/native'
import {
  SIGN_IN_NOTICE_ROWS,
  signInNoticeDescription,
  signInNoticeTitle,
} from '@/app/account/signInNoticeCopy'
import { countBucket, type SignInNotice } from '@/app/account/signInNotices'
import { watchSignInNotices } from '@/app/account/signInNoticesRuntime'
import {
  markSignInNoticeShown,
  removeSignInNotice,
  useSignInNotices,
} from '@/app/account/signInNoticesStore'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import type { NotificationItem } from '@/types/notifications'
import type { RootStackNavigation } from '@/types/rootStack'

const noticeAnalytics = (notice: SignInNotice) => ({
  kind: notice.kind,
  count: countBucket(notice.count),
})

export function useSignInNoticeNotifications(): NotificationItem[] {
  const navigation = useNavigation<RootStackNavigation>()
  const notices = useSignInNotices((state) => state.notices)

  useEffect(() => watchSignInNotices(), [])

  return notices.map((notice): NotificationItem => {
    const row = SIGN_IN_NOTICE_ROWS[notice.kind]
    return {
      id: notice.id,
      kind: 'sign_in',
      at: notice.at,
      icon: row.icon,
      tone: 'accent',
      title: signInNoticeTitle(notice),
      description: signInNoticeDescription(notice),
      actions: [
        {
          id: row.action.id,
          label: i18n.t(row.action.label),
          onPress: () => {
            analytics.capture('sign_in_notice_tapped', noticeAnalytics(notice))
            removeSignInNotice(notice.id)
            navigation.navigate(row.action.screen)
          },
        },
      ],
      onView: () => {
        if (markSignInNoticeShown(notice.id))
          analytics.capture('sign_in_notice_shown', noticeAnalytics(notice))
      },
      onDismiss: () => {
        analytics.capture('sign_in_notice_dismissed', noticeAnalytics(notice))
        removeSignInNotice(notice.id)
      },
    }
  })
}
