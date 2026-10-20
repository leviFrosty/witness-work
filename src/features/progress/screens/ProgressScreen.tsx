import {
  Check as CheckIcon,
  FileText as FileTextIcon,
  LayoutGrid as LayoutGridIcon,
  Plus as PlusIcon,
} from 'lucide-react-native'
import {
  ArrowBackwardIcon,
  ArrowForwardIcon,
} from '@/components/ui/DirectionalIcon'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { BlurView } from 'expo-blur'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useNavigation } from '@react-navigation/native'
import moment from 'moment'
import { serviceYearOf } from '@/lib/serviceYear'

import useTheme from '@/contexts/theme'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import i18n from '@/lib/locales'

import RootHeader from '@/components/RootHeader'
import ScrollAwayHeader from '@/components/ui/ScrollAwayHeader'
import useHideBarsOnScroll from '@/hooks/useHideBarsOnScroll'
import HeaderPillButton from '@/components/ui/HeaderPillButton'
import { RootStackNavigation } from '@/types/rootStack'

import MilestoneAdjustSheet from '@/features/progress/components/MilestoneAdjustSheet'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import { HomeTabStackParamList } from '@/types/homeStack'

import SegmentedControl from '@/components/ui/SegmentedControl'
import ProgressMonthTab from '@/features/progress/components/ProgressMonthTab'
import ProgressYearTab from '@/features/progress/components/ProgressYearTab'
import ProgressAllTimeTab, {
  useAllTimeIsEmpty,
} from '@/features/progress/components/ProgressAllTimeTab'
import OnboardingBackfillBanner from '@/features/service-reports/components/OnboardingBackfillBanner'
import useRolloverPrompt from '@/features/service-reports/hooks/useRolloverPrompt'
import useProgressCardEditing from '@/features/progress/hooks/useProgressCardEditing'
import type { ProgressCardDestination } from '@/features/progress/components/cards/progressCardRegistry'
import { formatDisplay } from '@/lib/dates'

type Props = NativeStackScreenProps<HomeTabStackParamList, 'Progress'>

export type ProgressTab = 'month' | 'year' | 'allTime'

