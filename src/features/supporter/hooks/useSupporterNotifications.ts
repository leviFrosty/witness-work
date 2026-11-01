import { useEffect } from 'react'
import {
  Heart as HeartIcon,
  MessageCircleHeart as MessageCircleHeartIcon,
} from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import useIsSupporter from '@/hooks/useIsSupporter'
import { analytics } from '@/lib/analytics'
import { isOwnVisit } from '@/lib/conversations'
import i18n from '@/lib/locales'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import { useServiceReport } from '@/stores/serviceReport'
import type { NotificationItem } from '@/types/notifications'
import type { RootStackNavigation } from '@/types/rootStack'
import { supporterNudgePath } from '@/features/supporter/lib/supporterNudge'
import {
  finishSupporterSurvey,
  openSupporterSurvey,
  useSupporterSurveys,
} from '@/features/supporter/stores/supporterSurveys'
import { useShallow } from 'zustand/react/shallow'

export default function useSupporterNotifications(
  now: number
): NotificationItem[] {
  const navigation = useNavigation<RootStackNavigation>()
  const invite = useSupporterSurveys((state) => state.invite)
  const { isSupporter } = useIsSupporter()
  const serviceReports = useServiceReport((state) => state.serviceReports)
  const contactsCount = useContacts((state) => state.contacts.length)

  const conversationsCount = useConversations(
    (state) => state.conversations.filter(isOwnVisit).length
  )
  const {
    hideDonateHeart,
    hideSupporterNudge,
    installedOn,
    supporterNudgeDismissedAt,
    supporterNudgeAvailableSince,
    devSupporterNudgeForceShow,
    homeChecklistCompletedAt,
    set,
  } = usePreferences(
    useShallow((s) => ({
      hideDonateHeart: s.hideDonateHeart,
      hideSupporterNudge: s.hideSupporterNudge,
      installedOn: s.installedOn,
      supporterNudgeDismissedAt: s.supporterNudgeDismissedAt,
      supporterNudgeAvailableSince: s.supporterNudgeAvailableSince,
      devSupporterNudgeForceShow: s.devSupporterNudgeForceShow,
      homeChecklistCompletedAt: s.homeChecklistCompletedAt,
      set: s.set,
    }))
  )

  useEffect(() => {
    if (supporterNudgeAvailableSince === null) {
      set({ supporterNudgeAvailableSince: Date.now() })
    }
  }, [supporterNudgeAvailableSince, set])

  const checklistNote: NotificationItem[] =
    homeChecklistCompletedAt === null || isSupporter || hideDonateHeart
      ? []
      : [
          {
            id: 'supporter_note:onboarding_checklist',
            kind: 'supporter_note',
            at: homeChecklistCompletedAt,
            icon: HeartIcon,
            tone: 'supporter',
            title: i18n.t('supporterNote_body'),
            actions: [
              {
                id: 'learn_more',
                label: i18n.t('learnMore'),
                onPress: () =>
                  navigation.navigate('Paywall', {
                    source: 'onboarding_checklist',
                  }),
              },
            ],
          },
        ]

  if (invite) {
    return [
      ...checklistNote,
      {
        id: `supporter_survey:${invite.survey.id}`,
        kind: 'supporter_survey',
        icon: MessageCircleHeartIcon,
        tone: 'supporter',
        title:
          invite.survey.questions[0]?.question ??
          i18n.t('supporterFeedback_open'),
        actions: [
          {
            id: 'share_feedback',
            label: i18n.t('supporterFeedback_open'),
            onPress: () => openSupporterSurvey(invite),
          },
        ],
        onDismiss: () => finishSupporterSurvey(invite.survey, false),
      },
    ]
  }

  const path = supporterNudgePath({
    isSupporter,
    hideDonateHeart,
    hideSupporterNudge,
    installedOn,
    supporterNudgeDismissedAt,
    supporterNudgeAvailableSince,
    serviceReports,
    contactsCount,
    conversationsCount,
    devForceShow: devSupporterNudgeForceShow,
    isDev: __DEV__,
    now: new Date(now),
  })
  if (!path) return checklistNote

  const stampDismissal = () => set({ supporterNudgeDismissedAt: Date.now() })
  return [
    ...checklistNote,
    {
      id: `supporter_nudge:${supporterNudgeDismissedAt ?? 0}`,
      kind: 'supporter_nudge',
      icon: HeartIcon,
      tone: 'supporter',
      title: i18n.t('supporterNudge_title'),
      description: i18n.t('supporterNudge_body'),
      actions: [
        {
          id: 'learn_more',
          label: i18n.t('supporterNudge_cta'),
          onPress: () => {
            stampDismissal()
            analytics.capture('supporter_nudge_clicked', {
              source: 'notifications_tray',
              variant: path,
            })

            navigation.navigate('Paywall', { source: 'notifications_tray' })
          },
        },
      ],
      onView: () =>
        analytics.capture('supporter_nudge_viewed', {
          source: 'notifications_tray',
          variant: path,
        }),
      onDismiss: () => {
        analytics.capture('supporter_nudge_dismissed', {
          source: 'notifications_tray',
          variant: path,
        })
        stampDismissal()
      },
    },
  ]
}
