import useServiceReport from '../stores/serviceReport'
import useTheme from '../contexts/theme'
import moment from 'moment'
import { RootStackParamList } from '../stacks/RootStack'
import { useCallback, useEffect, useMemo, useState } from 'react'
import ExportTimeSheet, {
  ExportTimeSheetState,
} from '../components/ExportTimeSheet'
import IconButton from '../components/IconButton'
import {
  faCalendarDay,
  faListUl,
  faPlus,
} from '@fortawesome/free-solid-svg-icons'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import Header from '../components/layout/Header'
import SelectedDateSheet, {
  SelectedDateSheetState,
} from '../components/SelectedDateSheet'
import AnnualTimeOverviewScreen from './AnnualTimeOverviewScreen'
import { ActiveScreen } from '../constants/timeScreen'
import XView from '../components/layout/XView'
import TimeReportsDashboard from './TimeReportsDashboard'
import { getMonthsReports } from '../lib/serviceReport'

type Props = NativeStackScreenProps<RootStackParamList, 'Time Reports'>

const TimeReportsScreen = ({ route, navigation }: Props) => {
  const theme = useTheme()
  const [activeScreen, setActiveScreen] = useState(ActiveScreen.MonthDetails)
  const { serviceReports } = useServiceReport()
  const [year, setYear] = useState(route.params?.year || moment().year())
  const [month, setMonth] = useState(route.params?.month || moment().month())
  const [sheet, setSheet] = useState<ExportTimeSheetState>({
    open: false,
    month,
    year,
  })
  const [selectedDateSheet, setSelectedDateSheet] =
    useState<SelectedDateSheetState>({
      open: false,
      date: new Date(),
    })
  const selectedMonth = moment().month(month).year(year)

  const handleSetActiveScreen = (
    month: number,
    year: number,
    screen: ActiveScreen
  ) => {
    setMonth(month)
    setYear(year)
    setActiveScreen(screen)
  }

  useEffect(() => {
    const serviceYearAsString = `${year - 1}-${year}`

    navigation.setOptions({
      header: ({ navigation }) => (
        <Header
          title={
            activeScreen === ActiveScreen.MonthDetails
              ? selectedMonth.format('MMMM YYYY')
              : serviceYearAsString
          }
          buttonType='back'
          rightElement={
            <XView style={{ position: 'absolute', right: 0, gap: 20 }}>
              <IconButton
                icon={
                  activeScreen === ActiveScreen.AnnualOverview
                    ? faCalendarDay
                    : faListUl
                }
                onPress={() => {
                  const nextScreen =
                    activeScreen === ActiveScreen.AnnualOverview
                      ? ActiveScreen.MonthDetails
                      : ActiveScreen.AnnualOverview
                  handleSetActiveScreen(month, year, nextScreen)
                }}
                size='xl'
                iconStyle={{ color: theme.colors.text }}
              />
              <IconButton
                icon={faPlus}
                onPress={() =>
                  navigation.navigate('Add Time', {
                    date: selectedMonth.toISOString(),
                  })
                }
                size='xl'
                iconStyle={{ color: theme.colors.text }}
              />
            </XView>
          }
        />
      ),
    })
  }, [
    activeScreen,
    month,
    navigation,
    selectedMonth,
    theme.colors.accent3,
    theme.colors.text,
    theme.colors.textInverse,
    year,
  ])

  const thisMonthsReports = useMemo(
    () => getMonthsReports(serviceReports, month, year),
    [month, serviceReports, year]
  )

  const handleArrowNavigate = useCallback(
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

  return (
    <>
      {activeScreen === ActiveScreen.AnnualOverview ? (
        <AnnualTimeOverviewScreen
          handleSetActiveScreen={handleSetActiveScreen}
          setSheet={setSheet}
          year={year}
          month={month}
          setYear={setYear}
          setMonth={setMonth}
        />
      ) : (
        <TimeReportsDashboard
          setSheet={setSheet}
          year={year}
          month={month}
          setYear={setYear}
          setMonth={setMonth}
          handleArrowNavigate={handleArrowNavigate}
          thisMonthsReports={thisMonthsReports}
          handleSetActiveScreen={handleSetActiveScreen}
          setSelectedDateSheet={setSelectedDateSheet}
        />
      )}
      <ExportTimeSheet setSheet={setSheet} sheet={sheet} />
      <SelectedDateSheet
        sheet={selectedDateSheet}
        setSheet={setSelectedDateSheet}
        thisMonthsReports={thisMonthsReports}
      />
    </>
  )
}
export default TimeReportsScreen
