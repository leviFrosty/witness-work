import { CircleHelp as CircleHelpIcon } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { BackHandler, Platform, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  BottomTabScreenProps,
  useBottomTabBarHeight,
} from '@react-navigation/bottom-tabs'
import { useNavigation as useRootNavigation } from '@react-navigation/native'
import moment from 'moment'

import useTheme from '@/contexts/theme'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import i18n from '@/lib/locales'
import { getMonthsReports } from '@/lib/serviceReport'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import useServiceReport from '@/stores/serviceReport'
import { usePreferences } from '@/stores/preferences'
import { useScheduleIntro } from '@/stores/scheduleIntro'
import { RootStackNavigation } from '@/types/rootStack'
import { HomeTabStackParamList } from '@/types/homeStack'
import { TimeEntry } from '@/types/timeEntry'
import RootHeader from '@/components/RootHeader'
import IconButton from '@/components/ui/IconButton'
import PointerTooltip from '@/components/ui/PointerTooltip'
import SelectedDateSheet, {
  SelectedDateSheetState,
} from '@/features/service-reports/components/SelectedDateSheet'
import BuddiesHeaderButton from '@/features/buddies/components/BuddiesHeaderButton'
import BuddyPlansForDay from '@/features/buddies/components/BuddyPlansForDay'
import PlanBuddiesLine from '@/features/buddies/components/PlanBuddiesLine'
import useBuddyCalendarMarkers from '@/features/buddies/hooks/useBuddyCalendarMarkers'
import useSyncBuddiesOnFocus from '@/features/buddies/hooks/useSyncBuddiesOnFocus'
import TodayRouteEntry from '@/features/route-planning/components/TodayRouteEntry'
import MonthGoalEditor from '@/features/plans/components/MonthGoalEditor'
import MonthOverviewSheet from '@/features/plans/components/MonthOverviewSheet'
import ScheduleCalendarStage from '@/features/plans/components/ScheduleCalendarStage'
import ScheduleDayInspector from '@/features/plans/components/ScheduleDayInspector'
import ScheduleInsights from '@/features/plans/components/ScheduleInsights'
import ScheduleScreenSections from '@/features/plans/components/ScheduleScreenSections'
import ScheduleViewToggle from '@/features/plans/components/ScheduleViewToggle'
import useEditableMonthGoal from '@/features/plans/hooks/useEditableMonthGoal'
import useScheduleCalendar from '@/features/plans/hooks/useScheduleCalendar'
import useScheduleDayIndex from '@/features/plans/hooks/useScheduleDayIndex'

type Props = BottomTabScreenProps<HomeTabStackParamList, 'Schedule'>

