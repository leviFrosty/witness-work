import {
  Bell as BellIcon,
  BellOff as BellOffIcon,
  Check as CheckIcon,
  Clock as ClockIcon,
  TriangleAlert as TriangleAlertIcon,
} from 'lucide-react-native'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import moment from 'moment'
import { Fragment, RefObject } from 'react'
import { Pressable, View } from 'react-native'
import { AppIcon } from '@/components/ui/LucideIcon'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PointerHover from '@/components/ui/PointerHover'
import TimelinePill from '@/components/ui/TimelinePill'
import useTheme from '@/contexts/theme'
import { withAlpha } from '@/lib/color'
import { formatDate, formatMonthDayCompact } from '@/lib/dates'
import i18n from '@/lib/locales'
import { Visit } from '@/types/visit'
import VisitOutcomeMarker from '@/features/contacts/components/VisitOutcomeMarker'
import VisitTimelineCard from '@/features/contacts/components/VisitTimelineCard'
import useProgressiveCount from '@/features/contacts/hooks/useProgressiveCount'
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
/** Cards drawn with the screen; older ones follow a batch per frame. */
const FIRST_CARDS = 8
const CARD_BATCH = 8

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
          <TimelinePill
            icon={ClockIcon}
            label={
              gap
                ? i18n.t('contactDetails.gapEarlier', { gap })
                : i18n.t('contactDetails.sameDay')
            }
          />
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
  // A long history (a weekly study runs to hundreds of visits) draws its
  // newest cards with the screen and the older ones a batch per frame after.
  // The highlighted visit is drawn at once, so a deep link can scroll to it.
  const shown = useProgressiveCount(visits.length, {
    first: FIRST_CARDS,
    batch: CARD_BATCH,
    atLeast: visits.findIndex((visit) => visit.id === highlightedVisitId) + 1,
  })

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
          <PointerHover effect='highlight'>
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
                icon={ChevronForwardIcon}
                size={11}
                color={theme.colors.accent3}
              />
            </Pressable>
          </PointerHover>
        </View>
      )}
      {visits.slice(0, shown).map((visit, index) => {
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
                <VisitOutcomeMarker
                  outcome={visitOutcome(visit)}
                  size={NODE}
                  withIcon
                />
              </View>
              <View style={{ flex: 1, minWidth: 0, paddingLeft: 6 }}>
                <VisitTimelineCard visit={visit} highlighted={highlighted} />
              </View>
            </View>
          </Fragment>
        )
      })}
      {oldest && shown >= visits.length && (
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
