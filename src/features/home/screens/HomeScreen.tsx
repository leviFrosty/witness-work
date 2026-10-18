import { perf } from '@/lib/perf'
import useTheme from '@/contexts/theme'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import useRevealAboveSheet from '@/hooks/useRevealAboveSheet'
import useHideBarsOnScroll from '@/hooks/useHideBarsOnScroll'
import ScrollAwayHeader from '@/components/ui/ScrollAwayHeader'
import { ReactNode, useState } from 'react'
import ApproachingConversations from '@/features/visits/components/ApproachingConversations'
import { Pressable, RefreshControl, View } from 'react-native'
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
import { renderDaySheetPlanForm } from '@/features/plans/components/PlanDayForm'
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
import HomeGreeting from '@/features/profile/components/HomeGreeting'
import HomeNewBadgeCard from '@/features/badges/components/HomeNewBadgeCard'
import HomeChecklist from '@/features/onboarding/components/HomeChecklist'
import TodayRouteAction from '@/features/route-planning/components/TodayRouteAction'
import TodayRouteEntry from '@/features/route-planning/components/TodayRouteEntry'
import MileagePromptCard from '@/features/mileage/components/MileagePromptCard'
import MileageHomeSection from '@/features/mileage/components/MileageHomeSection'
import DidYouKnowTipCard from '@/features/updates/components/DidYouKnowTipCard'
import NotificationHosts from '@/app/notifications/NotificationHosts'
import { useServiceReport } from '@/stores/serviceReport'
import useLocalDay from '@/hooks/useLocalDay'
import { useShallow } from 'zustand/react/shallow'
import { HomeTabStackNavigation } from '@/types/homeStack'
import { TAB_BAR_HEIGHT } from '@/components/ui/TabBar'
import ReorderableContainer from '@/components/ui/reorderable/ReorderableContainer'
import ReorderableItem from '@/components/ui/reorderable/ReorderableItem'
import ReorderableItemBox from '@/components/ui/reorderable/ReorderableItemBox'
import useReorderScroller from '@/components/ui/reorderable/useReorderScroller'
import HomeAddSectionsSheet from '@/components/HomeAddSectionsSheet'
import HomeEmptySectionPlaceholder from '@/components/HomeEmptySectionPlaceholder'
import useHomeEditing from '@/hooks/useHomeEditing'
import {
  hideHomeSection,
  homeSectionTitle,
  moveHomeSectionTo,
  showHomeSection,
} from '@/lib/homeSections'
import useAvailableHomeSections from '@/hooks/useAvailableHomeSections'

const SECTION_GAP = 20

// Pull first so any remote-side changes land before we push ours — avoids a
// fight between two devices that both just pulled to refresh.
const pullThenPush = async () => {
  await iCloudSync.pullAndMerge('pull-to-refresh')
  await iCloudSync.push('pull-to-refresh')
}