const ScheduleScreen = ({ route, navigation }: Props) => {
  const theme = useTheme()
  const { isWide, hasSidebar } = useAdaptiveLayout()
  const insets = useSafeAreaInsets()
  const tabBarHeight = useBottomTabBarHeight()
  const rootNavigation = useRootNavigation<RootStackNavigation>()
  const serviceReports = useServiceReport((s) => s.serviceReports)
  useSyncBuddiesOnFocus()
  const openIntro = useScheduleIntro((s) => s.open)
  // The first visit explains how to get the most from Schedule.
  useEffect(() => {
    if (!usePreferences.getState().scheduleIntroSeen) openIntro('first_visit')
  }, [openIntro])
  const buddyMarkers = useBuddyCalendarMarkers()
  const index = useScheduleDayIndex()
  const editableGoal = useEditableMonthGoal()
  const bottomInset = (hasSidebar ? insets.bottom : tabBarHeight) + 40

  const routeMonth =
    route.params?.year !== undefined && route.params.month !== undefined
      ? { year: route.params.year, month: route.params.month }
      : undefined
  const calendar = useScheduleCalendar({ initial: routeMonth })

  const [selectedDateSheet, setSelectedDateSheet] =
    useState<SelectedDateSheetState>({ open: false, date: new Date() })
  const [overviewMonth, setOverviewMonth] = useState<CalendarMonth | null>(null)
  const [overviewOpen, setOverviewOpen] = useState(false)

  // A wide window shows the day in the inspector; a sheet left open would pop
  // back up once the window narrows again.
  useEffect(() => {
    if (isWide) setSelectedDateSheet((current) => ({ ...current, open: false }))
  }, [isWide])
  const [goalMonth, setGoalMonth] = useState<CalendarMonth | null>(null)
  const [goalOpen, setGoalOpen] = useState(false)

  // Links from elsewhere (a month report, the week strip) land on their month.
  const handledRoute = useRef(routeMonth)
  useEffect(() => {
    if (!routeMonth) return
    const previous = handledRoute.current
    if (
      previous?.year === routeMonth.year &&
      previous.month === routeMonth.month
    )
      return
    handledRoute.current = routeMonth
    calendar.showMonth(routeMonth)
  })

  // The sheets are modal and this tab stays mounted, so they would cover
  // whatever screen a widget or tab switch opens next.
  useEffect(
    () =>
      navigation.addListener('blur', () => {
        setSelectedDateSheet((current) =>
          current.open ? { ...current, open: false } : current
        )
        setOverviewOpen(false)
        setGoalOpen(false)
      }),
    [navigation]
  )

  // Android's back button closes an open sheet rather than leaving the tab
  // with it.
  const sheetOpen = selectedDateSheet.open || overviewOpen || goalOpen
  useEffect(() => {
    if (Platform.OS !== 'android' || !sheetOpen) return
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        setSelectedDateSheet((current) => ({ ...current, open: false }))
        setOverviewOpen(false)
        setGoalOpen(false)
        return true
      }
    )
    return () => subscription.remove()
  }, [sheetOpen])

  // A Calendar widget day (`witnesswork://schedule/:date`) opens that day the
  // same way tapping it here does: the sheet, or the inspector when wide.
  const linkedDate = route.params?.date
  useEffect(() => {
    if (!linkedDate) return
    const date = moment(linkedDate, 'YYYY-MM-DD', true)
    navigation.setParams({ date: undefined })
    if (!date.isValid()) return
    calendar.showMonth({ year: date.year(), month: date.month() })
    setSelectedDateSheet({ open: !isWide, date: date.toDate() })
  }, [linkedDate, isWide, navigation, calendar])

  const selectedDate = selectedDateSheet.date
  const selectedMonthReports =
    getMonthsReports(
      serviceReports,
      selectedDate.getMonth(),
      selectedDate.getFullYear()
    ) ?? []

  // Navigation chosen in the day sheet waits for it to close, or the pushed
  // screen would land underneath it.
  const pendingNavigation = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (!selectedDateSheet.open && pendingNavigation.current) {
      const callback = pendingNavigation.current
      pendingNavigation.current = null
      setTimeout(callback, 125)
    }
  }, [selectedDateSheet.open])

  const handleAddTime = () => {
    pendingNavigation.current = () =>
      rootNavigation.navigate('Add Time', {
        date: selectedDate.toISOString(),
      })
  }
  const handlePlanDay = () => {
    pendingNavigation.current = () =>
      rootNavigation.navigate('PlanDay', { date: selectedDate.toISOString() })
  }
  const handleEditTimeReport = (report: TimeEntry) => {
    pendingNavigation.current = () =>
      rootNavigation.navigate('Add Time', {
        existingReport: JSON.stringify(report),
      })
  }

  const openGoalEditor = (month: CalendarMonth) => {
    setGoalMonth(month)
    setGoalOpen(true)
  }

  const stage = (
    <ScheduleCalendarStage
      calendar={calendar}
      index={index}
      buddyMarkers={buddyMarkers}
      selectedKey={
        isWide ? moment(selectedDate).format('YYYY-MM-DD') : undefined
      }
      bottomInset={bottomInset}
      onPressDay={(date) => setSelectedDateSheet({ open: !isWide, date })}
      onOpenOverview={(month) => {
        setOverviewMonth(month)
        setOverviewOpen(true)
      }}
      editableGoal={editableGoal}
      onEditGoal={openGoalEditor}
    />
  )

  const focused = calendar.focusedMonth

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <RootHeader
        title={i18n.t('Schedule')}
        actions={
          <>
            <PointerTooltip label={i18n.t('scheduleIntro_howItWorks')}>
              <IconButton
                icon={CircleHelpIcon}
                size='xl'
                hitSlop={12}
                accessibilityLabel={i18n.t('scheduleIntro_howItWorks')}
                onPress={() => openIntro('help')}
              />
            </PointerTooltip>
            <ScheduleViewToggle
              value={calendar.view}
              onChange={(view) => calendar.changeView(view, 'toggle')}
            />
            {/* Phones have no room for the label beside the other actions
            and the title. */}
            <BuddiesHeaderButton compact={!isWide} />
          </>
        }
        contentStyle={{ maxWidth: isWide ? 1200 : 720 }}
      />
      {isWide ? (
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            gap: 20,
            width: '100%',
            maxWidth: 1200,
            alignSelf: 'center',
            paddingHorizontal: 15,
          }}
        >
          <View style={{ flex: 0.58 }}>{stage}</View>
          <ScrollView
            // ScrollView's own style sets `flexGrow: 1`, which outranks `flex`;
            // without its own grow this column takes 63% instead of 42%.
            style={{ flex: 0.42, flexGrow: 0.42 }}
            contentContainerStyle={{ gap: 16, paddingBottom: bottomInset }}
          >
            <ScheduleDayInspector
              date={selectedDate}
              reports={selectedMonthReports}
            />
            <ScheduleInsights
              month={focused.month}
              year={focused.year}
              onEditGoal={
                editableGoal(focused)
                  ? () => openGoalEditor(focused)
                  : undefined
              }
            />
            <ScheduleScreenSections month={focused.month} year={focused.year} />
          </ScrollView>
        </View>
      ) : (
        <View
          style={{ flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' }}
        >
          {stage}
        </View>
      )}
      {!isWide && (
        <SelectedDateSheet
          sheet={selectedDateSheet}
          setSheet={setSelectedDateSheet}
          thisMonthsReports={selectedMonthReports}
          onAddTime={handleAddTime}
          onPlanDay={handlePlanDay}
          onEditTimeReport={handleEditTimeReport}
          renderFooter={(date, onNavigate) => (
            <>
              <TodayRouteEntry
                date={date}
                surface='schedule_day'
                onNavigate={onNavigate}
              />
              <BuddyPlansForDay date={date} onNavigate={onNavigate} />
            </>
          )}
          renderDayPlanFooter={(plan) => <PlanBuddiesLine plan={plan} />}
        />
      )}
      {overviewMonth ? (
        <MonthOverviewSheet
          month={overviewMonth}
          open={overviewOpen}
          onOpenChange={setOverviewOpen}
          onEditGoal={
            editableGoal(overviewMonth)
              ? () => openGoalEditor(overviewMonth)
              : undefined
          }
        />
      ) : null}
      {goalMonth ? (
        <MonthGoalEditor
          target={goalMonth}
          open={goalOpen}
          onOpenChange={setGoalOpen}
        />
      ) : null}
    </View>
  )
}

export default ScheduleScreen
