import {
  CalendarDays as CalendarDaysIcon,
  Clock as ClockIcon,
  Plus as PlusIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'
import useTheme from '@/contexts/theme'
import usePublisher from '@/hooks/usePublisher'
import moment from 'moment'
import { isStoredDateOnLocalDay } from '@/lib/normalizeDate'
import { FlashList } from '@shopify/flash-list'
import { TimeEntry, DayPlan } from '@/types/timeEntry'
import TimeReportRow from '@/features/service-reports/components/TimeReportRow'
import Empty from '@/components/ui/Empty'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import { ReactNode, useMemo, useRef, useState } from 'react'
import useServiceReport from '@/stores/serviceReport'
import XView from '@/components/ui/layout/XView'
import {
  PlannedDayContribution,
  resolvePlannedContributionsForDay,
} from '@/lib/recurrence'
import PlanRow, { getPlanItemStartTime } from '@/components/PlanRow'
import type { PlanListItem } from '@/types/timeEntry'
import type { LogTimePrefill } from '@/hooks/usePlanMenuActions'
import DayHistoryHeader from '@/features/service-reports/components/DayHistoryHeader'
import TimeEntryForm from '@/features/service-reports/components/TimeEntryForm'
import CollapsibleCard from '@/components/ui/CollapsibleCard'

/** What a day's Plan form is shown with, by the screen that provides it. */
export type PlanFormSlot = {
  date: Date
  layout: 'docked' | 'inline'
  /** Saved or deleted. */
  onDone: () => void
}

interface DayHistoryViewProps {
  date: Date
  serviceReports?: TimeEntry[]
  showHeader?: boolean
  onTimeReportPress?: (report: TimeEntry) => void
  onAddTime?: () => void
  /** A Plan's Log as Time, for hosts that log time in place. */
  onLogTime?: (prefill: LogTimePrefill) => void
  onPlanDay?: () => void
  /**
   * Runs a navigation from a row or its context menu. A host sheet passes one
   * that closes itself first.
   */
  onNavigate?: (navigate: () => void) => void
  /** Extra lines under a one-time Plan's row, e.g. who the Plan is with. */
  renderDayPlanFooter?: (plan: DayPlan) => ReactNode
  /**
   * A day with no time or no Plans yet keeps the time or Plan form in its list,
   * folded under Add Time or Plan Day, instead of a button that opens it.
   */
  inlineForms?: boolean
  /** The Plan form, for `inlineForms`, from the screen: it lives in Plans. */
  renderPlanForm?: (slot: PlanFormSlot) => ReactNode
  /** A folded form was opened, so its host can scroll it into view. */
  onFormOpen?: (card: View) => void
}

const contributionToPlanListItem = (
  contribution: PlannedDayContribution,
  date: Date
): PlanListItem => {
  if (contribution.source === 'day') {
    return { type: 'day', date, plan: contribution.plan }
  }

  return { type: 'recurring', date, plan: contribution.plan }
}

const EmptyActionButton = (props: {
  label: string
  onPress?: () => void
  testID?: string
}) => {
  const theme = useTheme()

  if (!props.onPress) return null

  return (
    <Button
      noTransform
      variant='outline'
      onPress={props.onPress}
      testID={props.testID}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 9,
        gap: 7,
        alignItems: 'center',
      }}
    >
      <LucideIcon icon={PlusIcon} size={12} color={theme.colors.text} />
      <Text
        style={{
          color: theme.colors.text,
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('sm'),
        }}
      >
        {props.label}
      </Text>
    </Button>
  )
}

