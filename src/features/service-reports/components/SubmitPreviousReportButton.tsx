import {
  ChevronRight as ChevronRightIcon,
  Share as ShareIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { useNavigation } from '@react-navigation/native'
import moment from 'moment'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import { RootStackNavigation } from '@/types/rootStack'
import useServiceReport from '@/stores/serviceReport'
import { getMonthsReports } from '@/lib/serviceReport'
import { shouldShowPreviousReportReminder } from '@/features/service-reports/lib/previousReportReminder'

/**
 * Post-rollover reminder to submit last month's report. Renders nothing once
 * the previous month has been sent onward via any export method (or on the
 * report screen's one-tap CTA). Only the single most recent completed month is
 * considered — older unsubmitted months are ignored.
 */
const SubmitPreviousReportButton = () => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { submittedReportMonths, installedOn } = usePreferences()
  const serviceReports = useServiceReport((state) => state.serviceReports)

  const previousMonth = moment().subtract(1, 'month')
  const previousMonthHasEntries =
    getMonthsReports(
      serviceReports,
      previousMonth.month(),
      previousMonth.year()
    ).length > 0
  if (
    !shouldShowPreviousReportReminder({
      installedOn,
      now: new Date(),
      previousMonthHasEntries,
      submittedReportMonths,
    })
  ) {
    return null
  }

  const label = i18n.t('submitMonthsReport', {
    month: previousMonth.format('MMMM'),
  })

  return (
    <Button
      accessibilityLabel={label}
      onPress={() =>
        navigation.navigate('ServiceReportView', {
          month: previousMonth.month(),
          year: previousMonth.year(),
        })
      }
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: theme.colors.accentTranslucent,
        borderRadius: theme.numbers.borderRadiusMd,
        borderCurve: 'continuous',
      }}
    >
      <LucideIcon icon={ShareIcon} size={18} color={theme.colors.accent} />
      <Text
        style={{
          flex: 1,
          color: theme.colors.accent,
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('md'),
        }}
      >
        {label}
      </Text>
      <LucideIcon
        icon={ChevronRightIcon}
        size={14}
        color={theme.colors.accent}
      />
    </Button>
  )
}

export default SubmitPreviousReportButton
