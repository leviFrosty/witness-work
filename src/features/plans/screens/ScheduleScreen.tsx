import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { BackHandler, Platform, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  BottomTabScreenProps,
  useBottomTabBarHeight,
} from '@react-navigation/bottom-tabs'
import { useIsFocused } from '@react-navigation/native'
import moment from 'moment'

import useTheme from '@/contexts/theme'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import i18n from '@/lib/locales'
import { getMonthsReports } from '@/lib/serviceReport'
import type { CalendarMonth } from '@/lib/monthlyGoals'
import useServiceReport from '@/stores/serviceReport'
import { usePreferences } from '@/stores/preferences'
import { useScheduleIntro } from '@/stores/scheduleIntro'
import { useTakeover } from '@/stores/takeover'
import { HomeTabStackParamList } from '@/types/homeStack'
import FoldSplit from '@/components/ui/layout/FoldSplit'
import RootHeader from '@/components/RootHeader'
import ScrollAwayHeader from '@/components/ui/ScrollAwayHeader'
import useHideBarsOnScroll from '@/hooks/useHideBarsOnScroll'
import useTabReselect from '@/hooks/useTabReselect'
import { renderDaySheetPlanForm } from '@/features/plans/components/PlanDayForm'
import { daySheetPlanDetails } from '@/features/plans/components/DaySheetPlanDetails'
import SelectedDateSheet, {
  SelectedDateSheetState,
} from '@/features/service-reports/components/SelectedDateSheet'
import BuddiesEntryRow from '@/features/buddies/components/BuddiesEntryRow'
import BuddyPlansForDay from '@/features/buddies/components/BuddyPlansForDay'
import PlanBuddiesLine from '@/features/buddies/components/PlanBuddiesLine'
import useBuddyCalendarMarkers from '@/features/buddies/hooks/useBuddyCalendarMarkers'
import useSyncBuddiesOnFocus from '@/features/buddies/hooks/useSyncBuddiesOnFocus'
import TodayRouteEntry from '@/features/route-planning/components/TodayRouteEntry'
import MonthGoalEditor from '@/features/plans/components/MonthGoalEditor'
import ScheduleCalendarStage from '@/features/plans/components/ScheduleCalendarStage'
import ScheduleDayInspector from '@/features/plans/components/ScheduleDayInspector'
import ScheduleInsights from '@/features/plans/components/ScheduleInsights'
import ScheduleScreenSections from '@/features/plans/components/ScheduleScreenSections'
import ScheduleViewToggle from '@/features/plans/components/ScheduleViewToggle'
import useEditableMonthGoal from '@/features/plans/hooks/useEditableMonthGoal'
import useScheduleCalendar from '@/features/plans/hooks/useScheduleCalendar'
import useScheduleDayIndex from '@/features/plans/hooks/useScheduleDayIndex'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'

type Props = BottomTabScreenProps<HomeTabStackParamList, 'Schedule'>