const DayHistoryView: React.FC<DayHistoryViewProps> = ({
  date,
  serviceReports = [],
  showHeader = false,
  onTimeReportPress,
  onAddTime: onAddTimeProp,
  onLogTime,
  onPlanDay,
  onNavigate,
  renderDayPlanFooter,
  inlineForms,
  renderPlanForm,
  onFormOpen,
}) => {
  const theme = useTheme()
  const { showsTimeEntry } = usePublisher()
  // Regular Publishers who haven't opted into logging hours never see an
  // "Add Time" affordance — hours entered here would be invisible to them
  // (no Progress tab, and the report only says whether they shared).
  const onAddTime = showsTimeEntry ? onAddTimeProp : undefined
  const { dayPlans, recurringPlans } = useServiceReport()

  const thisDaysReports = useMemo(
    () => serviceReports?.filter((r) => isStoredDateOnLocalDay(r.date, date)),
    [date, serviceReports]
  )

  const dayPlansForToday = useMemo(() => {
    return dayPlans.filter((dp) => isStoredDateOnLocalDay(dp.date, date))
  }, [dayPlans, date])

  const contributions = resolvePlannedContributionsForDay(
    date,
    dayPlansForToday,
    recurringPlans
  )
  const planItems = contributions
    .map((contribution) => contributionToPlanListItem(contribution, date))
    .sort((a, b) => getPlanItemStartTime(a) - getPlanItemStartTime(b))

  const hasTimeReports = !!thisDaysReports?.length
  const hasPlans = planItems.length > 0
  const inlineTimeForm = inlineForms && !!onAddTime && !hasTimeReports
  const inlinePlanForm = inlineForms && !!renderPlanForm && !hasPlans
  const [timeFormOpen, setTimeFormOpen] = useState(false)
  const [planFormOpen, setPlanFormOpen] = useState(false)
  const timeCard = useRef<View>(null)
  const planCard = useRef<View>(null)
  const toggleForm =
    (setOpen: (open: boolean) => void, card: React.RefObject<View | null>) =>
    (open: boolean) => {
      setOpen(open)
      if (open && card.current) onFormOpen?.(card.current)
    }

  return (
    <View style={{ gap: 20 }}>
      {showHeader && (
        <View style={{ marginBottom: 10 }}>
          <DayHistoryHeader date={date} serviceReports={serviceReports} />
        </View>
      )}

      <View style={{ gap: 8 }}>
        <XView style={{ justifyContent: 'space-between' }}>
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
              textTransform: 'uppercase',
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t('timeReports')}
          </Text>
          {hasTimeReports && onAddTime && (
            <IconButton
              noTransform
              icon={PlusIcon}
              onPress={onAddTime}
              accessibilityLabel={i18n.t('addTime')}
              testID='day-add-time'
              size={13}
              style={{
                borderColor: theme.colors.border,
                borderWidth: 1,
                borderRadius: 999,
                padding: 7,
              }}
              hitSlop={8}
            />
          )}
        </XView>
        {inlineTimeForm ? (
          <CollapsibleCard
            ref={timeCard}
            label={i18n.t('addTime')}
            open={timeFormOpen}
            onOpenChange={toggleForm(setTimeFormOpen, timeCard)}
            testID='day-time-form'
          >
            <TimeEntryForm
              layout='inline'
              date={date}
              source='day_sheet'
              // Once saved, the entry takes the card's place in the list.
              onDone={() => setTimeFormOpen(false)}
            />
          </CollapsibleCard>
        ) : (
          <View style={{ flex: 1, minHeight: 10 }}>
            <FlashList
              scrollEnabled={false}
              data={
                thisDaysReports
                  ? thisDaysReports.sort((a, b) =>
                      moment(a.date).unix() < moment(b.date).unix() ? 1 : -1
                    )
                  : undefined
              }
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              renderItem={({ item }) => (
                <TimeReportRow
                  report={item}
                  onPress={() => onTimeReportPress?.(item)}
                  onNavigate={onNavigate}
                />
              )}
              ListEmptyComponent={
                <Empty
                  dashedOutline
                  icon={
                    <LucideIcon
                      icon={ClockIcon}
                      size={24}
                      color={theme.colors.text}
                    />
                  }
                  title={i18n.t('noReportsThisDay')}
                  action={
                    onAddTime ? (
                      <EmptyActionButton
                        label={i18n.t('addTime')}
                        onPress={onAddTime}
                        testID='day-add-time'
                      />
                    ) : undefined
                  }
                />
              }
            />
          </View>
        )}
      </View>

      <View style={{ gap: 8 }}>
        <XView style={{ justifyContent: 'space-between' }}>
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
              textTransform: 'uppercase',
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t('plans')}
          </Text>
          {hasPlans && onPlanDay && (
            <IconButton
              noTransform
              icon={PlusIcon}
              onPress={onPlanDay}
              accessibilityLabel={i18n.t('planDay')}
              size={13}
              style={{
                borderColor: theme.colors.border,
                borderWidth: 1,
                borderRadius: 999,
                padding: 7,
              }}
              hitSlop={8}
            />
          )}
        </XView>
        {inlinePlanForm ? (
          <CollapsibleCard
            ref={planCard}
            label={i18n.t('planDay')}
            open={planFormOpen}
            onOpenChange={toggleForm(setPlanFormOpen, planCard)}
            testID='day-plan-form'
          >
            {renderPlanForm?.({
              date,
              layout: 'inline',
              // Once saved, the Plan takes the card's place in the list.
              onDone: () => setPlanFormOpen(false),
            })}
          </CollapsibleCard>
        ) : (
          <View style={{ flex: 1, minHeight: 10 }}>
            <FlashList
              scrollEnabled={false}
              data={planItems}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              renderItem={({ item }) => (
                <PlanRow
                  item={item}
                  onNavigate={onNavigate}
                  onLogTime={onLogTime}
                  footer={
                    item.type === 'day'
                      ? renderDayPlanFooter?.(item.plan)
                      : undefined
                  }
                />
              )}
              ListEmptyComponent={
                <Empty
                  dashedOutline
                  icon={
                    <LucideIcon
                      icon={CalendarDaysIcon}
                      size={24}
                      color={theme.colors.text}
                    />
                  }
                  title={i18n.t('noPlansThisDay')}
                  action={
                    onPlanDay ? (
                      <EmptyActionButton
                        label={i18n.t('planDay')}
                        onPress={onPlanDay}
                      />
                    ) : undefined
                  }
                />
              }
            />
          </View>
        )}
      </View>
    </View>
  )
}

export default DayHistoryView
