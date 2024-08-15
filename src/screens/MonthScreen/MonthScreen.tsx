import useServiceReport from '../../stores/serviceReport'
import useTheme from '../../contexts/theme'
import moment from 'moment'
import { useCallback, useEffect, useMemo, useState } from 'react'
import ExportTimeSheet, {
  ExportTimeSheetState,
} from '../../components/ExportTimeSheet'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import SelectedDateSheet, {
  SelectedDateSheetState,
} from '../../components/SelectedDateSheet'
import TimeReportsDashboard from '../TimeReportsDashboard'
import { getMonthsReports } from '../../lib/serviceReport'
import { HomeTabStackParamList } from '../../stacks/HomeTabStack'
import XView from '../../components/layout/XView'
import Button from '../../components/Button'
import { View } from 'react-native'
import IconButton from '../../components/IconButton'
import { faArrowLeft, faArrowRight } from '@fortawesome/free-solid-svg-icons'
import Text from '../../components/MyText'
import i18n from '../../lib/locales'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

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
  const insets = useSafeAreaInsets()

  useEffect(() => {
    if (route.params?.month) {
      setMonth(route.params.month)
    }
    if (route.params?.year) {
      setYear(route.params.year)
    }
  }, [route.params?.month, route.params?.year])

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

  useEffect(() => {
    navigation.setOptions({
      header: () => (
        <XView
          style={{
            backgroundColor: theme.colors.background,
            paddingTop: insets.top + 10,
            paddingBottom: 10,
            justifyContent: 'space-between',
            paddingHorizontal: 15,
          }}
        >
          <Button
            onPress={() => handleArrowNavigate('back')}
            style={{
              borderColor: theme.colors.border,
              borderWidth: 1,
              borderRadius: theme.numbers.borderRadiusLg,
              paddingHorizontal: 15,
              paddingVertical: 5,
            }}
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
          {(month !== moment().month() || year !== moment().year()) && (
            <Button
              style={{
                backgroundColor: theme.colors.accentTranslucent,
                paddingVertical: 5,
                paddingHorizontal: 15,
                borderRadius: theme.numbers.borderRadiusSm,
              }}
              onPress={() => {
                setYear(moment().year())
                setMonth(moment().month())
              }}
            >
              <Text style={{ textDecorationLine: 'underline' }}>
                {i18n.t('today')}
              </Text>
            </Button>
          )}
          <Button
            onPress={() => handleArrowNavigate('forward')}
            style={{
              borderColor: theme.colors.border,
              borderWidth: 1,
              borderRadius: theme.numbers.borderRadiusLg,
              paddingHorizontal: 15,
              paddingVertical: 5,
            }}
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
        // <Header title={selectedMonth.format('MMMM YYYY')} buttonType='none' />
      ),
    })
  }, [
    handleArrowNavigate,
    insets.top,
    month,
    navigation,
    selectedMonth,
    theme.colors.accent3,
    theme.colors.accentTranslucent,
    theme.colors.background,
    theme.colors.border,
    theme.colors.text,
    theme.colors.textAlt,
    theme.colors.textInverse,
    theme.numbers.borderRadiusLg,
    theme.numbers.borderRadiusSm,
    year,
  ])

  const thisMonthsReports = useMemo(
    () => getMonthsReports(serviceReports, month, year),
    [month, serviceReports, year]
  )

  return (
    <>
      <TimeReportsDashboard
        setSheet={setSheet}
        year={year}
        month={month}
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
