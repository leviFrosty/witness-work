import { View } from 'react-native'
import { useCallback, useMemo } from 'react'
import moment from 'moment'
import useTheme from '@/contexts/theme'
import Text from '@/components/MyText'
import { FlashList } from '@shopify/flash-list'
import useServiceReport from '@/stores/serviceReport'
import { usePreferences } from '@/stores/preferences'
import usePublisher from '@/hooks/usePublisher'
import { useNavigation } from '@react-navigation/native'
import IconButton from '@/components/IconButton'
import { faCheck, faMinus, faTimes } from '@fortawesome/free-solid-svg-icons'
import Button from '@/components/Button'
import { getMonthsReports } from '@/lib/serviceReport'
import { HomeTabStackNavigation } from '@/types/homeStack'

const Month = ({
  month,
  year,
  onBeforeNavigate,
}: {
  month: number
  year: number
  onBeforeNavigate?: () => void
}) => {
  const theme = useTheme()
  const navigation = useNavigation<HomeTabStackNavigation>()
  const { installedOn } = usePreferences()
  const { showsYearTabs } = usePublisher()
  const current = moment()
  const toDisplay = moment().month(month).year(year)
  const isCurrentMonth = current.isSame(toDisplay, 'month')
  const monthHasPassed = current.isAfter(toDisplay)
  const monthInFuture = current.isBefore(toDisplay)
  const { serviceReports } = useServiceReport()
  const monthReports = useMemo(
    () => getMonthsReports(serviceReports, month, year),
    [month, serviceReports, year]
  )

  const monthWasBeforeInstalled = toDisplay.isBefore(installedOn)

  const didNotGoOutInService = monthHasPassed && !monthReports.length
  const hasNotGoneOutTheCurrentMonth = isCurrentMonth && !monthReports.length

  return (
    <Button
      onPress={
        showsYearTabs
          ? () => {
              onBeforeNavigate?.()
              navigation.navigate('Progress', {
                month,
                year,
              })
            }
          : undefined
      }
      style={{
        gap: 4,
        backgroundColor: isCurrentMonth ? theme.colors.text : undefined,
        borderRadius: theme.numbers.borderRadiusSm,
        padding: 5,
      }}
    >
      <View
        style={{
          backgroundColor: theme.colors.backgroundLighter,
          padding: 6,
          borderRadius: theme.numbers.borderRadiusSm,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <IconButton
          iconStyle={{
            color: monthReports.length
              ? theme.colors.accent
              : hasNotGoneOutTheCurrentMonth ||
                  monthInFuture ||
                  monthWasBeforeInstalled
                ? theme.colors.textAlt
                : theme.colors.error,
          }}
          icon={
            !didNotGoOutInService
              ? faCheck
              : monthWasBeforeInstalled
                ? faMinus
                : faTimes
          }
        />
      </View>
      <Text
        style={{
          textAlign: 'center',
          color: isCurrentMonth
            ? theme.colors.textInverse
            : theme.colors.textAlt,
        }}
      >
        {moment().month(month).format('MMM')}
      </Text>
    </Button>
  )
}

interface MonthlyRoutineProps {
  /**
   * Called after the user taps a month but before navigation occurs. Lets a
   * parent overlay/modal dismiss itself so the destination screen isn't
   * covered.
   */
  onBeforeNavigate?: () => void
}

const MonthlyRoutine = ({ onBeforeNavigate }: MonthlyRoutineProps = {}) => {
  const surroundingMonths = useCallback(() => {
    const now = moment()
    const currentMonth = now.month()

    const months = [now]
    for (let i = 1; i < 6; i++) {
      const nextMonth = moment().month(currentMonth + i)
      const previousMonth = moment().month(currentMonth - i)
      months.push(nextMonth)
      months.unshift(previousMonth)
    }
    return months
  }, [])

  return (
    <View style={{ height: 60 }}>
      <FlashList
        horizontal
        initialScrollIndex={5}
        keyExtractor={(item) => item.format()}
        data={surroundingMonths()}
        renderItem={({ item }) => {
          const month = item.month()
          const year = item.year()
          return (
            <Month
              month={month}
              year={year}
              onBeforeNavigate={onBeforeNavigate}
            />
          )
        }}
        showsHorizontalScrollIndicator={false}
      />
    </View>
  )
}

export default MonthlyRoutine
