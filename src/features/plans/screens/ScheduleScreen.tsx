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
import BuddiesHeaderButton from '@/features/buddies/components/BuddiesHeaderButton'
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

type Props = BottomTabScreenProps<HomeTabStackParamList, 'Schedule'>

const ScheduleScreen = ({ route, navigation }: Props) => {
  const theme = useTheme()
  const { isWide, hasBottomBar } = useAdaptiveLayout()
  const insets = useSafeAreaInsets()
  const tabBarHeight = useBottomTabBarHeight()
  const serviceReports = useServiceReport((s) => s.serviceReports)
  useSyncBuddiesOnFocus()
  const openIntro = useScheduleIntro((s) => s.open)
  const isFocused = useIsFocused()
  // The first visit explains how to get the most from Schedule. It may wait
  // for its takeover turn (the update reveal first); leaving Schedule before
  // then takes it back, so it never opens over another tab.
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
  const calendar = useScheduleCalendar({ initial: routeMonth })
  // Taken out up front: `calendar` itself changes with each month scrolled
  // into focus, and whatever closes over it would re-render with it.
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

  // Tapping Schedule again comes back to today, as its Today button does.
  useTabReselect(() => {
    if (view === 'month') jumpToToday()
    else showCurrentServiceYear()
  })

  const [selectedDateSheet, setSelectedDateSheet] =
    useState<SelectedDateSheetState>({ open: false, date: new Date() })

  // A wide window shows the day in the inspector instead of its sheet. Opening
  // iPhone Duo with no day open shows one in the month on screen; closing it
  // again opens the sheet on the day that was open or picked beside it.
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
    showMonth(routeMonth)
  })

  // The goal editor is modal and this tab stays mounted, so it would cover
  // whatever screen a widget or tab switch opens next. The day's sheet steps
  // aside by itself and comes back with the tab.
  useEffect(
    () => navigation.addListener('blur', () => setGoalOpen(false)),
    [navigation]
  )

  // Android's back button closes the goal editor rather than leaving the tab
  // with it. The day's sheet handles its own: back from its time form returns
  // to the day.
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

  // A Calendar widget day (`witnesswork://schedule/:date`) opens that day the
  // same way tapping it here does: the sheet, or the inspector when wide.
  const linkedDate = route.params?.date
  useEffect(() => {
    if (!linkedDate) return
    const date = moment(linkedDate, 'YYYY-MM-DD', true)
    navigation.setParams({ date: undefined })
    if (!date.isValid()) return
    // The sheet brings the day's week into view above it as it opens (or now,
    // if it's open), which focuses its month. A scroll to the month would land
    // after that and hide the week again, so it's only for the inspector, the
    // Year view, and a day the list hasn't loaded.
    if (
      isWide ||
      view === 'year' ||
      !revealDay(date.toDate(), sheetHeight.current)
    )
      showMonth({ year: date.year(), month: date.month() })
    if (isWide) dayInView.current = true
    setSelectedDateSheet({ open: !isWide, date: date.toDate() })
  }, [linkedDate, isWide, view, navigation, showMonth, revealDay])

  // A day's sheet holds the bars as they are: it keeps the day it opened on
  // in view above itself, measured with the header where it is.
  const bars = useHideBarsOnScroll({ paused: selectedDateSheet.open })

  const selectedDate = selectedDateSheet.date
  const selectedMonthReports =
    getMonthsReports(
      serviceReports,
      selectedDate.getMonth(),
      selectedDate.getFullYear()
    ) ?? []

  // The day's sheet covers the bottom of the calendar. The day picked stays
  // in view above it, and stays marked while the sheet is open.
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
          <>
            <ScheduleViewToggle
              value={view}
              onChange={(next) => changeView(next, 'toggle')}
            />
            {/* Phones show the label only where the title still fits beside
                it; it's easy to miss as an icon. */}
            <BuddiesHeaderButton compact={isWide ? false : 'auto'} />
          </>
        }
        contentStyle={isWide ? { paddingHorizontal: 0 } : { maxWidth: 720 }}
      />
    </ScrollAwayHeader>
  )

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* One tree either way, so opening or closing iPhone Duo keeps the
          calendar on the month it was showing. */}
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
        // The header's controls are the calendar's, as in Mail, so when wide
        // it sits above it and the day beside it reaches the top.
        leading={
          <View style={{ flex: 1 }}>
            {header}
            <View
              style={
                isWide
                  ? { flex: 1 }
                  : {
                      flex: 1,
                      width: '100%',
                      maxWidth: 720,
                      alignSelf: 'center',
                    }
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
              // A status bar tap would scroll this column once the calendar
              // stops taking it; the screen ignores the tap instead.
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
