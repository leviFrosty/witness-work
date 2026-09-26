import {
  Bell as BellIcon,
  BellOff as BellOffIcon,
  BookOpen as BookOpenIcon,
  Check as CheckIcon,
  ChevronRight as ChevronRightIcon,
  Clock as ClockIcon,
  DoorClosed as DoorClosedIcon,
  MessageCircle as MessageCircleIcon,
  TriangleAlert as TriangleAlertIcon,
} from 'lucide-react-native'
import moment from 'moment'
import { Fragment, RefObject } from 'react'
import { Pressable, View } from 'react-native'
import { AppIcon } from '@/components/ui/LucideIcon'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { withAlpha } from '@/lib/color'
import { formatDate, formatMonthDayCompact } from '@/lib/dates'
import i18n from '@/lib/locales'
import { Visit } from '@/types/visit'
import VisitTimelineCard from '@/features/contacts/components/VisitTimelineCard'
import { visitDayLabel } from '@/features/contacts/lib/visitDates'
import {
  FollowUpState,
  followUpState,
  gapBetween,
  UpNext,
  visitOutcome,
} from '@/features/contacts/lib/visitTimeline'

/** Width of the rail column left of the cards; the line runs at its center. */
const RAIL = 26
const NODE = 24

const OUTCOME_ICON = {
  study: BookOpenIcon,
  conversation: MessageCircleIcon,
  notAtHome: DoorClosedIcon,
} as const

const FOLLOW_UP: Record<
  FollowUpState,
  {
    icon: AppIcon
    label:
      | 'followUpUpcoming'
      | 'followUpKept'
      | 'followUpMissed'
      | 'followUpDismissed'
  }
> = {
  upcoming: { icon: ClockIcon, label: 'followUpUpcoming' },
  kept: { icon: CheckIcon, label: 'followUpKept' },
  missed: { icon: TriangleAlertIcon, label: 'followUpMissed' },
  dismissed: { icon: BellOffIcon, label: 'followUpDismissed' },
}

/**
 * Outcome node: filled for a study, outlined for a talk, dashed when no one
 * answered.
 */
const VisitNode = ({ visit }: { visit: Visit }) => {
  const theme = useTheme()
  const outcome = visitOutcome(visit)
  const style = {
    study: {
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent,
      borderStyle: 'solid' as const,
      color: theme.colors.card,
    },
    conversation: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.accent3,
      borderStyle: 'solid' as const,
      color: theme.colors.accent3,
    },
    notAtHome: {
      backgroundColor: theme.colors.backgroundLighter,
      borderColor: theme.colors.textAlt,
      borderStyle: 'dashed' as const,
      color: theme.colors.textAlt,
    },
  }[outcome]
  return (
    <View
      style={{
        width: NODE,
        height: NODE,
        borderRadius: NODE / 2,
        borderWidth: 1.5,
        borderColor: style.borderColor,
        borderStyle: style.borderStyle,
        backgroundColor: style.backgroundColor,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <LucideIcon icon={OUTCOME_ICON[outcome]} size={11} color={style.color} />
    </View>
  )
}

const FollowUpNode = ({ state }: { state: FollowUpState }) => {
  const theme = useTheme()
  const filled =
    state === 'missed'
      ? theme.colors.warn
      : state === 'dismissed'
        ? null
        : theme.colors.accent
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: filled ?? theme.colors.card,
        borderWidth: filled ? 3 : 1.5,
        borderStyle: filled ? 'solid' : 'dashed',
        borderColor: filled ? withAlpha(filled, 0x40) : theme.colors.textAlt,
      }}
    >
      <LucideIcon
        icon={FOLLOW_UP[state].icon}
        size={10}
        color={filled ? theme.colors.card : theme.colors.textAlt}
      />
    </View>
  )
}

/**
 * The space between two cards: elapsed time, plus the follow-up the OLDER visit
 * scheduled (kept / missed / dismissed / still upcoming).
 */
const RailConnector = ({
  visit,
  newer,
  state,
}: {
  visit: Visit
  newer?: Visit
  state: FollowUpState | null
}) => {
  const theme = useTheme()
  const gap = newer
    ? gapBetween(new Date(newer.date), new Date(visit.date))
    : undefined
  const followUp = visit.followUp
  const labelColor =
    state === 'missed'
      ? theme.colors.warn
      : state === 'dismissed'
        ? theme.colors.textAlt
        : theme.colors.accent3
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 9, minHeight: 30 }}>
      <View style={{ width: RAIL, alignItems: 'center' }}>
        {state && <FollowUpNode state={state} />}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 5, paddingLeft: 6 }}>
        {newer && (
          <View
            style={{
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingVertical: 3,
              paddingHorizontal: 10,
              borderRadius: 11,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.background,
            }}
          >
            <LucideIcon
              icon={ClockIcon}
              size={10}
              color={theme.colors.textAlt}
            />
            <Text
              style={{
                fontSize: theme.fontSize('xs') + 1,
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.textAlt,
              }}
            >
              {gap
                ? i18n.t('contactDetails.gapEarlier', { gap })
                : i18n.t('contactDetails.sameDay')}
            </Text>
          </View>
        )}
        {state && followUp && (
          <Text style={{ fontSize: theme.fontSize('sm'), lineHeight: 16 }}>
            <Text style={{ fontFamily: theme.fonts.bold, color: labelColor }}>
              {i18n.t(`contactDetails.${FOLLOW_UP[state].label}`)}
            </Text>
            {followUp.topic?.trim() ? ` · ${followUp.topic.trim()}` : ''}
            <Text style={{ color: theme.colors.textAlt }}>
              {` (${
                state === 'upcoming'
                  ? visitDayLabel(followUp.date)
                  : formatMonthDayCompact(moment(followUp.date))
              })`}
            </Text>
            {state !== 'dismissed' && (
              <Text style={{ color: theme.colors.textAlt }}>
                {'  '}
                <LucideIcon
                  icon={followUp.notifyMe ? BellIcon : BellOffIcon}
                  size={10}
                  color={theme.colors.textAlt}
                />
              </Text>
            )}
          </Text>
        )}
      </View>
    </View>
  )
}

