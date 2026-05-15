import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { BlurView } from 'expo-blur'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import moment from 'moment'
import { faArrowLeft, faArrowRight } from '@fortawesome/free-solid-svg-icons'

import useTheme from '@/contexts/theme'
import { usePreferences } from '@/stores/preferences'
import i18n from '@/lib/locales'

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
import ProgressAllTimeTab from '@/features/progress/components/ProgressAllTimeTab'
import OnboardingBackfillBanner from '@/features/service-reports/components/OnboardingBackfillBanner'

type Props = NativeStackScreenProps<HomeTabStackParamList, 'Progress'>

export type ProgressTab = 'month' | 'year' | 'allTime'

const ProgressScreen = ({ route, navigation }: Props) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { publisher, publisherHours } = usePreferences()

  const now = moment()
  const currentYear = now.year()
  const currentMonth = now.month()

  const [month, setMonth] = useState(route.params?.month ?? currentMonth)
  const [year, setYear] = useState(route.params?.year ?? currentYear)

  // Publisher types with no annual goal (e.g. `publisher` or custom-at-0) cannot
  // meaningfully render the Year tab. Hide it from the selector and coerce
  // route-param landings away from `year`.
  const hideYearTab = (publisherHours[publisher] ?? 0) === 0

  const initialTab: ProgressTab = (() => {
    const requested = route.params?.tab
    if (requested === 'year' && hideYearTab) return 'month'
    return requested ?? 'month'
  })()

  const [activeTab, setActiveTab] = useState<ProgressTab>(initialTab)

  const [milestoneSheetOpen, setMilestoneSheetOpen] = useState(false)

  // Keep activeTab sane if publisher type changes mid-session.
  useEffect(() => {
    if (hideYearTab && activeTab === 'year') {
      setActiveTab('month')
    }
  }, [hideYearTab, activeTab])

  // Sync route params → local state when navigation updates them.
  useEffect(() => {
    if (route.params?.month !== undefined) setMonth(route.params.month)
    if (route.params?.year !== undefined) setYear(route.params.year)
    if (route.params?.tab !== undefined) {
      const next =
        route.params.tab === 'year' && hideYearTab ? 'month' : route.params.tab
      setActiveTab(next)
    }
  }, [route.params?.month, route.params?.year, route.params?.tab, hideYearTab])

  const selectedMonth = useMemo(
    () => moment().month(month).year(year),
    [month, year]
  )
  const isCurrentMonth = month === currentMonth && year === currentYear

  // Service-year convention: Jan–Aug rolls up into the prior year's service
  // year, Sep–Dec into the following service year. `serviceYear` here is the
  // END year (matches how YearMilestoneCard / ProgressYearTab expect it).
  const serviceYear = useMemo(
    () => (month < 8 ? year : year + 1),
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
      <View
        style={{
          paddingTop: insets.top,
          overflow: 'hidden',
        }}
      >
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
        <View
          style={{
            paddingTop: 6,
            paddingBottom: 6,
            gap: 6,
          }}
        >
          <SegmentedControl<ProgressTab>
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { key: 'month', label: i18n.t('month') },
              ...(hideYearTab
                ? []
                : ([{ key: 'year', label: i18n.t('year') }] as const)),
              { key: 'allTime', label: i18n.t('allTime') },
            ]}
            style={{ marginHorizontal: 15 }}
          />
          {activeTab === 'month' ? (
            <View style={{ paddingHorizontal: 15 }}>
              <XView style={{ justifyContent: 'space-between' }}>
                <Button
                  onPress={() => handleMonthNav('back')}
                  style={navButtonStyle(theme)}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      gap: 5,
                      alignItems: 'center',
                    }}
                  >
                    <IconButton icon={faArrowLeft} size={15} />
                    <Text style={{ color: theme.colors.textAlt }}>
                      {moment(selectedMonth).subtract(1, 'month').format('MMM')}
                    </Text>
                  </View>
                </Button>
                <TodayTitleStack
                  title={selectedMonth.format('MMMM YYYY')}
                  showTodayBadge={!isCurrentMonth}
                  onPressToday={jumpToToday}
                />
                <Button
                  onPress={() => handleMonthNav('forward')}
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
                    <IconButton icon={faArrowRight} size={15} />
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
          />
        ) : null}
        {activeTab === 'year' && !hideYearTab ? (
          <ProgressYearTab
            year={serviceYear}
            onAdjustMilestones={() => setMilestoneSheetOpen(true)}
            onMonthPress={(m, y) => {
              setMonth(m)
              setYear(y)
              setActiveTab('month')
            }}
          />
        ) : null}
        {activeTab === 'allTime' ? (
          <ProgressAllTimeTab
            onYearPress={(endYear) => {
              setYear(endYear)
              setActiveTab(hideYearTab ? 'month' : 'year')
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
