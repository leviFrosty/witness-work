import { perf } from '@/lib/perf'
import useTheme from '@/contexts/theme'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import useRevealAboveSheet from '@/hooks/useRevealAboveSheet'
import useHideBarsOnScroll from '@/hooks/useHideBarsOnScroll'
import useTabReselect from '@/hooks/useTabReselect'
import useScrollAnchor from '@/hooks/useScrollAnchor'
import ScrollAwayHeader from '@/components/ui/ScrollAwayHeader'
import { ReactElement, ReactNode, useState } from 'react'
import ApproachingConversations from '@/features/visits/components/ApproachingConversations'
import { Pressable, RefreshControl, View } from 'react-native'
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
import { daySheetPlanDetails } from '@/features/plans/components/DaySheetPlanDetails'
import SelectedDateSheet, {
  SelectedDateSheetState,
} from '@/features/service-reports/components/SelectedDateSheet'
import i18n from '@/lib/locales'
import Text from '@/components/ui/MyText'
import HomeSectionMenu from '@/components/HomeSectionMenu'
import MilestoneAdjustSheet from '@/features/progress/components/MilestoneAdjustSheet'
import { useNavigation } from '@react-navigation/native'
import usePublisher from '@/hooks/usePublisher'
import { HomeScreenElementKey, usePreferences } from '@/stores/preferences'
import { TimerSection } from '@/features/service-reports/components/TimerSection'
import UpgradeLegacyTimeReportsSheet from '@/features/service-reports/components/UpgradeLegacyTimeReportsSheet'
import HomeGreeting from '@/features/profile/components/HomeGreeting'
import EditLayoutButton from '@/components/ui/EditLayoutButton'
import HomeChecklist from '@/features/onboarding/components/HomeChecklist'
import TodayRouteAction from '@/features/route-planning/components/TodayRouteAction'
import TodayRouteEntry from '@/features/route-planning/components/TodayRouteEntry'
import MileagePromptCard from '@/features/mileage/components/MileagePromptCard'
import TerritoryHomeCard from '@/features/territories/components/TerritoryHomeCard'
import RoutineHomeSection from '@/features/routine/components/RoutineHomeSection'
import RoutinePromptCard from '@/features/routine/components/RoutinePromptCard'
import MileageHomeSection from '@/features/mileage/components/MileageHomeSection'
import type PetPromptCardComponent from '@/features/pet/components/PetPromptCard'
import type PetHomeSectionComponent from '@/features/pet/components/PetHomeSection'
import type ScribeQuickActionsCardComponent from '@/features/scribe/components/ScribeQuickActionsCard'
import usePet from '@/stores/pet'
import { hidePetVisits } from '@/app/pet/hidePetVisits'
import usePetVisits from '@/app/pet/usePetVisits'
import DidYouKnowTipCard from '@/features/updates/components/DidYouKnowTipCard'
import { pullToRefresh } from '@/lib/pullToRefresh'
import BuddiesHomeSection from '@/features/buddies/components/BuddiesHomeSection'
import BuddyStreaks from '@/features/buddies/components/BuddyStreaks'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
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
import { useFoldColumn } from '@/components/ui/layout/FoldPane'
import { pageFrameInset } from '@/components/ui/layout/pageLayout'
import { canvasKitComponent } from '@/lib/canvasKit/canvasKitComponent'

const SECTION_GAP = 20

