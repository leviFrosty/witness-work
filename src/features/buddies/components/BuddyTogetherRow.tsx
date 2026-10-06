import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import moment from 'moment'
import {
  CalendarDays as CalendarDaysIcon,
  ChevronRight as ChevronRightIcon,
  UserRound as UserRoundIcon,
} from 'lucide-react-native'
import ContextMenu, {
  type ContextMenuEntries,
} from '@/components/ui/ContextMenu'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PullDownMenu from '@/components/ui/PullDownMenu'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import { formatStartTime, formatWeekdayMonthDayCompact } from '@/lib/dates'
import i18n from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { usePreferences } from '@/stores/preferences'
import type { RootStackNavigation } from '@/types/rootStack'
import type { ShareReply } from '@/features/buddies/lib/schemas'
import type { TogetherItem } from '@/features/buddies/lib/together'

/**
 * One Plan or Follow-up with a buddy: when, what, and where things stand. Opens
 * this User's own Plan or Contact; a buddy's invitation can be answered again
 * from its menu.
 */
export default function BuddyTogetherRow({
  item,
  buddyName,
  last,
  busy,
  onAnswer,
}: {
  item: TogetherItem
  buddyName: string
  last: boolean
  busy: boolean
  onAnswer: (reply: ShareReply) => void
}) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { timeDisplayFormat, dataProtectionMode } = usePreferences()
  const { details } = item
  const isFollowUp = item.type === 'followUp'
  // A Follow-up's first name is householder data.
  const title = isFollowUp
    ? details.firstName && !dataProtectionMode
      ? i18n.t('buddies_followUpWith', { name: details.firstName })
      : i18n.t('buddies_followUp')
    : details.title || i18n.t('buddies_plan')
  const when = [
    formatWeekdayMonthDayCompact(moment(details.d, 'YYYY-MM-DD')),
    details.s === undefined ? undefined : formatStartTime(details.s),
    details.m === undefined
      ? undefined
      : formatMinutes(details.m, timeDisplayFormat).formatted,
  ]
    .filter(Boolean)
    .join(' · ')

  const going = item.status === 'going'
  const status =
    item.direction === 'incoming'
      ? i18n.t(going ? 'buddies_answeredGoing' : 'buddies_answeredDeclined')
      : item.status === 'invited'
        ? i18n.t('buddies_replyInvited')
        : i18n.t(
            going ? 'buddies_notifReplyGoing' : 'buddies_notifReplyDeclined',
            { name: buddyName }
          )

  const { planId } = item
  const contactId = item.direction === 'outgoing' ? item.contactId : undefined
  const open = planId
    ? () => navigation.navigate('PlanDay', { existingDayPlanId: planId })
    : contactId
      ? () => navigation.navigate('Contact Details', { id: contactId })
      : undefined

  const changeAnswer: ContextMenuEntries =
    item.direction === 'incoming'
      ? [
          going
            ? {
                id: 'declined',
                title: i18n.t('buddies_cantMakeIt'),
                systemImage: 'xmark.circle',
                onPress: () => onAnswer('declined'),
              }
            : {
                id: 'going',
                title: i18n.t('buddies_going'),
                systemImage: 'checkmark.circle',
                onPress: () => onAnswer('going'),
              },
        ]
      : []

  return (
    <XView
      style={{
        borderBottomWidth: last ? 0 : 1,
        borderColor: theme.colors.border,
        opacity: item.status === 'declined' ? 0.6 : 1,
      }}
    >
      <ContextMenu
        style={{ flex: 1 }}
        onPress={open}
        actions={[
          open && {
            id: 'open',
            title: i18n.t('open'),
            systemImage: 'arrow.up.forward.app',
            onPress: open,
          },
          ...changeAnswer,
        ]}
        accessibilityLabel={[title, when, status].join(', ')}
      >
        <XView
          style={{
            gap: 12,
            paddingVertical: 12,
            paddingLeft: 15,
            paddingRight: item.direction === 'incoming' ? 0 : 15,
          }}
        >
          <LucideIcon
            icon={isFollowUp ? UserRoundIcon : CalendarDaysIcon}
            size={18}
            color={theme.colors.textAlt}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              numberOfLines={1}
              style={{ fontFamily: theme.fonts.semiBold }}
            >
              {title}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {when}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                color: going ? theme.colors.accent : theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {status}
            </Text>
          </View>
          {open ? (
            <LucideIcon
              icon={ChevronRightIcon}
              size={18}
              color={theme.colors.textAlt}
            />
          ) : null}
        </XView>
      </ContextMenu>
      {item.direction === 'incoming' ? (
        <View
          style={{ paddingLeft: 12, paddingRight: 15 }}
          pointerEvents={busy ? 'none' : 'auto'}
        >
          <PullDownMenu
            actions={changeAnswer}
            accessibilityLabel={i18n.t('buddies_changeAnswer')}
            triggerSize={16}
          />
        </View>
      ) : null}
    </XView>
  )
}
