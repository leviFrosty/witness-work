import type { ReactNode } from 'react'
import { View } from 'react-native'
import {
  Bell as BellIcon,
  BellOff as BellOffIcon,
  CalendarClock as CalendarClockIcon,
  CalendarDays as CalendarDaysIcon,
  CalendarPlus as CalendarPlusIcon,
  Check as CheckIcon,
  DoorClosed as DoorClosedIcon,
  Plus as PlusIcon,
  TriangleAlert as TriangleAlertIcon,
  X as XIcon,
} from 'lucide-react-native'
import moment from 'moment'
import {
  ActionChip,
  ActionChipIcon,
  CHIP_HEIGHT,
} from '@/components/ui/ActionChip'
import Button from '@/components/ui/Button'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import StatusCaption from '@/components/ui/StatusCaption'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import { actionForeground } from '@/hooks/useContactActionColor'
import { formatRelative, formatTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import { offsetToMinutes } from '@/lib/notificationOffset'
import { savedReminderOffsetMinutes } from '@/lib/reminderSchedule'
import { relativeDayLabel, visitDayLabel } from '@/lib/visitDates'
import useConversations from '@/stores/conversationStore'
import {
  DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET,
  usePreferences,
} from '@/stores/preferences'
import type { Visit } from '@/types/visit'
import DetailsCard, {
  DETAILS_CARD_EDGE as EDGE,
} from '@/features/visits/components/DetailsCard'
import {
  detailsDateTime,
  outcomeLabel,
  reminderSentence,
  type FollowUpStatus,
} from '@/features/visits/lib/visitDetails'

type Props = {
  visit: Visit
  contactId: string
  status: FollowUpStatus | null

  answer?: Visit

  later?: Visit
  now: number

  actionColor: string
  renderBuddies?: (surface: string) => ReactNode
  onEdit: () => void
  onReschedule: () => void
  onDismiss: () => void
  onLogVisit: () => void
  onNotAtHome: () => void
  onOpenVisit: (visitId: string) => void
}

export default function VisitFollowUpCard({
  visit,
  contactId,
  status,
  answer,
  later,
  now,
  actionColor,
  renderBuddies,
  onEdit,
  onReschedule,
  onDismiss,
  onLogVisit,
  onNotAtHome,
  onOpenVisit,
}: Props) {
  const theme = useTheme()
  const largeText = useAccessibilityTextSize()
  const dataProtectionMode = usePreferences((s) => s.dataProtectionMode)
  const returnVisitNotificationOffset = usePreferences(
    (s) => s.returnVisitNotificationOffset
  )
  const triedToday = useConversations((s) =>
    s.conversations.some(
      (other) =>
        other.contact.id === contactId &&
        !!other.notAtHome &&
        moment(other.date).isSame(moment(now), 'day')
    )
  )
  const wrap = largeText ? 'wrap' : 'nowrap'
  const followUp = visit.followUp
  const textStyle = { fontSize: theme.fontSize('sm') + 1, lineHeight: 19 }
  const titleStyle = {
    fontSize: theme.fontSize('lg'),
    fontFamily: theme.fonts.semiBold,
  }

  const headerRow = (children: ReactNode, compact = false) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: wrap,
        columnGap: 10,
        rowGap: 6,
        minHeight: compact ? undefined : CHIP_HEIGHT,
        paddingStart: EDGE + 2,
        paddingEnd: EDGE,
      }}
    >
      {children}
    </View>
  )
  const body = (children: ReactNode) => (
    <View style={{ paddingTop: 8, paddingHorizontal: EDGE + 2, gap: 6 }}>
      {children}
    </View>
  )
  const detailLine = (icon: AppIcon, text: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <LucideIcon icon={icon} size={12} color={theme.colors.textAlt} />
      <Text
        style={{
          flexShrink: 1,
          fontSize: theme.fontSize('xs') + 1,
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textAlt,
        }}
      >
        {text}
      </Text>
    </View>
  )
  const linkRow = (target: Visit, trailing?: string) => (
    <Button
      onPress={() => onOpenVisit(target.id)}
      testID='visit-details-open-linked-visit'
      accessibilityRole='link'
      accessibilityLabel={[detailsDateTime(new Date(target.date)), trailing]
        .filter(Boolean)
        .join(', ')}
      accessibilityHint={i18n.t('visitDetails_openVisitHint')}
      hitSlop={0}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        minHeight: MIN_TOUCH_TARGET,
        marginVertical: -6,
      }}
    >
      <Text style={{ ...titleStyle, flex: 1 }}>
        {detailsDateTime(new Date(target.date))}
      </Text>
      {trailing ? (
        <Text
          style={{
            fontSize: theme.fontSize('sm') + 0.5,
            color: theme.colors.textAlt,
          }}
        >
          {trailing}
        </Text>
      ) : null}
      <LucideIcon
        icon={ChevronForwardIcon}
        size={16}
        color={theme.colors.textAlt}
      />
    </Button>
  )

  if (!followUp || !status) {
    if (later)
      return (
        <DetailsCard testID='visit-details-follow-up'>
          {headerRow(
            <StatusCaption text={i18n.t('visitDetails_wentBackLabel')} />,
            true
          )}
          {body(linkRow(later, outcomeLabel(later)))}
        </DetailsCard>
      )
    return (
      <DetailsCard testID='visit-details-follow-up'>
        {headerRow(
          <>
            <Text style={{ flexShrink: 1, color: theme.colors.textAlt }}>
              {i18n.t('contactDetails.noFollowUp')}
            </Text>
            <ActionChip
              icon={CalendarPlusIcon}
              label={i18n.t('contactDetails.planFollowUp')}
              onPress={onEdit}
              testID='visit-details-plan-follow-up'
            />
          </>
        )}
      </DetailsCard>
    )
  }

  const date = new Date(followUp.date)
  const topic = followUp.topic?.trim()
  const pending = status === 'upcoming' || status === 'overdue'
  const triedAnswer = status === 'kept' && !!answer?.notAtHome
  const open = pending || triedAnswer
  const plannedFor = i18n.t('contactDetails.plannedFor', {
    day: visitDayLabel(date),
    time: formatTime(date),
  })
  const reminderMinutes =
    savedReminderOffsetMinutes(date, followUp) ??
    offsetToMinutes({
      ...DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET,
      ...returnVisitNotificationOffset,
    }) ??
    undefined

  const missedHeader = (warn: boolean) => (
    <>
      <StatusCaption
        icon={warn ? TriangleAlertIcon : undefined}
        color={warn ? theme.colors.warnText : undefined}
        numberOfLines={largeText ? undefined : 1}
        text={i18n.t('visitDetails_missed')}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <ActionChip
          icon={CalendarClockIcon}
          label={i18n.t('reschedule')}
          onPress={onEdit}
          testID='visit-details-edit-follow-up'
        />
        <ActionChipIcon
          icon={XIcon}
          accessibilityLabel={i18n.t('dismissFollowUpAction')}
          onPress={onDismiss}
          testID='visit-details-dismiss-follow-up'
        />
      </View>
    </>
  )

  const header = (() => {
    switch (status) {
      case 'upcoming': {
        const dayIsRelative = relativeDayLabel(date) !== visitDayLabel(date)
        return (
          <>
            <StatusCaption
              numberOfLines={largeText ? undefined : 1}
              text={
                dayIsRelative
                  ? i18n.t('contactDetails.upNextSoon')
                  : i18n.t('contactDetails.upNext', {
                      countdown: formatRelative(date),
                    })
              }
            />
            <ActionChip
              icon={CalendarDaysIcon}
              label={i18n.t('editFollowUp_title')}
              onPress={onEdit}
              testID='visit-details-edit-follow-up'
            />
          </>
        )
      }
      case 'overdue':
        return missedHeader(true)
      case 'kept':
        return triedAnswer ? (
          missedHeader(false)
        ) : (
          <StatusCaption
            icon={CheckIcon}
            text={i18n.t('visitDetails_wentBackLabel')}
          />
        )
      case 'dismissed':
        return (
          <>
            <StatusCaption
              icon={BellOffIcon}
              text={i18n.t('contactDetails.followUpDismissed')}
            />
            <ActionChip
              icon={CalendarPlusIcon}
              label={i18n.t('visitDetails_planAgain')}
              onPress={onReschedule}
              testID='visit-details-plan-again'
            />
          </>
        )
    }
  })()

  const title = (() => {
    if (status === 'upcoming')
      return (
        <Text
          accessibilityRole='header'
          style={{
            fontSize: theme.fontSize('xl'),
            fontFamily: theme.fonts.bold,
          }}
        >
          {i18n.t('contactDetails.upNextWhen', {
            day: relativeDayLabel(date),
            time: formatTime(date),
          })}
        </Text>
      )
    if (status === 'kept' && answer && !answer.notAtHome)
      return (
        <>
          {linkRow(answer)}
          <Text style={{ ...textStyle, color: theme.colors.textAlt }}>
            {plannedFor}
          </Text>
        </>
      )
    return (
      <Text
        accessibilityRole='header'
        style={{
          ...titleStyle,
          color:
            status === 'dismissed' ? theme.colors.textAlt : theme.colors.text,
        }}
      >
        {plannedFor}
      </Text>
    )
  })()

  const onAction = actionForeground(actionColor)
  const buttonStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 14,
    borderRadius: MIN_TOUCH_TARGET / 2,
    backgroundColor: theme.colors.backgroundLighter,
  }

  return (
    <DetailsCard testID='visit-details-follow-up'>
      {headerRow(header, status === 'kept' && !triedAnswer)}
      {body(
        <>
          {title}
          {topic ? <Text style={textStyle}>{topic}</Text> : null}
          {pending ? renderBuddies?.(theme.colors.card) : null}
          {triedAnswer &&
            answer &&
            detailLine(
              DoorClosedIcon,
              i18n.t('contactDetails.attempted', {
                when: formatRelative(answer.date),
              })
            )}
          {status === 'upcoming' &&
            followUp.notifyMe &&
            detailLine(BellIcon, reminderSentence(followUp, reminderMinutes))}
        </>
      )}
      {open ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: wrap,
            gap: 12,
            paddingTop: 14,
            paddingHorizontal: EDGE,
          }}
        >
          <Button
            onPress={onLogVisit}
            testID='visit-details-log-visit'
            style={{
              ...buttonStyle,
              ...(largeText ? { flexBasis: '100%' } : { flex: 1 }),
              backgroundColor: actionColor,
            }}
          >
            <LucideIcon icon={PlusIcon} size={16} color={onAction} />
            <Text
              style={{
                flexShrink: 1,
                fontFamily: theme.fonts.semiBold,
                color: onAction,
              }}
            >
              {i18n.t('logVisitAction')}
            </Text>
          </Button>
          {!dataProtectionMode && (
            <Button
              disabled={triedToday}
              onPress={onNotAtHome}
              testID='visit-details-not-at-home'
              style={{
                ...buttonStyle,
                ...(largeText ? { flex: 1 } : null),
              }}
            >
              <LucideIcon
                icon={triedToday ? CheckIcon : DoorClosedIcon}
                size={16}
                color={triedToday ? theme.colors.textAlt : theme.colors.text}
              />
              <Text
                style={{
                  flexShrink: 1,
                  fontFamily: theme.fonts.semiBold,
                  color: triedToday ? theme.colors.textAlt : theme.colors.text,
                }}
              >
                {i18n.t('notAtHome')}
              </Text>
            </Button>
          )}
        </View>
      ) : null}
    </DetailsCard>
  )
}