export const HomeScreen = ({ header }: { header: ReactNode }) => {
  perf.count('render:Home')
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { isWide, hasBottomBar } = useAdaptiveLayout()

  const foldColumn = useFoldColumn(isWide ? null : 720)
  const { mileageTrackingEnabled, routineEnabled } = usePreferences(
    useShallow((s) => ({
      routineEnabled: s.routineEnabled,
      mileageTrackingEnabled: s.mileageTrackingEnabled,
    }))
  )
  const hasPet = usePet((s) => s.pet !== null)

  const petVisits = usePetVisits()
  const serviceReports = useServiceReport((s) => s.serviceReports)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedDateSheet, setSelectedDateSheet] =
    useState<SelectedDateSheetState>({
      open: false,
      date: new Date(),
    })

  const handleRefresh = () => {
    setRefreshing(true)
    return pullToRefresh().finally(() => setRefreshing(false))
  }
  const { isTablet } = useDevice()
  const { hasAnnualGoal } = usePublisher()
  const navigation = useNavigation<HomeTabStackNavigation>()

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

  const [upgradeReportsSheet, setUpgradeReportSheet] = useState(false)
  const weekStrip = useRevealAboveSheet()

  const buddiesAvailable = useBuddiesEnabled()
  const homeEditing = useHomeEditing({ lifecycle: true, buddiesAvailable })
  const { editing } = homeEditing
  const [dragging, setDragging] = useState(false)
  const scroll = useReorderScroller(weekStrip.scrollRef, {
    obscuredBottom: hasBottomBar ? insets.bottom + TAB_BAR_HEIGHT : 0,
  })
  const sections = useAvailableHomeSections({ buddiesAvailable })
  const shownSections = sections.shown

  const sectionContent: Record<HomeScreenElementKey, () => ReactElement> = {
    checklist: () => <HomeChecklist />,
    approachingConversations: () => (
      <ApproachingConversations headerAction={<TodayRouteAction />} />
    ),
    territories: () => <TerritoryHomeCard />,
    together: () => <BuddiesHomeSection />,
    tabletServiceYearSummary: () => (
      <View style={{ gap: 10 }}>
        <Text
          style={{
            fontSize: 14,
            fontFamily: theme.fonts.semiBold,
            marginLeft: 5,
          }}
        >
          {i18n.t('serviceYearSummary')}
        </Text>
        <ReorderableItemBox>
          <HomeSectionMenu
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
    ),
    serviceReport: () => <ServiceReportSection />,
    mileage: () =>
      mileageTrackingEnabled === undefined ? (
        <MileagePromptCard />
      ) : (
        <MileageHomeSection />
      ),
    pet: () =>
      hasPet ? (
        <PetHomeSection visits={petVisits} onHideVisit={hidePetVisits} />
      ) : (
        <PetPromptCard />
      ),
    routine: () =>
      routineEnabled === undefined ? (
        <RoutinePromptCard />
      ) : (
        <RoutineHomeSection />
      ),
    quickActions: () => <QuickActionsCard />,
    thisWeek: () => (
      <WeekStripTeaser
        month={currentMonth}
        year={currentYear}
        monthsReports={currentMonthsReports}
        onSelectDay={(date) => setSelectedDateSheet({ open: true, date })}
      />
    ),
    timer: () => <TimerSection />,
    didYouKnow: () => <DidYouKnowTipCard />,
  }

  const bars = useHideBarsOnScroll({
    enabled: !editing,
    paused: selectedDateSheet.open,
  })

  const [headerHeight, setHeaderHeight] = useState(0)

  const anchor = useScrollAnchor(isWide)
  const anchorScroll = anchor.scroll(
    'home',
    weekStrip.scrollRef,
    scroll.frameRef
  )

  useTabReselect(() => {
    anchor.reset()
    weekStrip.scrollRef.current?.scrollToPosition(0, 0, true)
  })
  return (
    <View
      ref={scroll.frameRef}
      collapsable={false}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <ScrollAwayHeader
        hidden={bars.hidden}
        overlay
        onHeightChange={setHeaderHeight}
      >
        {header}
      </ScrollAwayHeader>
      <KeyboardAwareScrollView
        ref={weekStrip.scrollRef}
        {...bars.scrollProps}
        onScrollBeginDrag={(e) => {
          bars.scrollProps.onScrollBeginDrag(e)
          anchorScroll.onScrollBeginDrag()
        }}
        onScrollEndDrag={() => {
          bars.scrollProps.onScrollEndDrag()
          anchorScroll.onScrollEndDrag()
        }}
        onMomentumScrollEnd={() => {
          bars.scrollProps.onMomentumScrollEnd()
          anchorScroll.onMomentumScrollEnd()
        }}
        onScrollToTop={() => {
          bars.scrollProps.onScrollToTop()
          anchor.reset()
        }}
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
          ...(isWide
            ? pageFrameInset
            : {
                paddingHorizontal: 15,
                width: '100%',
                maxWidth: 720,
                alignSelf: 'center',
              }),
          paddingTop: headerHeight + 15,

          flexGrow: 1,
          ...foldColumn,
        }}
        automaticallyAdjustKeyboardInsets
        automaticallyAdjustsScrollIndicatorInsets={false}
        scrollIndicatorInsets={{
          top: bars.hidden ? insets.top : headerHeight,
        }}
        style={{
          flex: 1,
          paddingBottom: hasBottomBar ? insets.bottom + 50 : 0,
        }}
        refreshControl={
          !editing ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.accent}
              progressViewOffset={headerHeight + 16}
              style={{ transform: [{ scale: 0.85 }] }}
            />
          ) : undefined
        }
      >
        {anchorScroll.origin}
        {}
        <Pressable
          disabled={!editing}
          onPress={homeEditing.finish}
          accessible={false}
          focusable={false}
          importantForAccessibility='no'
        >
          <View pointerEvents={editing ? 'none' : 'auto'}>
            <HomeGreeting
              buddyStreaks={({ closeThen }) => (
                <BuddyStreaks closeThen={closeThen} />
              )}
            />
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
            sectionRef={(key) => anchor.anchorRef(key, 'home')}
            bottomAnchorLast={shownSections.at(-1) === 'didYouKnow'}
          >
            {shownSections.map((key) => {
              const title = homeSectionTitle(key)

              const at = shownSections.indexOf(key)
              const before = shownSections[at - 1]
              const after = shownSections[at + 1]
              return (
                <ReorderableItem
                  key={key}
                  id={key}
                  liftOutsideEditing={false}
                  onRemove={() => hideHomeSection(key)}
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
                    { name: 'remove', label: i18n.t('homeEdit.remove') },
                  ]}
                  onAccessibilityAction={(name) => {
                    if (name === 'remove') hideHomeSection(key)
                    else if (name === 'earlier' && before)
                      moveHomeSectionTo(key, before)
                    else if (name === 'later' && after)
                      moveHomeSectionTo(key, after)
                  }}
                  viewRef={key === 'thisWeek' ? weekStrip.targetRef : undefined}
                  gap={SECTION_GAP}
                  emptyPlaceholder={
                    <HomeEmptySectionPlaceholder title={title} />
                  }
                >
                  {sectionContent[key]()}
                </ReorderableItem>
              )
            })}
          </AdaptiveColumns>
          {}
          {editing ? null : (
            <View style={{ paddingTop: 32 }}>
              <EditLayoutButton
                label={i18n.t('homeEdit.editHomeScreen')}
                onPress={() => homeEditing.start('footer')}
                testID='home-edit'
              />
            </View>
          )}
          <View
            style={{
              height:
                insets.bottom * 2 +
                (hasBottomBar ? 85 : 30) +
                weekStrip.bottomInset,
            }}
          />
        </ReorderableContainer>
        {anchorScroll.room}
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
        renderPlanDetails={daySheetPlanDetails}
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

const PetPromptCard = canvasKitComponent(
  (): typeof PetPromptCardComponent =>
    require('@/features/pet/components/PetPromptCard').default
)

const PetHomeSection = canvasKitComponent(
  (): typeof PetHomeSectionComponent =>
    require('@/features/pet/components/PetHomeSection').default
)

function QuickActionsCard() {
  const Card: typeof ScribeQuickActionsCardComponent =
    require('@/features/scribe/components/ScribeQuickActionsCard').default
  return <Card />
}
