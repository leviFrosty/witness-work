import { Alert, View } from 'react-native'
import { useContext } from 'react'
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

const Month = ({
  month,
  setHasShownInvalidMonthAlert,
  hasShownInvalidMonthAlert,
}: {
  month: number
  setHasShownInvalidMonthAlert: () => void
  hasShownInvalidMonthAlert?: boolean
}) => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { installedOn, publisher } = usePreferences()
  const currentMonth = moment().month()
  const isCurrentMonth = currentMonth === month
  const monthHasPassed = currentMonth > month
  const monthInFuture = currentMonth < month
  const { serviceReports } = useServiceReport()
  const wentOutThisMonth = hasServiceReportsForMonth(
    serviceReports,
    month,
    moment().year()
  )
  const monthWasBeforeInstalled = month < moment(installedOn).month()

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
      disabled={monthInFuture && hasShownInvalidMonthAlert}
      onPress={
        publisher === 'publisher'
          ? undefined
          : () =>
              monthInFuture
                ? handleInvalidMonthPress()
                : navigation.navigate('Time Reports', {
                    month,
                    year: moment().year(),
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
  const { monthlyRoutineHasShownInvalidMonthAlert, set } = usePreferences()

  const setHasShownInvalidMonthAlert = () => {
    set({ monthlyRoutineHasShownInvalidMonthAlert: true })
  }

  return (
    <View style={{ gap: 10 }}>
      <Text
        style={{
          fontSize: 14,
          fontFamily: theme.fonts.semiBold,
          marginLeft: 5,
        }}
      >
        {i18n.t('monthlyRoutine')}
      </Text>
      <Card>
        <FlashList
          horizontal
          initialScrollIndex={moment().month()}
          keyExtractor={(item) => item.toString()}
          estimatedItemSize={44}
          data={[...Array(12).keys()]}
          renderItem={({ item: month }) => {
            return (
              <Month
                month={month}
                hasShownInvalidMonthAlert={
                  monthlyRoutineHasShownInvalidMonthAlert
                }
                setHasShownInvalidMonthAlert={setHasShownInvalidMonthAlert}
              />
            )
          }}
          showsHorizontalScrollIndicator={false}
        />
      </Card>
    </View>
  )
}

export default MonthlyRoutine
