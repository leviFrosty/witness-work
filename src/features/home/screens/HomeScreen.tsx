import useTheme from '@/contexts/theme'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ApproachingConversations from '@/features/visits/components/ApproachingConversations'
import { RefreshControl, View } from 'react-native'
import { iCloudSync } from '@/app/sync/iCloudSync'
import ServiceReportSection from '@/features/service-reports/components/ServiceReportSection'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AdaptiveColumns from '@/components/ui/layout/AdaptiveColumns'
import YearMilestoneCard from '@/components/YearMilestoneCard'
import moment from 'moment'
import useDevice from '@/hooks/useDevice'
import { getMonthsReports } from '@/lib/serviceReport'
import { getServiceYearFromDate } from '@/lib/serviceYear'
import WeekStripTeaser from '@/features/service-reports/components/WeekStripTeaser'
import SelectedDateSheet, {
  SelectedDateSheetState,
} from '@/features/service-reports/components/SelectedDateSheet'
import i18n from '@/lib/locales'
import Text from '@/components/ui/MyText'
import HomeSectionMenu from '@/components/HomeSectionMenu'
import MilestoneAdjustSheet from '@/features/progress/components/MilestoneAdjustSheet'
import { useNavigation } from '@react-navigation/native'
import usePublisher from '@/hooks/usePublisher'
import {
  getEffectiveHomeScreenOrder,
  HomeScreenElementKey,
  usePreferences,
} from '@/stores/preferences'
import { TimerSection } from '@/features/service-reports/components/TimerSection'
import UpgradeLegacyTimeReportsSheet from '@/features/service-reports/components/UpgradeLegacyTimeReportsSheet'
import ProfileCard from '@/features/profile/components/ProfileCard'
import HomeChecklist from '@/features/onboarding/components/HomeChecklist'
import MileagePromptCard from '@/features/mileage/components/MileagePromptCard'
import MileageHomeSection from '@/features/mileage/components/MileageHomeSection'
import DidYouKnowTipCard from '@/features/updates/components/DidYouKnowTipCard'
import NotificationHosts from '@/app/notifications/NotificationHosts'
import { useServiceReport } from '@/stores/serviceReport'
import { HomeTabStackNavigation } from '@/types/homeStack'
import { RootStackNavigation } from '@/types/rootStack'
import type { TimeEntry } from '@/types/timeEntry'

