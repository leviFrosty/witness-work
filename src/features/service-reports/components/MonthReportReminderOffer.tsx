import { BellRing as BellRingIcon, X as XIcon } from 'lucide-react-native'
import { toast } from '@/stores/toasts'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import { touchTargetFrame } from '@/components/ui/touchTarget'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import useMonthReportReminder from '@/features/service-reports/hooks/useMonthReportReminder'

/**
 * Offers the 1st-of-the-month report reminder once, right after a report is
 * sent from the report screen. Hidden for good once it's answered either way,
 * or when the reminder is already on.
 */
const MonthReportReminderOffer = () => {
  const theme = useTheme()
  const { enabled, setEnabled } = useMonthReportReminder()
  const answered = usePreferences((s) => s.monthReportReminderOfferAnswered)

  if (enabled || answered) return null

  // Without notification permission it stays off and the offer stays up, so
  // it can be tried again or dismissed.
  const accept = async () => {
    if (await setEnabled(true, 'report_offer'))
      toast.success(i18n.t('monthReportReminderOffer_turnedOn'))
  }

  return (
    <XView
      style={{
        gap: 10,
        alignItems: 'center',
        minHeight: 44,
        paddingLeft: 15,
        paddingRight: 6,
        paddingVertical: 6,
        borderRadius: theme.numbers.borderRadiusLg,
        backgroundColor: theme.colors.card,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <LucideIcon
        icon={BellRingIcon}
        size={theme.fontSize('md')}
        color={theme.colors.accent}
      />
      <Text
        style={{
          flex: 1,
          color: theme.colors.text,
          fontSize: theme.fontSize('sm'),
        }}
      >
        {i18n.t('monthReportReminderOffer')}
      </Text>
      <Button
        noTransform
        onPress={() => void accept()}
        accessibilityRole='button'
      >
        <Text
          style={{
            color: theme.colors.accent,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {i18n.t('monthReportReminderOffer_accept')}
        </Text>
      </Button>
      <IconButton
        icon={XIcon}
        size={14}
        color={theme.colors.textAlt}
        onPress={() => void setEnabled(false, 'report_offer')}
        accessibilityLabel={i18n.t('dismiss')}
        style={touchTargetFrame(26)}
      />
    </XView>
  )
}

export default MonthReportReminderOffer
