import { useMemo } from 'react'
import { View } from 'react-native'
import moment from 'moment'
import { Clock3 as ClockIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import usePublisher from '@/hooks/usePublisher'
import { useFormattedMinutes } from '@/lib/minutes'
import {
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
} from '@/lib/serviceReport'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'

export default function HourEntryCard() {
  const theme = useTheme()
  const { type: publisher } = usePublisher()
  const { overrideCreditLimit, customCreditLimitHours } = usePreferences()
  const { serviceReports } = useServiceReport()
  const now = moment()

  const monthReports = useMemo(
    () => getMonthsReports(serviceReports, now.month(), now.year()),
    [now, serviceReports]
  )
  const adjustedMinutes = useMemo(
    () =>
      adjustedMinutesForSpecificMonth(
        monthReports,
        now.month(),
        now.year(),
        publisher,
        {
          enabled: overrideCreditLimit,
          customLimitHours: customCreditLimitHours,
        }
      ).value,
    [customCreditLimitHours, monthReports, now, overrideCreditLimit, publisher]
  )
  const time = useFormattedMinutes(adjustedMinutes)

  return (
    <View
      style={{
        flex: 1,
        minHeight: 64,
        justifyContent: 'center',
        alignItems: 'flex-start',
        gap: 6,
        paddingVertical: 4,
      }}
    >
      <Text
        style={{
          fontSize: theme.fontSize('3xl'),
          fontFamily: theme.fonts.bold,
        }}
      >
        {time.formatted}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <LucideIcon icon={ClockIcon} size={14} color={theme.colors.accent} />
        <Text
          style={{
            color: theme.colors.textAlt,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {i18n.t('hours')}
        </Text>
      </View>
    </View>
  )
}