export const HomeScreen = ({ header }: { header: ReactNode }) => {
  perf.count('render:Home')
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { isWide, hasSidebar, contentMaxWidth } = useAdaptiveLayout()
  const {
    homeChecklistDismissed,
    iCloudSyncEnabled,
    homeScreenElements,
    homeScreenElementsOrder,
    mileageTrackingEnabled,
  } = usePreferences(
    useShallow((s) => ({
      homeChecklistDismissed: s.homeChecklistDismissed,
      iCloudSyncEnabled: s.iCloudSyncEnabled,
      homeScreenElements: s.homeScreenElements,
      homeScreenElementsOrder: s.homeScreenElementsOrder,
      mileageTrackingEnabled: s.mileageTrackingEnabled,
    }))
  )
  const serviceReports = useServiceReport((s) => s.serviceReports)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedDateSheet, setSelectedDateSheet] =
    useState<SelectedDateSheetState>({
      open: false,
      date: new Date(),
    })

  const handleRefresh = () => {
    setRefreshing(true)
    return pullThenPush().finally(() => setRefreshing(false))
  }
  const { isTablet } = useDevice()
  const { hasAnnualGoal, showsTimer } = usePublisher()
  const effectiveOrder = getEffectiveHomeScreenOrder(homeScreenElementsOrder)
  // Anchor the "Did you know" tip card to the bottom of the scroll view only
  // when the user has it in its default trailing position. Once they reorder
  // it inline, drop the auto-margin so it flows with surrounding sections.
  const isDidYouKnowLast =
    effectiveOrder[effectiveOrder.length - 1] === 'didYouKnow'
  const navigation = useNavigation<HomeTabStackNavigation>()
  // Keyed on the day so the compiled screen moves on at midnight.
  const today = moment(useLocalDay(), 'YYYY-MM-DD')
  const serviceYear = getServiceYearFromDate(today)
  const currentMonth = today.month()
  const currentYear = today.year()
  const currentMonthsReports = getMonthsReports(
    serviceReports,
    currentMonth,
    currentYear
  )
  const selectedDateReports = getMonthsReports(
    serviceReports,
    moment(selectedDateSheet.date).month(),
    moment(selectedDateSheet.date).year()
  )

  const [milestoneSheetOpen, setMilestoneSheetOpen] = useState(false)
  const viewServiceYear = () =>
    navigation.navigate('Progress', {
      month: moment().month(),
      year: moment().year(),
      tab: 'year',
    })

  // Legacy upgrade flow is now subsumed by the boot-time tag → Category
  // migration (`src/lib/categories.ts`). Categories carry their own
  // `isCredit` invariant, so the user no longer needs to retroactively
  // classify free-text tag strings. The state remains hard-wired to false so
  // the sheet stays mounted-but-inert for one release window; removing the
  // component entirely is deferred to a follow-up.
  const [upgradeReportsSheet, setUpgradeReportSheet] = useState(false)
  const weekStrip = useRevealAboveSheet()
  // Home's jiggle mode: sections move, hide and come back.
  const homeEditing = useHomeEditing({ lifecycle: true })
  const { editing } = homeEditing
  const [dragging, setDragging] = useState(false)
  const scroll = useReorderScroller(weekStrip.scrollRef, {
    obscuredBottom: hasSidebar ? 0 : insets.bottom + TAB_BAR_HEIGHT,
  })
  const sections = useAvailableHomeSections()
  const shownSections = sections.available.filter(
    (key) => !sections.hidden.includes(key)
  )

  // A day's sheet holds the bars as they are: it keeps the day it opened on
  // in view above itself, measured with the header where it is. Editing keeps
  // them, since the header holds Done.
  const bars = useHideBarsOnScroll({
    enabled: !editing,
    paused: selectedDateSheet.open,
  })
  return (
    <View
      ref={scroll.frameRef}
      collapsable={false}
      style={{ flexGrow: 1, backgroundColor: theme.colors.background }}
    >
      <ScrollAwayHeader hidden={bars.hidden}>{header}</ScrollAwayHeader>
      <KeyboardAwareScrollView
        ref={weekStrip.scrollRef}
        {...bars.scrollProps}
        onScroll={(e) => {
          scroll.props.onScroll(e)
          weekStrip.onScroll(e)
          bars.onScroll(e)
        }}
        onLayout={(e) => {
          scroll.props.onLayout()
          bars.scrollProps.onLayout(e)
        }}
        onContentSizeChange={(width, height) => {
          scroll.props.onContentSizeChange(width, height)
          bars.scrollProps.onContentSizeChange(width, height)
        }}
        scrollEnabled={!dragging}
        contentContainerStyle={{
          paddingBottom:
            insets.bottom + (hasSidebar ? 30 : 85) + weekStrip.bottomInset,
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
          iCloudSyncEnabled && !editing ? (
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
        {/* Like empty space, tapping these while editing ends it. */}
        <Pressable disabled={!editing} onPress={homeEditing.finish}>
          <View pointerEvents={editing ? 'none' : 'auto'}>
            <HomeGreeting />
            {/* Full width above the columns, which alternate their children. */}
            <HomeNewBadgeCard style={{ marginBottom: 20 }} />
          </View>
        </Pressable>
        {editing ? (
          <Text
            style={{
              textAlign: 'center',
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
              marginBottom: 14,
            }}
          >
            {i18n.t('homeEdit.hint')}
          </Text>
        ) : null}
        <ReorderableContainer
          editing={editing}
          onMove={moveHomeSectionTo}
          onBackgroundLongPress={() => homeEditing.start('background')}
          onBackgroundPress={homeEditing.finish}
          onDragChange={setDragging}
          scroller={scroll.scroller}
          style={{ flex: 1 }}
        >
          <AdaptiveColumns
            wide={isWide}
            style={{ paddingBottom: insets.bottom }}
          >
            {!homeChecklistDismissed && (
              // Getting started stays put; holding it doesn't edit Home.
              <ReorderableItem id='checklist' locked gap={SECTION_GAP}>
                <HomeChecklist />
              </ReorderableItem>
            )}
            {effectiveOrder.map((key: HomeScreenElementKey) => {
              const section = (() => {
                switch (key) {
                  case 'approachingConversations':
                    // Missed Follow-ups live in the notifications tray.
                    if (!homeScreenElements.approachingConversations)
                      return null
                    return (
                      <ApproachingConversations
                        key={key}
                        headerAction={<TodayRouteAction />}
                      />
                    )
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
                        {/* The badge goes on the card, not the heading. */}
                        <ReorderableItemBox>
                          <HomeSectionMenu
                            section='tabletServiceYearSummary'
                            onPress={viewServiceYear}
                            accessibilityLabel={i18n.t('viewYear')}
                            hoverRadius={theme.numbers.borderRadiusLg}
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
                        </ReorderableItemBox>
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
                    // Its item is measured to keep the week above the day's
                    // sheet (see `viewRef` below).
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
                      // Its item takes the bottom anchor (see `style` below).
                      <DidYouKnowTipCard key={key} />
                    )
                  default:
                    return null
                }
              })()
              if (!section) return null
              const isPrompt =
                key === 'mileage' && mileageTrackingEnabled === undefined
              const title = homeSectionTitle(key)
              // Screen readers can't drag: they move a section past the next
              // shown one instead.
              const at = shownSections.indexOf(key)
              const before = shownSections[at - 1]
              const after = shownSections[at + 1]
              return (
                <ReorderableItem
                  key={key}
                  id={key}
                  // Holding a section opens its menu, which has Edit Home Screen.
                  liftOutsideEditing={false}
                  // The mileage question stays until it's answered.
                  onRemove={isPrompt ? undefined : () => hideHomeSection(key)}
                  removeLabel={i18n.t('homeEdit.removeA11y', {
                    section: title,
                  })}
                  accessibilityLabel={title}
                  accessibilityActions={[
                    ...(before
                      ? [{ name: 'earlier', label: i18n.t('moveUp') }]
                      : []),
                    ...(after
                      ? [{ name: 'later', label: i18n.t('moveDown') }]
                      : []),
                    ...(isPrompt
                      ? []
                      : [{ name: 'remove', label: i18n.t('homeEdit.remove') }]),
                  ]}
                  onAccessibilityAction={(name) => {
                    if (name === 'remove') hideHomeSection(key)
                    else if (name === 'earlier' && before)
                      moveHomeSectionTo(key, before)
                    else if (name === 'later' && after)
                      moveHomeSectionTo(key, after)
                  }}
                  viewRef={key === 'thisWeek' ? weekStrip.targetRef : undefined}
                  // Sections with nothing to show today leave no gap.
                  gap={SECTION_GAP}
                  emptyPlaceholder={
                    <HomeEmptySectionPlaceholder title={title} />
                  }
                  style={
                    key === 'didYouKnow' && !isWide && isDidYouKnowLast
                      ? { marginTop: 'auto' }
                      : undefined
                  }
                >
                  {section}
                </ReorderableItem>
              )
            })}
          </AdaptiveColumns>
        </ReorderableContainer>
      </KeyboardAwareScrollView>
      <HomeAddSectionsSheet
        open={homeEditing.adding}
        onClose={() => homeEditing.setAdding(false)}
        sections={sections.available}
        hidden={sections.hidden}
        onAdd={showHomeSection}
      />
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
        onHeightChange={weekStrip.onSheetHeightChange}
        renderPlanForm={renderDaySheetPlanForm}
        renderFooter={(date, onNavigate) => (
          <TodayRouteEntry
            date={date}
            surface='home_day'
            onNavigate={onNavigate}
          />
        )}
      />
    </View>
  )
}
