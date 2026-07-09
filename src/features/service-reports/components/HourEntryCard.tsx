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
        minHeight: 92,
        justifyContent: 'center',
        alignItems: 'flex-start',
        gap: 8,
        paddingVertical: 4,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.accentTranslucent,
        }}
      >
        <LucideIcon icon={ClockIcon} size={17} color={theme.colors.accent} />
      </View>
      <Text
        style={{
          fontSize: theme.fontSize('2xl'),
          fontFamily: theme.fonts.bold,
        }}
      >
        {time.formatted}
      </Text>
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
  )
}
