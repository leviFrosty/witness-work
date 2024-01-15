import { Alert, View } from 'react-native'
import { useCallback, useContext } from 'react'
import moment from 'moment'
import useTheme, { ThemeContext } from '../contexts/theme'
import Card from './Card'
import Text from './MyText'
import { FlashList } from '@shopify/flash-list'
import { hasServiceReportsForMonth } from '../lib/serviceReport'
import useServiceReport from '../stores/serviceReport'
import { usePreferences } from '../stores/preferences'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '../stacks/RootStack'
import i18n from '../lib/locales'
import IconButton from './IconButton'
import { faCheck, faMinus, faTimes } from '@fortawesome/free-solid-svg-icons'
import Button from './Button'

const Month = ({ month, year }: { month: number; year: number }) => {
  const { monthlyRoutineHasShownInvalidMonthAlert, set } = usePreferences()
  const setHasShownInvalidMonthAlert = () => {
    set({ monthlyRoutineHasShownInvalidMonthAlert: true })
  }
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { installedOn, publisher } = usePreferences()
  const current = moment()
  const toDisplay = moment().month(month).year(year)
  const isCurrentMonth = current.isSame(toDisplay, 'month')
  const monthHasPassed = current.isAfter(toDisplay)
  const monthInFuture = current.isBefore(toDisplay)
  const { serviceReports } = useServiceReport()
  const wentOutThisMonth = hasServiceReportsForMonth(
    serviceReports,
    month,
    year
  )
  const monthWasBeforeInstalled = toDisplay.isBefore(installedOn)

  const didNotGoOutInService = monthHasPassed && !wentOutThisMonth
  const hasNotGoneOutTheCurrentMonth = isCurrentMonth && !wentOutThisMonth

  const handleInvalidMonthPress = () => {
    setHasShownInvalidMonthAlert()
    Alert.alert(
      i18n.t('cannotNavigateToFutureMonth'),
      i18n.t('cannotNavigateToFutureMonth_description')
    )
  }

  return (
    <Button
      disabled={monthInFuture && monthlyRoutineHasShownInvalidMonthAlert}
      onPress={
        publisher === 'publisher'
          ? undefined
          : () =>
              monthInFuture
                ? handleInvalidMonthPress()
                : navigation.navigate('Time Reports', {
                    month,
                    year,
                  })
      }
      style={{
        gap: 5,
        backgroundColor: isCurrentMonth ? theme.colors.accent3 : undefined,
        borderRadius: theme.numbers.borderRadiusSm,
        padding: 7,
      }}
    >
      <View
        style={{
          backgroundColor: theme.colors.backgroundLighter,
          padding: 8,
          borderRadius: theme.numbers.borderRadiusSm,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <IconButton
          iconStyle={{
            color: wentOutThisMonth
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

const MonthlyRoutine = () => {
  const theme = useContext(ThemeContext)

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
    <View style={{ gap: 10, flexShrink: 1 }}>
      <Text
        style={{
          fontSize: 14,
          fontFamily: theme.fonts.semiBold,
          marginLeft: 5,
        }}
      >
        {i18n.t('monthlyRoutine')}
      </Text>
      <Card style={{ flexGrow: 1, justifyContent: 'center' }}>
        <FlashList
          horizontal
          initialScrollIndex={5}
          keyExtractor={(item) => item.format()}
          estimatedItemSize={44}
          data={surroundingMonths()}
          renderItem={({ item }) => {
            const month = item.month()
            const year = item.year()
            return <Month month={month} year={year} />
          }}
          showsHorizontalScrollIndicator={false}
        />
      </Card>
    </View>
  )
}

export default MonthlyRoutine
