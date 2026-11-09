import { Check as CheckIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import {
  markReportNotSent,
  markReportSent,
} from '@/features/service-reports/hooks/useMonthReportExport'
import useReportSentState from '@/features/service-reports/hooks/useReportSentState'
import i18n from '@/lib/locales'

const ReportSentLink = ({
  month,
  year,
  onPress,
}: {
  month: number
  year: number
  onPress?: () => void
}) => {
  const theme = useTheme()
  const { sent, label } = useReportSentState(month, year)

  const handlePress = () => {
    onPress?.()
    if (sent) markReportNotSent(month, year, 'report_screen')
    else markReportSent(month, year, 'report_screen')
  }

  return (
    <Button
      testID='report-sent-link'
      accessibilityRole='button'
      noTransform
      onPress={handlePress}
      style={{
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        minHeight: MIN_TOUCH_TARGET,
        paddingHorizontal: 12,
        marginTop: 4,
        marginBottom: -8,
      }}
    >
      {sent && (
        <LucideIcon icon={CheckIcon} size={13} color={theme.colors.accent} />
      )}
      <Text
        style={{ fontSize: theme.fontSize('sm'), color: theme.colors.textAlt }}
      >
        {sent ? `${label} · ` : `${i18n.t('alreadySubmitted')} `}
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.accent,
          }}
        >
          {i18n.t(sent ? 'undo' : 'markAsSent')}
        </Text>
      </Text>
    </Button>
  )
}

export default ReportSentLink
