import type { ReactNode } from 'react'
import { View } from 'react-native'
import {
  Bell as BellIcon,
  BellOff as BellOffIcon,
  CalendarClock as CalendarClockIcon,
  ChevronRight as ChevronRightIcon,
  MessagesSquare as MessagesSquareIcon,
} from 'lucide-react-native'
import moment from 'moment'
import FollowUpCard, {
  FollowUpTopic,
  useFollowUpCardColors,
  type FollowUpCardTone,
} from '@/components/FollowUpCard'
import Button from '@/components/ui/Button'
import EmphasizedText from '@/components/ui/EmphasizedText'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { dayPhrase, distancePhrase, whenPhrase } from '@/lib/dayPhrases'
import i18n from '@/lib/locales'
import { offsetToMinutes } from '@/lib/notificationOffset'
import { savedReminderOffsetMinutes } from '@/lib/reminderSchedule'
import {
  DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET,
  usePreferences,
} from '@/stores/preferences'
import type { Visit } from '@/types/visit'
import {
  reminderSentence,
  type FollowUpStatus,
} from '@/features/visits/lib/visitDetails'

type Props = {
  followUp: NonNullable<Visit['followUp']>
  status: FollowUpStatus
  /** The later Visit that kept it. */
  answer?: Visit
  now: number
  /**
   * Who's going, inside the card while it's still open. Gets the card's color,
   * for anything that has to match it (avatar rings).
   */
  renderBuddies?: (surface: string) => ReactNode
  onLogVisit: () => void
  onReschedule: () => void
  onOpenVisit: (visitId: string) => void
}

/**
 * The Follow-up as the rail's next stop: one sentence in the right tense
 * ("You're going back Saturday at 7:30 PM", "You planned to go back…", "You
 * went back…"), how far off it is, the topic, who's going, the reminder, and
 * what to do now. Quiet while it's days away; it turns teal on its day and
 * amber once missed.
 */
export default function VisitFollowUpStop({
  followUp,
  status,
  answer,
  now,
  renderBuddies,
  onLogVisit,
  onReschedule,
  onOpenVisit,
}: Props) {
  const theme = useTheme()
  const returnVisitNotificationOffset = usePreferences(
    (s) => s.returnVisitNotificationOffset
  )
  const date = new Date(followUp.date)
  const topic = followUp.topic?.trim()
  const open = status === 'upcoming' || status === 'overdue'
  const due =
    status === 'overdue' ||
    (status === 'upcoming' && moment(date).isSame(moment(now), 'day'))
  const muted = status === 'dismissed'
  // Outlined until a visit keeps it; going back fills it in.
  const tone: FollowUpCardTone =
    status === 'overdue'
      ? 'missed'
      : status === 'upcoming'
        ? 'planned'
        : status === 'kept'
          ? 'done'
          : 'quiet'
  const colors = useFollowUpCardColors(tone)
  const reminderMinutes =
    savedReminderOffsetMinutes(date, followUp) ??
    offsetToMinutes({
      ...DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET,
      ...returnVisitNotificationOffset,
    }) ??
    undefined

  const sentence: {
    key:
      | 'visitDetails_goingBack'
      | 'visitDetails_plannedBack'
      | 'visitDetails_dismissedPlan'
      | 'visitDetails_wentBackNotHome'
      | 'visitDetails_wentBack'
    when: string
  } =
    status === 'upcoming'
      ? { key: 'visitDetails_goingBack', when: whenPhrase(date, now) }
      : status === 'overdue'
        ? { key: 'visitDetails_plannedBack', when: whenPhrase(date, now) }
        : status === 'dismissed'
          ? { key: 'visitDetails_dismissedPlan', when: dayPhrase(date, now) }
          : {
              key: answer?.notAtHome
                ? 'visitDetails_wentBackNotHome'
                : 'visitDetails_wentBack',
              when: answer ? dayPhrase(new Date(answer.date), now) : '',
            }
  const pill =
    status === 'upcoming' || status === 'overdue'
      ? distancePhrase(date, now)
      : status === 'dismissed'
        ? i18n.t('visitDetails_dismissed')
        : undefined

  const headline = (
    <EmphasizedText
      translate={(values) => i18n.t(sentence.key, values)}
      values={{ when: sentence.when }}
      emphasis={{
        fontFamily: theme.fonts.bold,
        color:
          status === 'kept' && answer
            ? theme.colors.accent3
            : theme.colors.text,
      }}
      style={{
        fontSize: theme.fontSize(muted ? 'lg' : 'xl'),
        lineHeight: muted ? 22 : 26,
        color: muted ? theme.colors.textAlt : theme.colors.text,
        flexShrink: 1,
      }}
    />
  )

  const buttonStyle = {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: theme.numbers.borderRadiusSm,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
  }
  const labelStyle = {
    fontFamily: theme.fonts.semiBold,
    fontSize: theme.fontSize('sm'),
  }
  const secondary = (icon: AppIcon, label: string, onPress: () => void) => (
    <Button
      onPress={onPress}
      style={{
        ...buttonStyle,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.card,
      }}
    >
      <LucideIcon icon={icon} size={16} color={theme.colors.text} />
      <Text numberOfLines={1} style={labelStyle}>
        {label}
      </Text>
    </Button>
  )
  const canReschedule =
    open || status === 'dismissed' || (status === 'kept' && !!answer?.notAtHome)

  return (
    <FollowUpCard tone={tone} pill={pill}>
      {status === 'kept' && answer ? (
        <Button
          onPress={() => onOpenVisit(answer.id)}
          accessibilityRole='link'
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          {headline}
          <LucideIcon
            icon={ChevronRightIcon}
            size={16}
            color={theme.colors.accent3}
          />
        </Button>
      ) : (
        headline
      )}
      {status === 'kept' ? (
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
        >
          {i18n.t('visitDetails_plannedFor', { when: whenPhrase(date, now) })}
        </Text>
      ) : null}
      {topic ? <FollowUpTopic topic={topic} tone={tone} /> : null}
      {open ? renderBuddies?.(colors.surface) : null}
      {status === 'upcoming' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <LucideIcon
            icon={followUp.notifyMe ? BellIcon : BellOffIcon}
            size={13}
            color={followUp.notifyMe ? colors.detail : theme.colors.textAlt}
          />
          <Text
            style={{
              flex: 1,
              fontSize: theme.fontSize('sm'),
              color: followUp.notifyMe ? colors.detail : theme.colors.textAlt,
            }}
          >
            {reminderSentence(followUp, reminderMinutes)}
          </Text>
        </View>
      ) : null}
      {canReschedule ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {due ? (
            <Button
              onPress={onLogVisit}
              style={{ ...buttonStyle, backgroundColor: theme.colors.accent }}
            >
              <LucideIcon
                icon={MessagesSquareIcon}
                size={16}
                color={theme.colors.textInverse}
              />
              <Text
                numberOfLines={1}
                style={{ ...labelStyle, color: theme.colors.textInverse }}
              >
                {i18n.t('logVisitAction')}
              </Text>
            </Button>
          ) : null}
          {secondary(
            CalendarClockIcon,
            i18n.t(
              status === 'dismissed' ? 'visitDetails_planAgain' : 'reschedule'
            ),
            onReschedule
          )}
        </View>
      ) : null}
    </FollowUpCard>
  )
}
