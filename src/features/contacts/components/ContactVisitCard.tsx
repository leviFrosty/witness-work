import {
  Bell as BellIcon,
  CalendarClock as CalendarClockIcon,
  CalendarPlus as CalendarPlusIcon,
  Check as CheckIcon,
  DoorClosed as DoorClosedIcon,
  CalendarDays as CalendarDaysIcon,
  Plus as PlusIcon,
  TriangleAlert as TriangleAlertIcon,
  X as XIcon,
} from 'lucide-react-native'
import moment from 'moment'
import { View } from 'react-native'
import {
  ActionChip,
  ActionChipIcon,
  CHIP_HEIGHT,
} from '@/components/ui/ActionChip'
import Button from '@/components/ui/Button'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import StatusCaption from '@/components/ui/StatusCaption'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import useLogNotAtHome from '@/hooks/useLogNotAtHome'
import { formatRelative, formatTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import { Contact } from '@/types/contact'
import { relativeDayLabel, visitDayLabel } from '@/lib/visitDates'
import { actionForeground } from '@/hooks/useContactActionColor'
import { UpNext } from '@/features/contacts/lib/visitTimeline'

const EDGE = 16

export type ContactVisitPlan = UpNext & {
  status: 'upcoming' | 'missed' | 'attempted'

  triedAt?: Date
}

type Props = {
  contact: Pick<Contact, 'id' | 'name'>

  plan: ContactVisitPlan | null

  actionColor: string

  overlap: number

  lastNote?: string

  onOpenLast: () => void

  onLastNoteLayout?: (height: number) => void

  onEdit: () => void

  onDismiss: () => void

  onLogVisit: () => void

  onPlan?: () => void
}

const ContactVisitCard = ({
  contact,
  plan,
  actionColor,
  overlap,
  lastNote,
  onOpenLast,
  onLastNoteLayout,
  onEdit,
  onDismiss,
  onLogVisit,
  onPlan,
}: Props) => {
  const theme = useTheme()
  const dataProtectionMode = usePreferences((s) => s.dataProtectionMode)
  const notAtHome = useLogNotAtHome()
  const triedToday = useConversations((s) =>
    s.conversations.some(
      (visit) =>
        visit.contact.id === contact.id &&
        !!visit.notAtHome &&
        moment(visit.date).isSame(moment(), 'day')
    )
  )

  const largeText = useAccessibilityTextSize()
  const wrap = largeText ? 'wrap' : 'nowrap'
  const onAction = actionForeground(actionColor)
  const captionStyle = {
    fontSize: theme.fontSize('xs') + 1,
    fontFamily: theme.fonts.semiBold,
    color: theme.colors.textAlt,
  }
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

  const upcoming = plan?.status === 'upcoming'
  const header = (() => {
    if (plan) {
      const missed = !upcoming
      const warn = plan.status === 'missed'
      const tone = warn ? theme.colors.warnText : theme.colors.textAlt
      const dayIsRelative =
        relativeDayLabel(plan.date) !== visitDayLabel(plan.date)
      const caption = missed
        ? i18n.t('contactDetails.missed', {
            countdown: formatRelative(plan.date),
          })
        : dayIsRelative
          ? i18n.t('contactDetails.upNextSoon')
          : i18n.t('contactDetails.upNext', {
              countdown: formatRelative(plan.date),
            })
      return (
        <>
          <StatusCaption
            text={caption}
            icon={warn ? TriangleAlertIcon : undefined}
            color={tone}
            numberOfLines={largeText || !upcoming ? undefined : 1}
          />
          {upcoming ? (
            <ActionChip
              icon={CalendarDaysIcon}
              label={i18n.t('editFollowUp_title')}
              onPress={onEdit}
              testID='contact-visit-edit-follow-up'
            />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ActionChip
                icon={CalendarClockIcon}
                label={i18n.t('reschedule')}
                onPress={onEdit}
                testID='contact-visit-edit-follow-up'
              />
              <ActionChipIcon
                icon={XIcon}
                accessibilityLabel={i18n.t('dismissFollowUpAction')}
                onPress={onDismiss}
                testID='contact-visit-dismiss-follow-up'
              />
            </View>
          )}
        </>
      )
    }
    if (!onPlan)
      return (
        <Text style={{ flexShrink: 1, color: theme.colors.textAlt }}>
          {i18n.t('contactDetails.firstVisitHint')}
        </Text>
      )
    return (
      <>
        <Text style={{ flexShrink: 1, color: theme.colors.textAlt }}>
          {i18n.t('contactDetails.noFollowUp')}
        </Text>
        <ActionChip
          icon={CalendarPlusIcon}
          label={i18n.t('contactDetails.planFollowUp')}
          onPress={onPlan}
          testID='contact-visit-plan-follow-up'
        />
      </>
    )
  })()

  return (
    <View
      style={{
        marginTop: -overlap,
        backgroundColor: theme.colors.card,
        borderRadius: theme.numbers.borderRadiusLg,
        paddingTop: EDGE,
        paddingBottom: EDGE,
        shadowColor: '#000',
        shadowOpacity: 0.14,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      }}
    >
      {header && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: wrap,
            columnGap: 10,
            rowGap: 6,
            minHeight: CHIP_HEIGHT,
            paddingStart: EDGE + 2,
            paddingEnd: EDGE,
          }}
        >
          {header}
        </View>
      )}
      {(plan || lastNote) && (
        <View
          style={{
            paddingTop: plan ? 8 : 4,
            paddingHorizontal: EDGE + 2,
            gap: 6,
          }}
        >
          {plan && (
            <Text
              accessibilityRole='header'
              style={
                upcoming
                  ? {
                      fontSize: theme.fontSize('xl'),
                      fontFamily: theme.fonts.bold,
                    }
                  : {
                      fontSize: theme.fontSize('lg'),
                      fontFamily: theme.fonts.semiBold,
                    }
              }
            >
              {upcoming
                ? i18n.t('contactDetails.upNextWhen', {
                    day: relativeDayLabel(plan.date),
                    time: formatTime(plan.date),
                  })
                : i18n.t('contactDetails.plannedFor', {
                    day: visitDayLabel(plan.date),
                    time: formatTime(plan.date),
                  })}
            </Text>
          )}
          {plan?.topic && (
            <Text
              numberOfLines={2}
              style={{ fontSize: theme.fontSize('sm') + 1, lineHeight: 19 }}
            >
              {plan.topic}
            </Text>
          )}
          {upcoming && plan?.notifyMe && (
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <LucideIcon
                icon={BellIcon}
                size={12}
                color={theme.colors.textAlt}
              />
              <Text style={{ ...captionStyle, flexShrink: 1 }}>
                {i18n.t('contactDetails.reminderOn')}
              </Text>
            </View>
          )}
          {plan?.status === 'attempted' && plan.triedAt && (
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <LucideIcon
                icon={DoorClosedIcon}
                size={12}
                color={theme.colors.textAlt}
              />
              <Text style={{ ...captionStyle, flexShrink: 1 }}>
                {i18n.t('contactDetails.attempted', {
                  when: formatRelative(plan.triedAt),
                })}
              </Text>
            </View>
          )}
          {lastNote && (
            <Button
              onPress={onOpenLast}
              testID='contact-visit-last-conversation'
              onLayout={(e) => onLastNoteLayout?.(e.nativeEvent.layout.height)}
              hitSlop={0}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                minHeight: MIN_TOUCH_TARGET,
                marginVertical: -3,
              }}
            >
              <Text
                numberOfLines={largeText ? 4 : 2}
                style={{
                  flex: 1,
                  fontSize: theme.fontSize('sm') + 1,
                  lineHeight: 19,
                }}
              >
                <Text
                  style={{
                    fontSize: theme.fontSize('sm') + 1,
                    fontFamily: theme.fonts.semiBold,
                    color: theme.colors.textAlt,
                  }}
                >
                  {i18n.t('contactDetails.lastConversation')}
                </Text>
                {` ${lastNote}`}
              </Text>
              <LucideIcon
                icon={ChevronForwardIcon}
                size={16}
                color={theme.colors.textAlt}
              />
            </Button>
          )}
        </View>
      )}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: wrap,
          gap: 12,
          paddingTop: header || lastNote ? 14 : 0,
          paddingHorizontal: EDGE,
        }}
      >
        <Button
          onPress={onLogVisit}
          testID='contact-visit-log'
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
            onPress={() =>
              notAtHome.logWithUndo(contact, { source: 'contact_details' })
            }
            testID='contact-visit-not-at-home'
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
    </View>
  )
}

export default ContactVisitCard