type Props = {
  /** Newest first. */
  visits: Visit[]
  upNext: UpNext | null
  highlightedVisitId?: string
  highlightedRef: RefObject<View | null>
  onPressUpNext: () => void
}

/**
 * The visit history on a single rail. The soonest upcoming follow-up sits at
 * the head; every other follow-up lives in the connector above the visit that
 * scheduled it.
 */
const VisitTimeline = ({
  visits,
  upNext,
  highlightedVisitId,
  highlightedRef,
  onPressUpNext,
}: Props) => {
  const theme = useTheme()
  const now = new Date()
  const oldest = visits[visits.length - 1]

  return (
    <View>
      <View
        style={{
          position: 'absolute',
          left: RAIL / 2 - 1,
          top: 12,
          bottom: 30,
          width: 2,
          backgroundColor: theme.colors.border,
        }}
      />
      {upNext && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingBottom: 12,
          }}
        >
          <View style={{ width: RAIL, alignItems: 'center' }}>
            <View
              style={{
                width: NODE,
                height: NODE,
                borderRadius: NODE / 2,
                backgroundColor: theme.colors.accent,
                borderWidth: 4,
                borderColor: theme.colors.accentTranslucent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <LucideIcon
                icon={ClockIcon}
                size={11}
                color={theme.colors.card}
              />
            </View>
          </View>
          <Pressable
            onPress={onPressUpNext}
            accessibilityRole='button'
            style={({ pressed }) => ({
              marginLeft: 6,
              flexShrink: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingVertical: 6,
              paddingHorizontal: 11,
              borderRadius: theme.numbers.borderRadiusSm,
              borderWidth: 1,
              borderColor: withAlpha(theme.colors.accent, 0x55),
              backgroundColor: withAlpha(theme.colors.accent, 0x1a),
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text
              numberOfLines={1}
              style={{
                flexShrink: 1,
                fontSize: theme.fontSize('sm') + 0.5,
                color: theme.colors.accent3,
              }}
            >
              <Text
                style={{
                  fontFamily: theme.fonts.bold,
                  color: theme.colors.accent3,
                }}
              >
                {i18n.t('contactDetails.nextVisit', {
                  date: visitDayLabel(upNext.date),
                })}
              </Text>
              {` · ${i18n.t('contactDetails.seeUpNext')}`}
            </Text>
            <LucideIcon
              icon={ChevronRightIcon}
              size={11}
              color={theme.colors.accent3}
            />
          </Pressable>
        </View>
      )}
      {visits.map((visit, index) => {
        const raw = followUpState(visit, visits, now)
        // The Up Next source is already shown at the rail head.
        const state =
          raw === 'upcoming' && upNext?.visit.id === visit.id ? null : raw
        const newer = index > 0 ? visits[index - 1] : undefined
        const highlighted = visit.id === highlightedVisitId
        return (
          <Fragment key={visit.id}>
            {(newer || state) && (
              <RailConnector visit={visit} newer={newer} state={state} />
            )}
            <View
              ref={highlighted ? highlightedRef : undefined}
              style={{ flexDirection: 'row' }}
            >
              <View
                style={{ width: RAIL, alignItems: 'center', paddingTop: 13 }}
              >
                <VisitNode visit={visit} />
              </View>
              <View style={{ flex: 1, minWidth: 0, paddingLeft: 6 }}>
                <VisitTimelineCard visit={visit} highlighted={highlighted} />
              </View>
            </View>
          </Fragment>
        )
      })}
      {oldest && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 14,
            gap: 9,
            paddingLeft: RAIL / 2 - 4.5,
          }}
        >
          <View
            style={{
              width: 9,
              height: 9,
              borderRadius: 2,
              transform: [{ rotate: '45deg' }],
              backgroundColor: theme.colors.textAlt,
            }}
          />
          <Text
            style={{
              fontSize: theme.fontSize('xs') + 1,
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('contactDetails.relationshipBegan', {
              date: formatDate(oldest.date, { style: 'medium' }),
            })}
          </Text>
        </View>
      )}
    </View>
  )
}

export default VisitTimeline
