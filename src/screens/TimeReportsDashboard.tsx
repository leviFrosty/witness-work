import React from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '../contexts/theme'
import Button from '../components/Button'
import { faArrowLeft, faArrowRight } from '@fortawesome/free-solid-svg-icons'
import Text from '../components/MyText'
import IconButton from '../components/IconButton'
import moment from 'moment'
import i18n from '../lib/locales'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { FlashList } from '@shopify/flash-list'
import TimeReportRow from '../components/TimeReportRow'
import Card from '../components/Card'
import { ExportTimeSheetState } from '../components/ExportTimeSheet'
import { ServiceReport } from '../types/serviceReport'
import MonthSummary from '../components/MonthSummary'
import MonthTimeReportsCalendar from '../components/MonthTimeReportsCalendar'
import { SelectedDateSheetState } from '../components/SelectedDateSheet'
import MonthScheduleSection from '../components/MonthScheduleSection'

type TimeReportsDashboardProps = {
  month: number
  year: number
  handleArrowNavigate: (direction: 'forward' | 'back') => void
  setSheet: React.Dispatch<React.SetStateAction<ExportTimeSheetState>>
  setYear: React.Dispatch<React.SetStateAction<number>>
  setMonth: React.Dispatch<React.SetStateAction<number>>
  thisMonthsReports: ServiceReport[] | null
  setSelectedDateSheet: React.Dispatch<
    React.SetStateAction<SelectedDateSheetState>
  >
}

const TimeReportsDashboard = (props: TimeReportsDashboardProps) => {
  const {
    month,
    year,
    setYear,
    setSheet,
    setMonth,
    thisMonthsReports,
    handleArrowNavigate,
    setSelectedDateSheet,
  } = props
  const insets = useSafeAreaInsets()
  const theme = useTheme()
  const selectedMonth = moment().month(month).year(year)

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
        </View>
      </View>
      <KeyboardAwareScrollView
        contentContainerStyle={{
          paddingBottom: insets.bottom + 100,
        }}
        contentInset={{
          top: 0,
          right: 0,
          bottom: insets.bottom + 30,
          left: 0,
        }}
      >
        <View
          style={{
            paddingHorizontal: 15,
            paddingTop: 15,
            paddingBottom: 30,
            gap: 10,
          }}
        >
          <MonthSummary
            month={month}
            year={year}
            monthsReports={thisMonthsReports}
            setSheet={setSheet}
          />
          <MonthScheduleSection month={month} year={year} />
          <MonthTimeReportsCalendar
            month={month}
            year={year}
            monthsReports={thisMonthsReports}
            setSheet={setSelectedDateSheet}
          />
        </View>
        <View style={{ paddingHorizontal: 15, gap: 5 }}>
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
    </View>
  )
}

export default TimeReportsDashboard
