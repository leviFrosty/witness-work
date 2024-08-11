import useServiceReport from '../stores/serviceReport'
import useTheme from '../contexts/theme'
import moment from 'moment'
import { useCallback, useEffect, useMemo, useState } from 'react'
import ExportTimeSheet, {
  ExportTimeSheetState,
} from '../components/ExportTimeSheet'
import IconButton from '../components/IconButton'
import { faPlus } from '@fortawesome/free-solid-svg-icons'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import Header from '../components/layout/Header'
import SelectedDateSheet, {
  SelectedDateSheetState,
} from '../components/SelectedDateSheet'
import XView from '../components/layout/XView'
import TimeReportsDashboard from './TimeReportsDashboard'
import { getMonthsReports } from '../lib/serviceReport'
import { HomeTabStackParamList } from '../stacks/HomeTabStack'

type Props = NativeStackScreenProps<HomeTabStackParamList, 'Month'>

const MonthScreen = ({ route, navigation }: Props) => {
  const theme = useTheme()
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

  useEffect(() => {
    if (route.params?.month) {
      setMonth(route.params.month)
    }
    if (route.params?.year) {
      setYear(route.params.year)
    }
  }, [route.params?.month, route.params?.year])

  useEffect(() => {
    navigation.setOptions({
      header: ({ navigation }) => (
        <Header
          title={selectedMonth.format('MMMM YYYY')}
          buttonType='none'
          rightElement={
            <XView style={{ position: 'absolute', right: 0, gap: 20 }}>
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
      <TimeReportsDashboard
        setSheet={setSheet}
        year={year}
        month={month}
        setYear={setYear}
        setMonth={setMonth}
        handleArrowNavigate={handleArrowNavigate}
        thisMonthsReports={thisMonthsReports}
        setSelectedDateSheet={setSelectedDateSheet}
      />
      <ExportTimeSheet setSheet={setSheet} sheet={sheet} />
      <SelectedDateSheet
        sheet={selectedDateSheet}
        setSheet={setSelectedDateSheet}
        thisMonthsReports={thisMonthsReports}
      />
    </>
  )
}
export default MonthScreen
