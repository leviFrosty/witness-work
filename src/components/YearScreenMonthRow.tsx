import moment from 'moment'
import useTheme from '../contexts/theme'
import XView from './layout/XView'
import Text from './MyText'
import {
  AdjustedMinutes,
  adjustedMinutesForSpecificMonth,
} from '../lib/serviceReport'
import { ServiceReport } from '../types/serviceReport'
import { usePreferences } from '../stores/preferences'
import _ from 'lodash'
import i18n from '../lib/locales'
import { View } from 'react-native'
import { useFormattedMinutes } from '../lib/minutes'

export default function YearScreenMonthRow(props: {
  month: number
  year: number
  monthsReports: ServiceReport[]
}) {
  const { month, year, monthsReports } = props

  const {
    publisher,
    publisherHours,
    overrideCreditLimit,
    customCreditLimitHours,
  } = usePreferences()
  const goalHours = publisherHours[publisher]
  const theme = useTheme()

  const adjustedMinutes: AdjustedMinutes = monthsReports
    ? adjustedMinutesForSpecificMonth(monthsReports, month, year, publisher, {
        enabled: overrideCreditLimit,
        customLimitHours: customCreditLimitHours,
      })
    : { value: 0, credit: 0, standard: 0, creditOverage: 0 }

  const adjustedMinutesWithFormat = useFormattedMinutes(adjustedMinutes.value)

  return (
    <View
      style={{
        borderRadius: theme.numbers.borderRadiusSm,
        backgroundColor: theme.colors.card,
        paddingHorizontal: 15,
        paddingVertical: 12,
        gap: 5,
      }}
    >
      <XView
        style={{
          justifyContent: 'space-between',
        }}
      >
        <Text style={{ fontFamily: theme.fonts.semiBold }}>
          {moment().month(month).format('MMMM')}
        </Text>
        <Text style={{ fontFamily: theme.fonts.semiBold, letterSpacing: -0.5 }}>
          {`${adjustedMinutesWithFormat.formatted} ${i18n.t(
            'of'
          )} ${goalHours} ${i18n.t('hoursToGoal')}`}
        </Text>
      </XView>
      {!!adjustedMinutes.creditOverage && (
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.warn,
            textAlign: 'right',
          }}
        >
          {i18n.t('youHaveCreditOverage', {
            count: _.round(adjustedMinutes.creditOverage / 60, 1),
          })}
        </Text>
      )}
    </View>
  )
}