const ProgressScreen = ({ route, navigation }: Props) => {
  const theme = useTheme()
  useRolloverPrompt()
  const { isWide, contentMaxWidth } = useAdaptiveLayout()
  const rootNavigation = useNavigation<RootStackNavigation>()
  const now = moment()
  const currentYear = now.year()
  const currentMonth = now.month()

  const [month, setMonth] = useState(route.params?.month ?? currentMonth)
  const [year, setYear] = useState(route.params?.year ?? currentYear)

  // The Year tab is available to every role. Roles without an Annual Goal see
  // raw service-year totals there (see `ProgressYearTab`).
  const [activeTab, setActiveTab] = useState<ProgressTab>(
    route.params?.tab ?? 'month'
  )

  const [milestoneSheetOpen, setMilestoneSheetOpen] = useState(false)
  // Each tab edits its own cards.
  const tabEditing = {
    month: useProgressCardEditing('month'),
    year: useProgressCardEditing('year'),
    allTime: useProgressCardEditing('allTime'),
  }
  const cardEditing = tabEditing[activeTab]
  const { finish: finishEditing } = cardEditing
  const allTimeIsEmpty = useAllTimeIsEmpty()
  // All Time has no cards until there's time to sum.
  const hasCards = activeTab !== 'allTime' || !allTimeIsEmpty
  // Leaving a tab ends its editing.
  const changeTab = (tab: ProgressTab) => {
    finishEditing()
    setActiveTab(tab)
  }
  const openCardDestination = (destination: ProgressCardDestination) => {
    if (destination === 'mileage') rootNavigation.navigate('Mileage')
    else changeTab(destination)
  }
  // The title and its report button tuck away as a tab scrolls; the tab and
  // month pickers stay, since they say what's showing.
  // A tab that opens at its top can't be scrolled up to bring them back.
  // Editing the cards keeps them, since the header holds Done.
  const bars = useHideBarsOnScroll({
    enabled: !cardEditing.editing,
    resetKey: activeTab,
  })

  // Sync route params → local state when navigation updates them.
  useEffect(() => {
    if (route.params?.month !== undefined) setMonth(route.params.month)
    if (route.params?.year !== undefined) setYear(route.params.year)
    if (route.params?.tab !== undefined) setActiveTab(route.params.tab)
  }, [route.params?.month, route.params?.year, route.params?.tab])

  const selectedMonth = useMemo(
    () => moment().month(month).year(year),
    [month, year]
  )
  const isCurrentMonth = month === currentMonth && year === currentYear

  // Service-year convention: Jan–Aug rolls up into the prior year's service
  // year, Sep–Dec into the following service year. `serviceYear` here is the
  // END year (matches how YearMilestoneCard / ProgressYearTab expect it).
  const serviceYear = useMemo(
    () => serviceYearOf({ month, year }) + 1,
    [month, year]
  )

  const handleMonthNav = useCallback(
    (direction: 'forward' | 'back') => {
      if (direction === 'forward') {
        if (month === 11) {
          setMonth(0)
          setYear(year + 1)
        } else {
          setMonth(month + 1)
        }
      } else {
        if (month === 0) {
          setMonth(11)
          setYear(year - 1)
        } else {
          setMonth(month - 1)
        }
      }
    },
    [month, year]
  )

  const jumpToToday = useCallback(() => {
    setMonth(currentMonth)
    setYear(currentYear)
  }, [currentMonth, currentYear])

  useEffect(() => {
    navigation.setOptions({ header: () => null })
  }, [navigation])

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
      }}
    >
      <View style={{ overflow: 'hidden' }}>
        <BlurView
          tint={theme.colors.background === '#121212' ? 'dark' : 'light'}
          intensity={40}
          style={StyleSheet.absoluteFill}
        />
        <View
          pointerEvents='none'
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: theme.colors.background,
              opacity: 0.6,
            },
          ]}
        />
        <ScrollAwayHeader hidden={bars.hidden}>
          <RootHeader
            title={i18n.t('Progress')}
            contentStyle={{
              maxWidth: isWide ? contentMaxWidth : 720,
              paddingHorizontal: isWide ? 24 : 15,
            }}
            actions={
              cardEditing.editing ? (
                // As on the Home Screen: add on one side of the header, Done on
                // the other.
                <>
                  <HeaderPillButton
                    icon={PlusIcon}
                    label={i18n.t('progressCards.addCards')}
                    onPress={() => cardEditing.setAdding(true)}
                    compact='auto'
                  />
                  <HeaderPillButton
                    icon={CheckIcon}
                    label={i18n.t('done')}
                    onPress={finishEditing}
                  />
                </>
              ) : (
                <>
                  {hasCards ? (
                    <HeaderPillButton
                      icon={LayoutGridIcon}
                      label={i18n.t('progressCards.editCards')}
                      onPress={() => cardEditing.start('header')}
                      compact
                    />
                  ) : null}
                  <HeaderPillButton
                    icon={FileTextIcon}
                    label={i18n.t('viewReport')}
                    onPress={() => {
                      rootNavigation.navigate('ServiceReportView', {
                        month,
                        year,
                      })
                    }}
                    compact={isWide ? false : 'auto'}
                  />
                </>
              )
            }
          />
        </ScrollAwayHeader>
        <View
          style={{
            paddingTop: isWide ? 9 : 0,
            paddingBottom: isWide ? 15 : 6,
            paddingHorizontal: isWide ? 24 : 15,
            width: '100%',
            maxWidth: isWide ? contentMaxWidth : 720,
            alignSelf: 'center',
            gap: 6,
          }}
        >
          <SegmentedControl<ProgressTab>
            value={activeTab}
            onChange={changeTab}
            options={[
              { key: 'month', label: i18n.t('month') },
              { key: 'year', label: i18n.t('year') },
              { key: 'allTime', label: i18n.t('allTime') },
            ]}
          />
          {activeTab === 'month' ? (
            <View>
              <XView style={{ justifyContent: 'space-between' }}>
                <Button
                  onPress={() => handleMonthNav('back')}
                  accessibilityLabel={i18n.t('previousMonth')}
                  style={navButtonStyle(theme)}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      gap: 5,
                      alignItems: 'center',
                    }}
                  >
                    <IconButton icon={ArrowBackwardIcon} size={15} />
                    <Text style={{ color: theme.colors.textAlt }}>
                      {moment(selectedMonth).subtract(1, 'month').format('MMM')}
                    </Text>
                  </View>
                </Button>
                <TodayTitleStack
                  title={formatDisplay(selectedMonth, 'MMMM YYYY')}
                  showTodayBadge={!isCurrentMonth}
                  onPressToday={jumpToToday}
                />
                <Button
                  onPress={() => handleMonthNav('forward')}
                  accessibilityLabel={i18n.t('nextMonth')}
                  style={navButtonStyle(theme)}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      gap: 5,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: theme.colors.textAlt }}>
                      {moment(selectedMonth).add(1, 'month').format('MMM')}
                    </Text>
                    <IconButton icon={ArrowForwardIcon} size={15} />
                  </View>
                </Button>
              </XView>
            </View>
          ) : null}
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <OnboardingBackfillBanner />
        {activeTab === 'month' ? (
          <ProgressMonthTab
            month={month}
            year={year}
            onSwipeForward={() => handleMonthNav('forward')}
            onSwipeBack={() => handleMonthNav('back')}
            editing={tabEditing.month.editing}
            onStartEditing={tabEditing.month.start}
            onFinishEditing={tabEditing.month.finish}
            adding={tabEditing.month.adding}
            onAddingChange={tabEditing.month.setAdding}
            onNavigate={openCardDestination}
            scrollBars={bars.scrollProps}
          />
        ) : null}
        {activeTab === 'year' ? (
          <ProgressYearTab
            year={serviceYear}
            onAdjustMilestones={() => setMilestoneSheetOpen(true)}
            scrollBars={bars.scrollProps}
            editing={tabEditing.year.editing}
            onStartEditing={tabEditing.year.start}
            onFinishEditing={tabEditing.year.finish}
            adding={tabEditing.year.adding}
            onAddingChange={tabEditing.year.setAdding}
            onNavigate={openCardDestination}
            onMonthPress={(m, y) => {
              setMonth(m)
              setYear(y)
              changeTab('month')
            }}
          />
        ) : null}
        {activeTab === 'allTime' ? (
          <ProgressAllTimeTab
            scrollBars={bars.scrollProps}
            editing={tabEditing.allTime.editing}
            onStartEditing={tabEditing.allTime.start}
            onFinishEditing={tabEditing.allTime.finish}
            adding={tabEditing.allTime.adding}
            onAddingChange={tabEditing.allTime.setAdding}
            onNavigate={openCardDestination}
            onYearPress={(endYear) => {
              setYear(endYear)
              changeTab('year')
            }}
          />
        ) : null}
      </View>

      <MilestoneAdjustSheet
        visible={milestoneSheetOpen}
        onClose={() => setMilestoneSheetOpen(false)}
      />
    </View>
  )
}

const navButtonStyle = (theme: ReturnType<typeof useTheme>) => ({
  borderColor: theme.colors.border,
  borderWidth: 1,
  borderRadius: theme.numbers.borderRadiusLg,
  paddingHorizontal: 15,
  paddingVertical: 5,
})

/**
 * Stack of the current section's title (e.g. "April 2026" or "2025–2026") with
 * an optional "Today" badge directly beneath. When the badge is absent the
 * title alone sits centered in the row alongside the nav buttons; when present,
 * the title + badge group is centered as a unit by the parent's alignItems.
 */
const TodayTitleStack = ({
  title,
  showTodayBadge,
  onPressToday,
}: {
  title: string
  showTodayBadge: boolean
  onPressToday: () => void
}) => {
  const theme = useTheme()

  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Text
        style={{
          fontSize: theme.fontSize('md'),
          fontFamily: theme.fonts.semiBold,
        }}
      >
        {title}
      </Text>
      {showTodayBadge ? (
        <Button onPress={onPressToday} accessibilityLabel={i18n.t('today')}>
          <Badge size='xs'>{i18n.t('today')}</Badge>
        </Button>
      ) : null}
    </View>
  )
}

export default ProgressScreen
