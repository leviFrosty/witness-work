import { View } from 'react-native'
import { CalendarDays as CalendarDaysIcon } from 'lucide-react-native'
import LucideIcon, { AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { segmentBoldMarkup } from '@/lib/projectedTotalCopy'

const Row = ({
  icon,
  text,
}: {
  icon: AppIcon
  /** May bold a phrase with `**`. */
  text: string
}) => {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
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
        <LucideIcon icon={icon} size={16} color={theme.colors.accent} />
      </View>
      <Text
        style={{
          flex: 1,
          fontSize: theme.fontSize('sm'),
          color: theme.colors.textAlt,
          lineHeight: theme.fontSize('sm') * 1.4,
        }}
      >
        {segmentBoldMarkup(text).map((segment, i) => (
          <Text
            key={i}
            style={{
              fontSize: theme.fontSize('sm'),
              fontFamily: segment.bold ? theme.fonts.semiBold : undefined,
              color: segment.bold ? theme.colors.text : theme.colors.textAlt,
            }}
          >
            {segment.text}
          </Text>
        ))}
      </Text>
    </View>
  )
}

/**
 * Where planning lives after setup, so this step reads as a preview rather than
 * the only chance to plan. Buddies gets its own step next.
 */
const PlanMonthNextSteps = () => {
  const theme = useTheme()

  return (
    <View style={{ gap: 12, paddingHorizontal: 4 }}>
      <Text
        style={{
          fontSize: theme.fontSize('xs'),
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textAlt,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
        accessibilityRole='header'
      >
        {i18n.t('planMonth.next.title')}
      </Text>
      <Row icon={CalendarDaysIcon} text={i18n.t('planMonth.next.schedule')} />
    </View>
  )
}

export default PlanMonthNextSteps
