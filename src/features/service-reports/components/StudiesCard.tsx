import { View } from 'react-native'
import { BookOpenCheck as StudyIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import useAccessibilityTextSize, {
  FIT_ONE_LINE,
} from '@/hooks/useAccessibilityTextSize'
import { useThisMonthStudies } from '@/features/service-reports/hooks/useThisMonthTotals'

export default function StudiesCard() {
  const theme = useTheme()

  const fit = useAccessibilityTextSize() ? FIT_ONE_LINE : undefined
  const studies = useThisMonthStudies()

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
        {studies}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <LucideIcon icon={StudyIcon} size={14} color={theme.colors.accent} />
        <Text
          {...fit}
          style={{
            flexShrink: 1,
            color: theme.colors.textAlt,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {i18n.t('studies')}
        </Text>
      </View>
    </View>
  )
}