export const HomeScreen = () => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { isWide, hasSidebar, contentMaxWidth } = useAdaptiveLayout()
  const { homeChecklistDismissed, iCloudSyncEnabled } = usePreferences()
  const { serviceReports } = useServiceReport()
  const [refreshing, setRefreshing] = useState(false)
  const [selectedDateSheet, setSelectedDateSheet] =
    useState<SelectedDateSheetState>({
      open: false,
      date: new Date(),
    })
  const pendingNavigation = useRef<(() => void) | null>(null)

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      // Pull first so any remote-side changes land before we push ours —
      // avoids a fight between two devices that both just pulled to refresh.
      await iCloudSync.pullAndMerge('pull-to-refresh')
      await iCloudSync.push('pull-to-refresh')
    } finally {
      setRefreshing(false)
    }
  }, [])
  const { isTablet } = useDevice()
  const { hasAnnualGoal, showsTimer } = usePublisher()
  const {
    homeScreenElements,
    homeScreenElementsOrder,
    mileageTrackingEnabled,
  } = usePreferences()
  const effectiveOrder = useMemo(
    () => getEffectiveHomeScreenOrder(homeScreenElementsOrder),
    [homeScreenElementsOrder]
  )
  // Anchor the "Did you know" tip card to the bottom of the scroll view only
  // when the user has it in its default trailing position. Once they reorder
  // it inline, drop the auto-margin so it flows with surrounding sections.
  const isDidYouKnowLast =
    effectiveOrder[effectiveOrder.length - 1] === 'didYouKnow'
  const navigation = useNavigation<HomeTabStackNavigation>()
  const rootNavigation = useNavigation<RootStackNavigation>()
  const serviceYear = getServiceYearFromDate(moment())
  const currentMonth = moment().month()
  const currentYear = moment().year()
  const currentMonthsReports = useMemo(
    () => getMonthsReports(serviceReports, currentMonth, currentYear),
    [serviceReports, currentMonth, currentYear]
  )
  const selectedDateReports = useMemo(
    () =>
      getMonthsReports(
        serviceReports,
        moment(selectedDateSheet.date).month(),
        moment(selectedDateSheet.date).year()
      ),
    [selectedDateSheet.date, serviceReports]
  )

  const [milestoneSheetOpen, setMilestoneSheetOpen] = useState(false)
  const viewServiceYear = () =>
    navigation.navigate('Progress', {
      month: moment().month(),
      year: moment().year(),
      tab: 'year',
    })

  const handleAddTime = () => {
    const date = selectedDateSheet.date.toISOString()
    pendingNavigation.current = () => {
      rootNavigation.navigate('Add Time', { date })
    }
  }

  const handlePlanDay = () => {
    const date = selectedDateSheet.date.toISOString()
    pendingNavigation.current = () => {
      rootNavigation.navigate('PlanDay', { date })
    }
  }

  const handleNavigateToPlanDay = (existingDayPlanId: string) => {
    const date = selectedDateSheet.date.toISOString()
    pendingNavigation.current = () => {
      rootNavigation.navigate('PlanDay', { date, existingDayPlanId })
    }
  }

  const handleNavigateToRecurringPlan = (
    existingRecurringPlanId: string,
    recurringPlanDate: string
  ) => {
    const date = selectedDateSheet.date.toISOString()
    pendingNavigation.current = () => {
      rootNavigation.navigate('PlanDay', {
        date,
        existingRecurringPlanId,
        recurringPlanDate,
      })
    }
  }

  const handleEditTimeReport = (report: TimeEntry) => {
    pendingNavigation.current = () => {
      rootNavigation.navigate('Add Time', {
        existingReport: JSON.stringify(report),
      })
    }
  }

  useEffect(() => {
    if (!selectedDateSheet.open && pendingNavigation.current) {
      const callback = pendingNavigation.current
      pendingNavigation.current = null
      setTimeout(callback, 125)
    }
  }, [selectedDateSheet.open])

  // Legacy upgrade flow is now subsumed by the boot-time tag → Category
  // migration (`src/lib/categories.ts`). Categories carry their own
  // `isCredit` invariant, so the user no longer needs to retroactively
  // classify free-text tag strings. The state remains hard-wired to false so
  // the sheet stays mounted-but-inert for one release window; removing the
  // component entirely is deferred to a follow-up.
  const [upgradeReportsSheet, setUpgradeReportSheet] = useState(false)
  return (
    <View style={{ flexGrow: 1, backgroundColor: theme.colors.background }}>
      <KeyboardAwareScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + (hasSidebar ? 30 : 85),
          paddingHorizontal: isWide ? 24 : 15,
          paddingTop: 15,
          width: '100%',
          maxWidth: isWide ? contentMaxWidth : 720,
          alignSelf: 'center',
          // flexGrow lets the inner View's `flex: 1` actually fill the
          // viewport when the user's home sections are short, which the tip
          // card's `marginTop: 'auto'` relies on to anchor to the bottom.
          flexGrow: 1,
        }}
        automaticallyAdjustKeyboardInsets
        style={{
          flex: 1,
          paddingBottom: hasSidebar ? 0 : insets.bottom + 50,
        }}
        refreshControl={
          iCloudSyncEnabled ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.accent}
              progressViewOffset={16}
              style={{ transform: [{ scale: 0.85 }] }}
            />
          ) : undefined
        }
      >
        <AdaptiveColumns wide={isWide} style={{ paddingBottom: insets.bottom }}>
          <ProfileCard
            onPressIncomplete={() =>
              rootNavigation.navigate('PreferencesPublisher')
            }
          />
          {!homeChecklistDismissed && <HomeChecklist />}
          {effectiveOrder.map((key: HomeScreenElementKey) => {
            const section = (() => {
              switch (key) {
                case 'approachingConversations':
                  // Missed Follow-ups live in the notifications tray.
                  if (!homeScreenElements.approachingConversations) return null
                  return <ApproachingConversations key={key} />
                case 'tabletServiceYearSummary':
                  if (
                    !isTablet ||
                    !hasAnnualGoal ||
                    !homeScreenElements.tabletServiceYearSummary
                  ) {
                    return null
                  }
                  return (
                    <View key={key} style={{ gap: 10 }}>
                      <Text
                        style={{
                          fontSize: 14,
                          fontFamily: theme.fonts.semiBold,
                          marginLeft: 5,
                        }}
                      >
                        {i18n.t('serviceYearSummary')}
                      </Text>
                      <HomeSectionMenu
                        section='tabletServiceYearSummary'
                        onPress={viewServiceYear}
                        accessibilityLabel={i18n.t('viewYear')}
                        actions={[
                          {
                            id: 'view_year',
                            title: i18n.t('viewYear'),
                            systemImage: 'chart.line.uptrend.xyaxis',
                            onPress: viewServiceYear,
                          },
                          {
                            id: 'adjust_milestones',
                            title: i18n.t('adjustMilestonesEllipsis'),
                            systemImage: 'flag',
                            onPress: () => setMilestoneSheetOpen(true),
                          },
                        ]}
                      >
                        <YearMilestoneCard year={serviceYear + 1} />
                      </HomeSectionMenu>
                    </View>
                  )
                case 'serviceReport':
                  if (!homeScreenElements.serviceReport) return null
                  return <ServiceReportSection key={key} />
                case 'mileage':
                  // Until answered, the opt-in prompt holds Mileage's slot.
                  if (mileageTrackingEnabled === undefined)
                    return <MileagePromptCard key={key} />
                  if (
                    mileageTrackingEnabled !== true ||
                    homeScreenElements.mileage === false
                  )
                    return null
                  return <MileageHomeSection key={key} />

                case 'thisWeek':
                  if (!homeScreenElements.thisWeek) return null
                  return (
                    <WeekStripTeaser
                      key={key}
                      month={currentMonth}
                      year={currentYear}
                      monthsReports={currentMonthsReports}
                      onSelectDay={(date) =>
                        setSelectedDateSheet({ open: true, date })
                      }
                    />
                  )
                case 'timer':
                  if (!showsTimer || !homeScreenElements.timer) return null
                  return <TimerSection key={key} />
                case 'didYouKnow':
                  if (homeScreenElements.didYouKnow === false) return null
                  return (
                    <DidYouKnowTipCard
                      key={key}
                      style={
                        !isWide && isDidYouKnowLast
                          ? { marginTop: 'auto' }
                          : undefined
                      }
                    />
                  )
                default:
                  return null
              }
            })()
            return section
          })}
        </AdaptiveColumns>
      </KeyboardAwareScrollView>
      {isTablet && hasAnnualGoal && (
        <MilestoneAdjustSheet
          visible={milestoneSheetOpen}
          onClose={() => setMilestoneSheetOpen(false)}
        />
      )}
      <UpgradeLegacyTimeReportsSheet
        sheet={upgradeReportsSheet}
        setSheet={setUpgradeReportSheet}
      />
      <NotificationHosts />
      <SelectedDateSheet
        sheet={selectedDateSheet}
        setSheet={setSelectedDateSheet}
        thisMonthsReports={selectedDateReports}
        onAddTime={handleAddTime}
        onPlanDay={handlePlanDay}
        onNavigateToPlanDay={handleNavigateToPlanDay}
        onNavigateToRecurringPlan={handleNavigateToRecurringPlan}
        onEditTimeReport={handleEditTimeReport}
      />
    </View>
  )
}