const ScheduleScreen = ({ route, navigation }: Props) => {
  const theme = useTheme()
  const { isWide, hasBottomBar } = useAdaptiveLayout()
  const foldColumn = useFoldColumn(isWide ? null : 720)
  const insets = useSafeAreaInsets()
  const tabBarHeight = useBottomTabBarHeight()
  const serviceReports = useServiceReport((s) => s.serviceReports)
  useSyncBuddiesOnFocus()
  const openIntro = useScheduleIntro((s) => s.open)
  const isFocused = useIsFocused()

  useEffect(() => {
    if (!isFocused || usePreferences.getState().scheduleIntroSeen) return
    openIntro('first_visit')
    return () => {
      const intro = useScheduleIntro.getState()
      const showing =
        useTakeover.getState().arbiter.active?.kind === 'schedule-intro'
      if (intro.source === 'first_visit' && !showing) intro.close()
    }
  }, [isFocused, openIntro])
  const buddyMarkers = useBuddyCalendarMarkers()
  const index = useScheduleDayIndex()
  const editableGoal = useEditableMonthGoal()
  const bottomInset = (hasBottomBar ? tabBarHeight : insets.bottom) + 40

  const routeMonth =
    route.params?.year !== undefined && route.params.month !== undefined
      ? { year: route.params.year, month: route.params.month }
      : undefined
  const calendar = useScheduleCalendar({
    initial: routeMonth,
    initialDay: route.params?.date,
  })

  const {
    view,
    focusedMonth: focused,
    changeView,
    showMonth,
    revealDay,
    coverBottom,
    jumpToToday,
    showCurrentServiceYear,
  } = calendar

  useTabReselect(() => {
    if (view === 'month') jumpToToday()
    else showCurrentServiceYear()
  })

  const [selectedDateSheet, setSelectedDateSheet] =
    useState<SelectedDateSheetState>({ open: false, date: new Date() })

  const dayInView = useRef(false)
  const layoutChanged = useEffectEvent((wide: boolean) => {
    if (wide) {
      dayInView.current = selectedDateSheet.open
      if (selectedDateSheet.open) {
        setSelectedDateSheet((current) => ({ ...current, open: false }))
        return
      }
      const date = moment(selectedDateSheet.date)
      if (date.year() === focused.year && date.month() === focused.month) return
      const today = moment()
      const shown =
        today.year() === focused.year && today.month() === focused.month
          ? today
          : moment({ year: focused.year, month: focused.month, day: 1 })
      setSelectedDateSheet({ open: false, date: shown.toDate() })
      return
    }
    if (dayInView.current)
      setSelectedDateSheet((current) => ({ ...current, open: true }))
    dayInView.current = false
  })
  const wasWide = useRef(isWide)
  useEffect(() => {
    if (wasWide.current === isWide) return
    wasWide.current = isWide
    layoutChanged(isWide)
  }, [isWide])
  const [goalMonth, setGoalMonth] = useState<CalendarMonth | null>(null)
  const [goalOpen, setGoalOpen] = useState(false)

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
    showMonth(routeMonth)
  })

  useEffect(
    () => navigation.addListener('blur', () => setGoalOpen(false)),
    [navigation]
  )

  useEffect(() => {
    if (Platform.OS !== 'android' || !goalOpen) return
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        setGoalOpen(false)
        return true
      }
    )
    return () => subscription.remove()
  }, [goalOpen])

  const linkedDate = route.params?.date
  useEffect(() => {
    if (!linkedDate) return
    const date = moment(linkedDate, 'YYYY-MM-DD', true)
    navigation.setParams({ date: undefined })
    if (!date.isValid()) return

    if (
      isWide ||
      view === 'year' ||
      !revealDay(date.toDate(), sheetHeight.current)
    )
      showMonth({ year: date.year(), month: date.month() })
    if (isWide) dayInView.current = true
    setSelectedDateSheet({ open: !isWide, date: date.toDate() })
  }, [linkedDate, isWide, view, navigation, showMonth, revealDay])

  const bars = useHideBarsOnScroll({ paused: selectedDateSheet.open })

  const selectedDate = selectedDateSheet.date
  const selectedMonthReports =
    getMonthsReports(
      serviceReports,
      selectedDate.getMonth(),
      selectedDate.getFullYear()
    ) ?? []

  const sheetHeight = useRef(0)
  const pressDay = (date: Date) => {
    if (isWide) dayInView.current = true
    setSelectedDateSheet({ open: !isWide, date })
    if (!isWide && sheetHeight.current) revealDay(date, sheetHeight.current)
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
        isWide || selectedDateSheet.open
          ? moment(selectedDate).format('YYYY-MM-DD')
          : undefined
      }
      bottomInset={bottomInset}
      scrollBars={bars.scrollProps}
      onPressDay={pressDay}
      editableGoal={editableGoal}
      onEditGoal={openGoalEditor}
    />
  )

  const header = (
    <ScrollAwayHeader hidden={bars.hidden}>
      <RootHeader
        title={i18n.t('Schedule')}
        actions={
          <ScheduleViewToggle
            value={view}
            onChange={(next) => changeView(next, 'toggle')}
          />
        }
        contentStyle={
          isWide ? { paddingHorizontal: 0 } : [{ maxWidth: 720 }, foldColumn]
        }
      >
        {}
        <View
          style={
            isWide
              ? undefined
              : [
                  { width: '100%', maxWidth: 720, alignSelf: 'center' },
                  foldColumn,
                ]
          }
        >
          <BuddiesEntryRow
            source='schedule_row'
            style={{ marginHorizontal: 15, marginBottom: 8 }}
          />
        </View>
      </RootHeader>
    </ScrollAwayHeader>
  )

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {}
      <FoldSplit
        style={{
          flex: 1,
          width: '100%',
          maxWidth: isWide ? 1200 : undefined,
          alignSelf: 'center',
        }}
        paddingHorizontal={isWide ? 15 : 0}
        gap={20}
        leadingFraction={0.58}
        leading={
          <View style={{ flex: 1 }}>
            {header}
            <View
              style={
                isWide
                  ? { flex: 1 }
                  : [
                      {
                        flex: 1,
                        width: '100%',
                        maxWidth: 720,
                        alignSelf: 'center',
                      },
                      foldColumn,
                    ]
              }
            >
              {stage}
            </View>
          </View>
        }
        trailingStyle={isWide ? { paddingTop: insets.top + 8 } : undefined}
        trailing={
          isWide ? (
            <ScrollView
              style={{ flex: 1 }}
              scrollsToTop={false}
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
              <ScheduleScreenSections
                month={focused.month}
                year={focused.year}
              />
            </ScrollView>
          ) : undefined
        }
      />
      {!isWide && (
        <SelectedDateSheet
          sheet={selectedDateSheet}
          setSheet={setSelectedDateSheet}
          thisMonthsReports={selectedMonthReports}
          onHeightChange={(height) => {
            sheetHeight.current = height
            coverBottom(height)
            if (height) revealDay(selectedDate, height)
          }}
          renderPlanForm={renderDaySheetPlanForm}
          renderPlanDetails={daySheetPlanDetails}
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
