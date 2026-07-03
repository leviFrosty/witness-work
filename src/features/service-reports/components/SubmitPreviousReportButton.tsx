import { useNavigation } from '@react-navigation/native'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faArrowUpFromBracket } from '@fortawesome/free-solid-svg-icons/faArrowUpFromBracket'
import moment from 'moment'
import Button from '@/components/ui/Button'
import ShimmerText from '@/components/ui/ShimmerText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import { RootStackNavigation } from '@/types/rootStack'

/**
 * Post-rollover reminder to submit last month's report. Renders nothing once
 * the previous month has been sent onward via any export method (or on the
 * report screen's one-tap CTA). Only the single most recent completed month is
 * considered — older unsubmitted months are ignored.
 */
const SubmitPreviousReportButton = () => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { submittedReportMonths } = usePreferences()

  const previousMonth = moment().subtract(1, 'month')
  if (submittedReportMonths.includes(previousMonth.format('YYYY-MM'))) {
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
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: theme.colors.accent,
        borderRadius: theme.numbers.borderRadiusMd,
        borderCurve: 'continuous',
      }}
    >
      <FontAwesomeIcon
        icon={faArrowUpFromBracket}
        size={theme.fontSize('sm')}
        style={{ color: theme.colors.textInverse }}
      />
      <ShimmerText
        baseColor={theme.colors.textInverse}
        strength={0.5}
        style={{
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('md'),
        }}
      >
        {label}
      </ShimmerText>
    </Button>
  )
}

export default SubmitPreviousReportButton
