import {
  Calendar1 as Calendar1Icon,
  Repeat as RepeatIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { ReactNode } from 'react'
import { View } from 'react-native'
import { Swipeable } from 'react-native-gesture-handler'
import { useNavigation } from '@react-navigation/native'
import moment from 'moment'
import Text from '@/components/ui/MyText'
import useCategories from '@/stores/categories'
import i18n, { TranslationKey } from '@/lib/locales'
import useTheme from '@/contexts/theme'
import Haptics from '@/lib/haptics'
import SwipeableDelete from '@/components/ui/swipeableActions/Delete'
import ContextMenu, {
  type ContextMenuEntries,
} from '@/components/ui/ContextMenu'
import confirmDeletePlan, {
  confirmDeletePlanScope,
  deletePlan,
  RECURRING_DELETE_SCOPES,
  recurringDeleteScopeLabel,
  type RecurringDeleteScope,
} from '@/lib/confirmDeletePlan'
import { DayPlan } from '@/types/timeEntry'
import type { RootStackNavigation } from '@/types/rootStack'
import { useFormattedMinutes } from '@/lib/minutes'
import Badge from '@/components/ui/Badge'
import PlanLocationLink, {
  planLocationText,
} from '@/components/PlanLocationLink'
import RichNoteText from '@/components/RichNoteText'
import { useLinkActions } from '@/components/RichLinkCard'
import { findLinks, getHostname } from '@/lib/linkPreview'
import { appleMapsUrl } from '@/lib/placeSearch'
import { openURL } from '@/lib/links'
import usePublisher from '@/hooks/usePublisher'
import {
  formatDate,
  formatStartTime,
  formatWeekdayDayCompact,
  formatWeekdayMonthDayCompact,
} from '@/lib/dates'
import { useCardStyle } from '@/components/ui/Card'
import {
  DEFAULT_START_TIME_IN_MINUTES,
  getStartTimeInMinutes,
} from '@/lib/normalizeDate'
import {
  getEffectiveMinutesForRecurringPlan,
  getEffectiveNoteForRecurringPlan,
  getEffectiveStartTimeInMinutesForRecurringPlan,
  RecurringPlan,
} from '@/lib/recurrence'

export type PlanListItem =
  | {
      type: 'day'
      date: Date
      plan: DayPlan
    }
  | {
      type: 'recurring'
      date: Date
      plan: RecurringPlan
    }

export const getPlanItemStartTime = (item: PlanListItem): number => {
  if (item.type === 'day') {
    return getStartTimeInMinutes(item.plan)
  }

  return getEffectiveStartTimeInMinutesForRecurringPlan(item.plan, item.date)
}

const PlanKindIcon = (props: {
  recurring: boolean
  countingStatus: 'counted' | 'notCounted'
}) => {
  const theme = useTheme()
  const emphasizedOneTime =
    !props.recurring && props.countingStatus === 'counted'

  return (
    <View
      style={{
        width: 38,
        height: 38,
        borderRadius: theme.numbers.borderRadiusMd,
        borderWidth: 1,
        borderColor: emphasizedOneTime
          ? theme.colors.accent
          : theme.colors.border,
        backgroundColor: emphasizedOneTime
          ? theme.colors.accentTranslucent
          : theme.colors.backgroundLighter,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <LucideIcon
        icon={props.recurring ? RepeatIcon : Calendar1Icon}
        size={15}
        color={emphasizedOneTime ? theme.colors.accent : theme.colors.textAlt}
      />
    </View>
  )
}

/** Notes longer than this are clipped in the row and shown whole in the preview. */
const NOTE_PREVIEW_LINES = 3
const isLongNote = (note: string) =>
  note.length > 140 || note.split('\n').length > NOTE_PREVIEW_LINES

/**
 * The long-press preview for a row whose note is clipped: the plan's details
 * with its whole note and links.
 */
const PlanPreview = (props: {
  heading: string
  title?: string
  note: string
  location?: DayPlan['location']
}) => {
  const theme = useTheme()
  return (
    <View
      style={{
        width: 300,
        padding: 16,
        gap: 8,
        borderRadius: theme.numbers.borderRadiusLg,
        backgroundColor: theme.colors.card,
      }}
    >
      <Text style={{ fontFamily: theme.fonts.semiBold }}>{props.heading}</Text>
      {props.title ? (
        <Text style={{ fontFamily: theme.fonts.semiBold }}>{props.title}</Text>
      ) : null}
      {props.location ? (
        <PlanLocationLink location={props.location} interactive={false} />
      ) : null}
      <RichNoteText
        text={props.note}
        interactive={false}
        style={{
          color: theme.colors.textAlt,
          fontSize: theme.fontSize('sm'),
          lineHeight: theme.fontSize('sm') * 1.4,
        }}
      />
    </View>
  )
}

const PlanRow = (props: {
  item: PlanListItem
  onPress?: () => void
  dateDisplay?: 'full' | 'monthList'
  contextMonth?: number
  contextYear?: number
  countingStatus?: 'counted' | 'notCounted'
  /** Extra lines under the details, e.g. who the Plan is with. */
  footer?: ReactNode
  /**
   * Runs a navigation from the row's menu. Hosts that present the row in a
   * modal sheet pass one that closes the sheet first.
   */
  onNavigate?: (navigate: () => void) => void
}) => {
  const theme = useTheme()
  const cardStyle = useCardStyle()
  const navigation = useNavigation<RootStackNavigation>()
  const { showsTimeEntry } = usePublisher()
  const { open: openLink, copyText } = useLinkActions()
  const categories = useCategories((state) => state.categories)
  const countingStatus = props.countingStatus ?? 'counted'
  const isNotCounted = countingStatus === 'notCounted'

  const isRecurring = props.item.type === 'recurring'
  const plan = props.item.plan
  const date = props.item.date
  const recurringPlan = isRecurring ? (plan as RecurringPlan) : null
  const dayPlan = !isRecurring ? (plan as DayPlan) : null
  const displayMinutes = recurringPlan
    ? getEffectiveMinutesForRecurringPlan(recurringPlan, date)
    : (dayPlan?.minutes ?? 0)
  const displayNote = recurringPlan
    ? getEffectiveNoteForRecurringPlan(recurringPlan, date)
    : dayPlan?.note
  const noteStyle = {
    color: theme.colors.textAlt,
    fontSize: theme.fontSize('sm'),
    lineHeight: theme.fontSize('sm') * 1.4,
  }
  const displayStartTimeInMinutes =
    (recurringPlan
      ? getEffectiveStartTimeInMinutesForRecurringPlan(recurringPlan, date)
      : dayPlan?.startTimeInMinutes) ?? DEFAULT_START_TIME_IN_MINUTES
  const category = plan.categoryId
    ? categories.find((candidate) => candidate.id === plan.categoryId)
    : undefined
  const categoryLabel = category
    ? i18n.t(category.name as TranslationKey, {
        defaultValue: category.name,
      })
    : i18n.t('standard')
  const formattedDuration = useFormattedMinutes(displayMinutes)
  const dateMoment = moment(date)
  const isToday = dateMoment.isSame(moment(), 'day')
  const showContextFreeDate =
    props.dateDisplay === 'monthList' &&
    props.contextMonth !== undefined &&
    props.contextYear !== undefined &&
    dateMoment.month() === props.contextMonth &&
    dateMoment.year() === props.contextYear
  const dateLabel =
    props.dateDisplay === 'monthList'
      ? showContextFreeDate
        ? formatWeekdayDayCompact(dateMoment)
        : formatWeekdayMonthDayCompact(dateMoment)
      : formatDate(date)
  const heading = `${dateLabel} · ${formatStartTime(displayStartTimeInMinutes)}`
  const noteLinks = displayNote ? findLinks(displayNote) : []
  const mapsUrl = plan.location ? appleMapsUrl(plan.location) : undefined
  const longNote = !!displayNote && isLongNote(displayNote)

  const go = (navigate: () => void) =>
    props.onNavigate ? props.onNavigate(navigate) : navigate()

  const removePlan = (scope?: RecurringDeleteScope) => {
    if (props.item.type === 'day') {
      deletePlan({ kind: 'day', planId: props.item.plan.id })
    } else {
      deletePlan(
        {
          kind: 'recurring',
          planId: props.item.plan.id,
          date: props.item.date,
        },
        scope
      )
    }
  }

  /**
   * The one delete flow for the swipe and a Day Plan's menu item, so the
   * confirmation copy and the recurring-scope choices stay identical.
   */
  const handleRequestDelete = () => {
    confirmDeletePlan({ recurring: isRecurring, onDelete: removePlan })
  }

  const handleSwipeOpen = (
    direction: 'left' | 'right',
    swipeable: Swipeable
  ) => {
    if (direction !== 'right') return

    // Snap the row back before the confirmation lands — the alert owns the
    // interaction from here, whichever way the user answers it.
    swipeable.reset()
    handleRequestDelete()
  }

  const logAsTime = () =>
    go(() =>
      navigation.navigate('Add Time', {
        date: date.toISOString(),
        hours: Math.floor(displayMinutes / 60),
        minutes: displayMinutes % 60,
        categoryId: plan.categoryId,
      })
    )

  const duplicate = () =>
    go(() =>
      navigation.navigate('PlanDay', {
        date: date.toISOString(),
        prefill: {
          startTime: dateMoment
            .clone()
            .startOf('day')
            .add(displayStartTimeInMinutes, 'minutes')
            .toISOString(),
          minutes: displayMinutes,
          note: displayNote || undefined,
          title: plan.title,
          location: plan.location,
          categoryId: plan.categoryId,
        },
      })
    )

  const menu: ContextMenuEntries = [
    [
      props.onPress && {
        id: 'edit',
        title: i18n.t('edit'),
        systemImage: 'pencil',
        onPress: props.onPress,
      },
      // Logging time for a day that hasn't happened yet makes no sense, and
      // publishers who don't log hours never see Add Time.
      showsTimeEntry &&
        !dateMoment.isAfter(moment(), 'day') && {
          id: 'log_as_time',
          title: i18n.t('logAsTime'),
          systemImage: 'clock',
          onPress: logAsTime,
        },
      {
        id: 'duplicate',
        title: i18n.t('duplicateEllipsis'),
        systemImage: 'plus.square.on.square',
        onPress: duplicate,
      },
    ],
    [
      mapsUrl
        ? {
            id: 'open_in_maps',
            title: i18n.t('openInMaps'),
            systemImage: 'map',
            onPress: () => void openURL(mapsUrl),
          }
        : null,
      plan.location && {
        id: 'copy_address',
        title: i18n.t('copyAddress'),
        systemImage: 'doc.on.doc',
        onPress: () => void copyText(planLocationText(plan.location!)),
      },
      noteLinks.length === 1 && {
        id: 'open_link',
        title: i18n.t('openLink'),
        systemImage: 'safari',
        onPress: () => openLink(noteLinks[0]),
      },
      noteLinks.length > 1 && {
        id: 'open_link',
        title: i18n.t('openLink'),
        systemImage: 'safari',
        actions: noteLinks.map((url, index) => ({
          id: `link_${index}`,
          title: getHostname(url),
          onPress: () => openLink(url),
        })),
      },
      displayNote
        ? {
            id: 'copy_note',
            title: i18n.t('copyNote'),
            systemImage: 'doc.on.doc',
            onPress: () => void copyText(displayNote),
          }
        : null,
    ],
    [
      isRecurring
        ? {
            id: 'delete',
            title: i18n.t('delete'),
            systemImage: 'trash',
            actions: RECURRING_DELETE_SCOPES.map((scope) => ({
              id: scope,
              title: recurringDeleteScopeLabel(scope),
              destructive: true,
              onPress: () =>
                confirmDeletePlanScope({ scope, onDelete: removePlan }),
            })),
          }
        : {
            id: 'delete',
            title: i18n.t('delete'),
            systemImage: 'trash',
            destructive: true,
            onPress: handleRequestDelete,
          },
    ],
  ]

  return (
    <Swipeable
      onSwipeableWillOpen={() => Haptics.light()}
      containerStyle={{
        backgroundColor: theme.colors.background,
        borderRadius: cardStyle.borderRadius,
      }}
      renderRightActions={() => <SwipeableDelete />}
      onSwipeableOpen={(direction, swipeable) =>
        handleSwipeOpen(direction, swipeable)
      }
    >
      <ContextMenu
        actions={menu}
        onPress={props.onPress}
        hoverRadius={cardStyle.borderRadius}
        preview={
          longNote && displayNote ? (
            <PlanPreview
              heading={heading}
              title={plan.title}
              note={displayNote}
              location={plan.location}
            />
          ) : undefined
        }
      >
        <View
          style={{
            ...cardStyle,
            backgroundColor: isNotCounted
              ? theme.colors.backgroundLighter
              : cardStyle.backgroundColor,
            shadowOpacity: isNotCounted ? 0 : cardStyle.shadowOpacity,
            paddingVertical: 12,
            paddingHorizontal: 14,
          }}
        >
          <View
            style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}
          >
            <PlanKindIcon
              recurring={isRecurring}
              countingStatus={countingStatus}
            />
            <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 10,
                }}
              >
                <Text
                  style={{
                    fontFamily: theme.fonts.semiBold,
                    color: theme.colors.text,
                    flex: 1,
                  }}
                  numberOfLines={1}
                  ellipsizeMode='tail'
                >
                  {heading}
                </Text>
                <Text
                  style={{
                    color: theme.colors.textAlt,
                    fontSize: theme.fontSize('sm'),
                    flexShrink: 1,
                    maxWidth: '45%',
                    textAlign: 'right',
                  }}
                >
                  {formattedDuration.formatted}
                </Text>
              </View>

              {plan.title ? (
                <Text
                  style={{ fontFamily: theme.fonts.semiBold }}
                  numberOfLines={2}
                >
                  {plan.title}
                </Text>
              ) : null}

              {plan.location ? (
                <PlanLocationLink
                  location={plan.location}
                  compact
                  interactive={false}
                />
              ) : null}

              {displayNote ? (
                <RichNoteText
                  text={displayNote}
                  style={noteStyle}
                  numberOfLines={NOTE_PREVIEW_LINES}
                  interactive={false}
                />
              ) : null}

              {props.footer}

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {isNotCounted && (
                  <Badge size='xs' color={theme.colors.background}>
                    {i18n.t('notCounted')}
                  </Badge>
                )}
                <Badge size='xs'>{categoryLabel}</Badge>
                {isToday && <Badge size='xs'>{i18n.t('today')}</Badge>}
              </View>
            </View>
          </View>
        </View>
      </ContextMenu>
    </Swipeable>
  )
}

export default PlanRow
