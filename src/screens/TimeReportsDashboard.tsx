import React from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '../contexts/theme'
import Text from '../components/MyText'
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
import CalendarHeader from '../components/CalendarHeader'
import CalendarKey from '../components/CalendarKey'
import PlanningProgressCard from '../components/PlanningProgressCard'

type TimeReportsDashboardProps = {
  month: number
  year: number
  setSheet: React.Dispatch<React.SetStateAction<ExportTimeSheetState>>
  thisMonthsReports: ServiceReport[] | null
  setSelectedDateSheet: React.Dispatch<
    React.SetStateAction<SelectedDateSheetState>
  >
}

const TimeReportsDashboard = (props: TimeReportsDashboardProps) => {
  const { month, year, setSheet, thisMonthsReports, setSelectedDateSheet } =
    props
  const insets = useSafeAreaInsets()
  const theme = useTheme()

  return (
    <View
      style={{
        backgroundColor: theme.colors.background,
        flexGrow: 1,
        paddingBottom: insets.bottom,
      }}
    >
      <KeyboardAwareScrollView
        contentContainerStyle={{
          paddingTop: 15,
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
          <PlanningProgressCard month={month} year={year} />
          <Card style={{ gap: 0 }}>
            <CalendarHeader />
            <CalendarKey />
            <View>
              <MonthTimeReportsCalendar
                month={month}
                year={year}
                monthsReports={thisMonthsReports}
                setSheet={setSelectedDateSheet}
              />
              <MonthScheduleSection month={month} year={year} />
            </View>
          </Card>
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
