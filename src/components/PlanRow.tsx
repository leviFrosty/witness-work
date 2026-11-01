import {
  Calendar1 as Calendar1Icon,
  Repeat as RepeatIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { ReactNode } from 'react'
import { View } from 'react-native'
import SwipeableRow, {
  type Swipeable,
  type SwipeSide,
} from '@/components/ui/SwipeableRow'
import moment from 'moment'
import Text from '@/components/ui/MyText'
import useCategories from '@/stores/categories'
import i18n from '@/lib/locales'
import { planTypeLabel } from '@/lib/planTypeLabel'
import useTheme from '@/contexts/theme'
import Haptics from '@/lib/haptics'
import SwipeableDelete from '@/components/ui/swipeableActions/Delete'
import ContextMenu from '@/components/ui/ContextMenu'
import type { DayPlan, PlanListItem } from '@/types/timeEntry'
import { useFormattedMinutes } from '@/lib/minutes'
import Badge from '@/components/ui/Badge'
import PlanLocationLink from '@/components/PlanLocationLink'
import RichNote from '@/components/RichNote'
import usePlanMenuActions, {
  type LogTimePrefill,
} from '@/hooks/usePlanMenuActions'
import {
  formatDate,
  formatStartTime,
  formatWeekdayDayCompact,
  formatWeekdayMonthDayCompact,
} from '@/lib/dates'
import { useCardStyle } from '@/components/ui/Card'
import { getStartTimeInMinutes } from '@/lib/normalizeDate'
import {
  getEffectiveStartTimeInMinutesForRecurringPlan,
  isRecurringPlanAnytimeOnDate,
} from '@/lib/recurrence'
import { richTextImages } from '@/lib/richText/inspect'
import { getNoteDoc, getNoteText, hasNote } from '@/lib/richText/notes'
import type { NoteFields } from '@/types/richText'
import { alignText } from '@/lib/direction'
import type { RootStackParamList } from '@/types/rootStack'

export const getPlanItemStartTime = (item: PlanListItem): number => {
  if (item.type === 'day') {
    return item.plan.anytime ? -1 : getStartTimeInMinutes(item.plan)
  }

  return isRecurringPlanAnytimeOnDate(item.plan, item.date)
    ? -1
    : getEffectiveStartTimeInMinutesForRecurringPlan(item.plan, item.date)
}

const PlanKindIcon = (props: { recurring: boolean }) => {
  const theme = useTheme()
  const emphasizedOneTime = !props.recurring

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

const NOTE_PREVIEW_LINES = 3
const isLongNote = (note: NoteFields) => {
  const text = getNoteText(note)
  return (
    text.length > 140 ||
    text.split('\n').length > NOTE_PREVIEW_LINES ||
    richTextImages(getNoteDoc(note)).length > 0
  )
}

const PlanPreview = (props: {
  heading: string
  title?: string
  note: NoteFields
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
      <RichNote
        note={props.note}
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
  dateDisplay?: 'full' | 'monthList'
  contextMonth?: number
  contextYear?: number

  footer?: ReactNode

  onNavigate?: (navigate: () => void) => void

  onLogTime?: (prefill: LogTimePrefill) => void

  onOpen?: (target: RootStackParamList['Plan Details']) => void

  onEdit?: (params: RootStackParamList['PlanDay']) => void
}) => {
  const theme = useTheme()
  const cardStyle = useCardStyle()
  const categories = useCategories((state) => state.categories)

  const isRecurring = props.item.type === 'recurring'
  const plan = props.item.plan
  const date = props.item.date
  const { open, menu, requestDelete, effective } = usePlanMenuActions(
    props.item,
    {
      go: props.onNavigate,
      logTime: props.onLogTime,
      open: props.onOpen,
      edit: props.onEdit,
    }
  )
  const displayNote = effective.note
  const showsNote = hasNote(displayNote)
  const noteStyle = {
    color: theme.colors.textAlt,
    fontSize: theme.fontSize('sm'),
    lineHeight: theme.fontSize('sm') * 1.4,
  }
  const categoryLabel = planTypeLabel(plan, categories)

  const hasCategory =
    !!plan.categoryId && categories.some((c) => c.id === plan.categoryId)
  const formattedDuration = useFormattedMinutes(effective.minutes)
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
  const heading = `${dateLabel} · ${
    effective.anytime
      ? i18n.t('planAnytime')
      : formatStartTime(effective.startTimeInMinutes)
  }`
  const longNote = showsNote && isLongNote(displayNote)

  const handleSwipeOpen = (side: SwipeSide, swipeable: Swipeable) => {
    if (side !== 'trailing') return

    swipeable.reset()
    requestDelete()
  }

  return (
    <SwipeableRow
      onSwipeableWillOpen={() => Haptics.light()}
      containerStyle={{
        backgroundColor: theme.colors.background,
        borderRadius: cardStyle.borderRadius,
      }}
      renderTrailingActions={() => <SwipeableDelete />}
      onSwipeableOpen={(side, swipeable) => handleSwipeOpen(side, swipeable)}
    >
      <ContextMenu
        actions={menu}
        onPress={open}
        hoverRadius={cardStyle.borderRadius}
        preview={
          longNote ? (
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
          testID={`plan-row-${plan.id}`}
          style={{
            ...cardStyle,
            paddingVertical: 12,
            paddingHorizontal: 14,
          }}
        >
          <View
            style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}
          >
            <PlanKindIcon recurring={isRecurring} />
            <View style={{ flex: 1, flexShrink: 1, minWidth: 0, gap: 8 }}>
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
                    maxWidth: '45%',
                    textAlign: alignText('end'),
                  }}
                  numberOfLines={1}
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

              {showsNote ? (
                <RichNote
                  note={displayNote}
                  style={noteStyle}
                  numberOfLines={NOTE_PREVIEW_LINES}
                  interactive={false}
                  thumbnails
                />
              ) : null}

              {props.footer}

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {hasCategory && <Badge size='xs'>{categoryLabel}</Badge>}
                {isToday && <Badge size='xs'>{i18n.t('today')}</Badge>}
              </View>
            </View>
          </View>
        </View>
      </ContextMenu>
    </SwipeableRow>
  )
}

export default PlanRow
