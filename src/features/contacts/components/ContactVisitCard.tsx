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
import Button from '@/components/ui/Button'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import useLogNotAtHome from '@/hooks/useLogNotAtHome'
import { formatRelative, formatTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import { tracking } from '@/lib/tracking'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import { Contact } from '@/types/contact'
import {
  relativeDayLabel,
  visitDayLabel,
} from '@/features/contacts/lib/visitDates'
import { actionForeground } from '@/features/contacts/hooks/useContactHeroBackground'
import { UpNext } from '@/features/contacts/lib/visitTimeline'

const EDGE = 16
const CHIP_HEIGHT = 34

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

  const chip = (
    icon: AppIcon,
    label: string,
    onPress: () => void,
    testID: string
  ) => (
    <Button
      onPress={onPress}
      testID={testID}
      hitSlop={0}
      style={{
        minHeight: MIN_TOUCH_TARGET,
        marginVertical: (CHIP_HEIGHT - MIN_TOUCH_TARGET) / 2,
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          minHeight: CHIP_HEIGHT,
          paddingHorizontal: 12,
          borderRadius: CHIP_HEIGHT / 2,
          backgroundColor: theme.colors.backgroundLighter,
        }}
      >
        <LucideIcon icon={icon} size={15} color={theme.colors.text} />
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {label}
        </Text>
      </View>
    </Button>
  )

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
          <View
            style={{
              flexShrink: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {warn && (
              <LucideIcon icon={TriangleAlertIcon} size={13} color={tone} />
            )}
            <Text
              numberOfLines={largeText || !upcoming ? undefined : 1}
              style={{
                ...captionStyle,
                flexShrink: 1,
                color: tone,
                textTransform: 'uppercase',
                letterSpacing: tracking(0.5),
              }}
            >
              {caption}
            </Text>
          </View>
          {upcoming ? (
            chip(
              CalendarDaysIcon,
              i18n.t('editFollowUp_title'),
              onEdit,
              'contact-visit-edit-follow-up'
            )
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {chip(
                CalendarClockIcon,
                i18n.t('reschedule'),
                onEdit,
                'contact-visit-edit-follow-up'
              )}
              <Button
                onPress={onDismiss}
                testID='contact-visit-dismiss-follow-up'
                accessibilityLabel={i18n.t('dismissFollowUpAction')}
                hitSlop={0}
                style={{
                  width: MIN_TOUCH_TARGET,
                  minHeight: MIN_TOUCH_TARGET,
                  marginVertical: (CHIP_HEIGHT - MIN_TOUCH_TARGET) / 2,
                  marginEnd: (CHIP_HEIGHT - MIN_TOUCH_TARGET) / 2,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <View
                  style={{
                    width: CHIP_HEIGHT,
                    height: CHIP_HEIGHT,
                    borderRadius: CHIP_HEIGHT / 2,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.colors.backgroundLighter,
                  }}
                >
                  <LucideIcon
                    icon={XIcon}
                    size={15}
                    color={theme.colors.text}
                  />
                </View>
              </Button>
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
        {chip(
          CalendarPlusIcon,
          i18n.t('contactDetails.planFollowUp'),
          onPlan,
          'contact-visit-plan-follow-up'
        )}
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
