import { View } from 'react-native'
import Text from '../components/MyText'
import useServiceReport from '../stores/serviceReport'
import useTheme from '../contexts/theme'
import { ServiceReport } from '../types/serviceReport'
import moment from 'moment'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Card from '../components/Card'
import ActionButton from '../components/ActionButton'
import { RootStackParamList } from '../stacks/RootStack'
import i18n from '../lib/locales'
import { useEffect, useMemo, useState } from 'react'
import ExportTimeSheet, {
  ExportTimeSheetState,
} from '../components/ExportTimeSheet'
import MonthSummary from '../components/MonthSummary'
import TimeReportRow from '../components/TimeReportRow'
import IconButton from '../components/IconButton'
import {
  faArrowLeft,
  faArrowRight,
  faPlus,
} from '@fortawesome/free-solid-svg-icons'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import Wrapper from '../components/layout/Wrapper'
import Button from '../components/Button'
import { FlashList } from '@shopify/flash-list'
import AnnualServiceReportSummary from '../components/AnnualServiceReportSummary'
import Header from '../components/layout/Header'
import usePublisher from '../hooks/usePublisher'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { usePreferences } from '../stores/preferences'
import HintCard from '../components/HintCard'
import MonthTimeReportsCalendar from '../components/MonthTimeReportsCalendar'
import SelectedDateSheet, {
  SelectedDateSheetState,
} from '../components/SelectedDateSheet'

type Props = NativeStackScreenProps<RootStackParamList, 'Time Reports'>

const TimeReportsScreen = ({ route, navigation }: Props) => {
  const theme = useTheme()
  const { serviceReports } = useServiceReport()
  const { hasAnnualGoal } = usePublisher()
  const { howToDeleteTime } = usePreferences()
  const insets = useSafeAreaInsets()
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
  const serviceYear = month < 8 ? year - 1 : year

  useEffect(() => {
    navigation.setOptions({
      header: ({ navigation }) => (
        <Header
          title={selectedMonth.format('MMMM YYYY')}
          buttonType='back'
          rightElement={
            <IconButton
              style={{ position: 'absolute', right: 0 }}
              icon={faPlus}
              onPress={() =>
                navigation.navigate('Add Time', {
                  date: selectedMonth.toISOString(),
                })
              }
              size='xl'
              iconStyle={{ color: theme.colors.text }}
            />
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

  const reportsByYearAndMonth = useMemo(() => {
    const reports: {
      [year: string]: { [month: string]: ServiceReport[] }
    } = {}

    for (const report of serviceReports) {
      const yearKey = moment(report.date).year()
      const monthKey = moment(report.date).month()

      if (!reports[yearKey]) {
        reports[yearKey] = {}
      }

      if (!reports[yearKey][monthKey]) {
        reports[yearKey][monthKey] = []
      }

      reports[yearKey][monthKey].push(report)
    }

    return reports
  }, [serviceReports])

  const years = useMemo(
    () =>
      Object.keys(reportsByYearAndMonth).sort(
        (a, b) => parseInt(b) - parseInt(a)
      ),
    [reportsByYearAndMonth]
  )

  const thisMonthsReports = reportsByYearAndMonth[year]
    ? reportsByYearAndMonth[year][month] &&
      reportsByYearAndMonth[year][month].length > 0
      ? reportsByYearAndMonth[year][month]
      : null
    : null

  if (!years.length) {
    return (
      <Wrapper>
        <Card style={{ marginHorizontal: 15 }}>
          <Text
            style={{
              fontSize: theme.fontSize('lg'),
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('noTimeEntriesYet')}
          </Text>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('addATimeEntryToViewReport')}
          </Text>
          <ActionButton onPress={() => navigation.navigate('Add Time')}>
            {i18n.t('addTime')}
          </ActionButton>
        </Card>
      </Wrapper>
    )
  }

  const handleArrowNavigate = (direction: 'forward' | 'back') => {
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
  }

  return (
    <View
      style={{
        backgroundColor: theme.colors.background,
        flexGrow: 1,
        paddingBottom: insets.bottom,
      }}
    >
      <View
        style={{
          paddingTop: 15,
          paddingHorizontal: 15,
          paddingBottom: 10,
          gap: 30,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Button onPress={() => handleArrowNavigate('back')}>
            <View
              style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}
            >
              <IconButton icon={faArrowLeft} size={15} />
              <Text style={{ color: theme.colors.textAlt }}>
                {moment(selectedMonth).subtract(1, 'month').format('MMM')}
              </Text>
            </View>
          </Button>
          {moment().isAfter(selectedMonth, 'month') ? (
            <Button onPress={() => handleArrowNavigate('forward')}>
              <View
                style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}
              >
                <Text style={{ color: theme.colors.textAlt }}>
                  {moment(selectedMonth).add(1, 'month').format('MMM')}
                </Text>
                <IconButton icon={faArrowRight} size={15} />
              </View>
            </Button>
          ) : (
            <View style={{ width: 50 }} />
          )}
        </View>
      </View>
      <KeyboardAwareScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 100,
        }}
        contentInset={{ top: 0, right: 0, bottom: insets.bottom + 30, left: 0 }}
      >
        {hasAnnualGoal && (
          <View style={{ paddingHorizontal: 15, paddingTop: 15 }}>
            <AnnualServiceReportSummary
              serviceYear={serviceYear}
              month={month}
              year={year}
            />
          </View>
        )}
        <View
          style={{
            paddingHorizontal: 15,
            paddingTop: 15,
            paddingBottom: 30,
            gap: 15,
          }}
        >
          <MonthSummary
            month={month}
            year={year}
            monthsReports={thisMonthsReports}
            setSheet={setSheet}
          />
          <MonthTimeReportsCalendar
            month={month}
            year={year}
            monthsReports={thisMonthsReports}
            setSheet={setSelectedDateSheet}
          />
        </View>
        <View style={{ paddingHorizontal: 15, gap: 7 }}>
          <Text
            style={{
              color: theme.colors.textAlt,
              textTransform: 'uppercase',
              fontSize: theme.fontSize('sm'),
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('entries')}
          </Text>
          {howToDeleteTime &&
            thisMonthsReports &&
            thisMonthsReports.length > 0 && (
              <HintCard hintKey='howToDeleteTime'>
                <Text>{i18n.t('howToDeleteTime')}</Text>
              </HintCard>
            )}
          <View style={{ gap: 10, flex: 1, minHeight: 10 }}>
            <FlashList
              scrollEnabled={false}
              data={
                thisMonthsReports
                  ? thisMonthsReports.sort((a, b) =>
                      moment(a.date).unix() < moment(b.date).unix() ? 1 : -1
                    )
                  : undefined
              }
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              renderItem={({ item }) => <TimeReportRow report={item} />}
              estimatedItemSize={66}
              ListEmptyComponent={
                <Card>
                  <Text>{i18n.t('noReportsThisMonthYet')}</Text>
                </Card>
              }
            />
          </View>
        </View>
      </KeyboardAwareScrollView>
      <ExportTimeSheet setSheet={setSheet} sheet={sheet} />
      <SelectedDateSheet
        sheet={selectedDateSheet}
        setSheet={setSelectedDateSheet}
        thisMonthsReports={thisMonthsReports}
      />
    </View>
  )
}
export default TimeReportsScreen
