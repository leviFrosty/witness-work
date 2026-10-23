import { View } from 'react-native'
import { Clock3 as ClockIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { useFormattedMinutes } from '@/lib/minutes'
import i18n from '@/lib/locales'
import useAccessibilityTextSize, {
  FIT_ONE_LINE,
} from '@/hooks/useAccessibilityTextSize'
import { useThisMonthMinutes } from '@/features/service-reports/hooks/useThisMonthTotals'

export default function HourEntryCard() {
  const theme = useTheme()
  // At accessibility text sizes the figure and its label shrink to fit the
  // half-width column instead of breaking mid-word.
  const fit = useAccessibilityTextSize() ? FIT_ONE_LINE : undefined
  const time = useFormattedMinutes(useThisMonthMinutes())

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
        {...fit}
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
          {...fit}
          style={{
            flexShrink: 1,
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
