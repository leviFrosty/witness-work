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
import { dayPlansOnLocalDay } from '@/lib/dayPlansByDay'
import { isStoredDateOnLocalDay } from '@/lib/normalizeDate'
import { FlashList } from '@shopify/flash-list'
import { TimeEntry, DayPlan } from '@/types/timeEntry'
import TimeReportRow from '@/features/service-reports/components/TimeReportRow'
import Empty from '@/components/ui/Empty'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import {
  ReactNode,
  RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import useServiceReport from '@/stores/serviceReport'
import XView from '@/components/ui/layout/XView'
import {
  PlannedDayContribution,
  resolvePlannedContributionsForDay,
} from '@/lib/recurrence'
import PlanRow, { getPlanItemStartTime } from '@/components/PlanRow'
import type { PlanListItem } from '@/types/timeEntry'
import type { LogTimePrefill } from '@/hooks/usePlanMenuActions'
import type { RootStackParamList } from '@/types/rootStack'
import DayHistoryHeader from '@/features/service-reports/components/DayHistoryHeader'
import TimeEntryForm, {
  type TimeEntryDraft,
} from '@/features/service-reports/components/TimeEntryForm'
import DayFormCard from '@/features/service-reports/components/DayFormCard'

export type PlanFormDraft = { params: () => RootStackParamList['PlanDay'] }

export type PlanFormSlot = {
  date: Date
  layout: 'docked' | 'inline'

  params?: RootStackParamList['PlanDay']

  onDone: (target?: RootStackParamList['Plan Details']) => void

  draftRef?: RefObject<PlanFormDraft | null>
}

export type PlanDetailsSlot = {
  plan: RootStackParamList['Plan Details']

  onEdit: (params: RootStackParamList['PlanDay']) => void

  onOpenPlan: (target: RootStackParamList['Plan Details']) => void

  onGone: () => void

  onNavigate: (navigate: () => void) => void
}

interface DayHistoryViewProps {
  date: Date
  serviceReports?: TimeEntry[]
  showHeader?: boolean
  onTimeReportPress?: (report: TimeEntry) => void
  onAddTime?: () => void

  onLogTime?: (prefill: LogTimePrefill) => void
  onPlanDay?: () => void

  onNavigate?: (navigate: () => void) => void

  renderDayPlanFooter?: (plan: DayPlan) => ReactNode

  inlineForms?: boolean

  renderPlanForm?: (slot: PlanFormSlot) => ReactNode

  onFormOpen?: (card: View) => void

  onTimeFormOpenChange?: (open: boolean) => void

  onPlanOpen?: (target: RootStackParamList['Plan Details']) => void

  onPlanEdit?: (params: RootStackParamList['PlanDay']) => void

  onExpandTime?: (params: RootStackParamList['Add Time']) => void

  onExpandPlan?: (params: RootStackParamList['PlanDay']) => void
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
  onTimeFormOpenChange,
  onPlanOpen,
  onPlanEdit,
  onExpandTime,
  onExpandPlan,
}) => {
  const theme = useTheme()
  const { showsTimeEntry } = usePublisher()

  const onAddTime = showsTimeEntry ? onAddTimeProp : undefined
  const { dayPlans, recurringPlans } = useServiceReport()

  const thisDaysReports = useMemo(
    () => serviceReports?.filter((r) => isStoredDateOnLocalDay(r.date, date)),
    [date, serviceReports]
  )

  const dayPlansForToday = useMemo(() => {
    return dayPlansOnLocalDay(dayPlans, date)
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

  const unfoldsTimeForm = !moment(date).isAfter(moment(), 'day')
  const [timeFormUnfolded, setTimeFormOpen] = useState(unfoldsTimeForm)
  const timeFormOpen = !!inlineTimeForm && timeFormUnfolded
  useEffect(() => {
    onTimeFormOpenChange?.(timeFormOpen)
    return () => onTimeFormOpenChange?.(false)
  }, [timeFormOpen, onTimeFormOpenChange])
  const [planFormOpen, setPlanFormOpen] = useState(false)
  const timeCard = useRef<View>(null)
  const planCard = useRef<View>(null)
  const timeDraft = useRef<TimeEntryDraft>(null)
  const planDraft = useRef<PlanFormDraft>(null)

  const expand =
    <P,>(
      draft: RefObject<{ params: () => P } | null>,
      setOpen: (open: boolean) => void,
      onExpand: (params: P) => void,
      fallback: P
    ) =>
    () => {
      onExpand(draft.current?.params() ?? fallback)
      setOpen(false)
    }
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
        {}
        <XView style={{ justifyContent: 'space-between', gap: 12 }}>
          <Text
            style={{
              flexShrink: 1,
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
              frame
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
            />
          )}
        </XView>
        {inlineTimeForm ? (
          <DayFormCard
            ref={timeCard}
            title={i18n.t('addTime')}
            icon={PlusIcon}
            openIcon={ClockIcon}
            subtitle={
              unfoldsTimeForm ? i18n.t('timeForm_noTimeLogged') : undefined
            }
            open={timeFormOpen}
            onOpenChange={toggleForm(setTimeFormOpen, timeCard)}
            onExpand={
              onExpandTime
                ? expand(timeDraft, setTimeFormOpen, onExpandTime, {
                    date: date.toISOString(),
                  })
                : undefined
            }
            expandTestID='day-time-form-expand'
            testID='day-time-form'
          >
            <TimeEntryForm
              draftRef={timeDraft}
              layout='inline'
              date={date}
              source='day_sheet'
              onDone={() => setTimeFormOpen(false)}
            />
          </DayFormCard>
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
        <XView style={{ justifyContent: 'space-between', gap: 12 }}>
          <Text
            style={{
              flexShrink: 1,
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
              frame
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
            />
          )}
        </XView>
        {inlinePlanForm ? (
          <DayFormCard
            ref={planCard}
            title={i18n.t('planDay')}
            icon={CalendarDaysIcon}
            openIcon={CalendarDaysIcon}
            open={planFormOpen}
            onOpenChange={toggleForm(setPlanFormOpen, planCard)}
            onExpand={
              onExpandPlan
                ? expand(planDraft, setPlanFormOpen, onExpandPlan, {
                    date: date.toISOString(),
                  })
                : undefined
            }
            expandTestID='day-plan-form-expand'
            testID='day-plan-form'
          >
            {renderPlanForm?.({
              date,
              layout: 'inline',
              draftRef: planDraft,

              onDone: () => setPlanFormOpen(false),
            })}
          </DayFormCard>
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
                  onOpen={onPlanOpen}
                  onEdit={onPlanEdit}
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
