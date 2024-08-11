import Wrapper from '../components/layout/Wrapper'
import useServiceReport from '../stores/serviceReport'
import moment from 'moment'
import MonthSummary from '../components/MonthSummary'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Button from '../components/Button'
import { View } from 'react-native'
import IconButton from '../components/IconButton'
import { faArrowLeft, faArrowRight } from '@fortawesome/free-solid-svg-icons'
import Text from '../components/MyText'
import useTheme from '../contexts/theme'
import i18n from '../lib/locales'
import usePublisher from '../hooks/usePublisher'
import AnnualServiceReportSummary from '../components/AnnualServiceReportSummary'
import { useEffect, useMemo, useState } from 'react'
import { getServiceYearReports } from '../lib/serviceReport'
import { FlashList } from '@shopify/flash-list'
import ActionButton from '../components/ActionButton'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '../stacks/RootStack'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import {
  HomeTabStackNavigation,
  HomeTabStackParamList,
} from '../stacks/HomeTabStack'
import Header from '../components/layout/Header'

type ServiceYearScreenProps = NativeStackScreenProps<
  HomeTabStackParamList,
  'Year'
>

/** Service Year screen */
const YearScreen = ({ route }: ServiceYearScreenProps) => {
  const { serviceReports } = useServiceReport()
  const { hasAnnualGoal } = usePublisher()
  const navigation = useNavigation<
    HomeTabStackNavigation & RootStackNavigation
  >()
  const [year, setYear] = useState(route.params?.year ?? moment().year())

  useEffect(() => {
    if (route.params?.year) {
      setYear(route.params.year)
    }
  }, [route.params?.year])

  useEffect(() => {
    const serviceYearAsString = `${year - 1}-${year}`

    navigation.setOptions({
      header: () => <Header title={serviceYearAsString} buttonType='none' />,
    })
  }, [navigation, year])
  const theme = useTheme()

  const reportsForServiceYear = useMemo(
    () => getServiceYearReports(serviceReports, year - 1),
    [serviceReports, year]
  )

  return (
    <Wrapper insets='bottom'>
      <View style={{ gap: 5, paddingHorizontal: 15, paddingVertical: 15 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Button
            onPress={() => setYear(year - 1)}
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
                {`${moment()
                  .year(year)
                  .subtract(2, 'year')
                  .format('YYYY')}-${moment()
                  .year(year)
                  .subtract(1, 'year')
                  .format('YYYY')} `}
              </Text>
            </View>
          </Button>
          {year !== moment().year() && (
            <Button
              style={{
                backgroundColor: theme.colors.accentTranslucent,
                paddingVertical: 5,
                paddingHorizontal: 15,
                borderRadius: theme.numbers.borderRadiusSm,
              }}
              onPress={() => {
                setYear(moment().year())
              }}
            >
              <Text style={{ textDecorationLine: 'underline' }}>
                {i18n.t('today')}
              </Text>
            </Button>
          )}
          {year !== moment().year() ? (
            <Button
              onPress={() => setYear(year + 1)}
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
                  {`${moment().year(year).format('YYYY')}-${moment()
                    .year(year)
                    .add(1, 'year')
                    .format('YYYY')} `}
                </Text>
                <IconButton icon={faArrowRight} size={15} />
              </View>
            </Button>
          ) : (
            <View style={{ width: 50 }} />
          )}
        </View>
        {hasAnnualGoal && (
          <AnnualServiceReportSummary
            serviceYear={year - 1}
            month={moment().month()}
            year={year}
            hidePerMonthToGoal
          />
        )}
      </View>
      <KeyboardAwareScrollView
        contentContainerStyle={{
          paddingBottom: 250,
          paddingHorizontal: 15,
          gap: 25,
        }}
      >
        {Object.keys(reportsForServiceYear).map((year) => {
          return (
            <View style={{ gap: 8 }} key={year}>
              <Text
                style={{
                  fontSize: theme.fontSize('2xl'),
                  fontFamily: theme.fonts.bold,
                }}
              >
                {year}
              </Text>
              <View style={{ minHeight: 2 }}>
                <FlashList
                  data={Object.keys(reportsForServiceYear[year])}
                  renderItem={({ item: month }) => {
                    return (
                      <Button
                        key={month}
                        onPress={
                          (moment().year() === parseInt(year) &&
                            moment().month() >= parseInt(month)) ||
                          moment().year() > parseInt(year)
                            ? () =>
                                navigation.navigate('Month', {
                                  month: parseInt(month),
                                  year: parseInt(year),
                                })
                            : undefined
                        }
                      >
                        <MonthSummary
                          month={parseInt(month)}
                          monthsReports={reportsForServiceYear[year]?.[month]}
                          year={parseInt(year)}
                          title={moment().month(parseInt(month)).format('MMMM')}
                          noDetails
                          highlightAsCurrentMonth={
                            parseInt(month) === moment().month() &&
                            parseInt(year) === moment().year()
                          }
                        />
                      </Button>
                    )
                  }}
                  ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                  estimatedItemSize={183}
                  ListEmptyComponent={
                    <View style={{ gap: 5 }}>
                      <Text>
                        {i18n.t('noReportsForThisYear', {
                          count: parseInt(year),
                        })}
                      </Text>
                      <ActionButton
                        onPress={() =>
                          navigation.navigate('Add Time', {
                            date: moment().year(parseInt(year)).toISOString(),
                          })
                        }
                      >
                        {i18n.t('addTime')}
                      </ActionButton>
                    </View>
                  }
                />
              </View>
            </View>
          )
        })}
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}

export default YearScreen
