import {
  CalendarClock as CalendarClockIcon,
  Check as CheckIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import { useCardStyle } from '@/components/ui/Card'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { useFormattedMinutes } from '@/lib/minutes'
import useReadableAccent from '@/features/service-reports/hooks/useReadableAccent'

const DayPlanSuggestion = (props: {
  minutes: number
  applied: boolean
  onPress: () => void
}) => {
  const theme = useTheme()
  const cardStyle = useCardStyle()
  const accent = useReadableAccent()
  const { formatted } = useFormattedMinutes(props.minutes)
  return (
    <Button
      noTransform
      onPress={props.onPress}
      accessibilityRole='button'
      accessibilityLabel={i18n.t('timeForm_usePlanned', { value: formatted })}
      accessibilityState={{ selected: props.applied }}
      testID='time-entry-use-plan'
      style={{
        ...cardStyle,
        shadowOpacity: 0,
        minHeight: 48,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <LucideIcon
        icon={CalendarClockIcon}
        size={20}
        color={theme.colors.textAlt}
      />
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          fontFamily: theme.fonts.medium,
          fontSize: theme.fontSize('md'),
        }}
      >
        {i18n.t('timeForm_dayPlanned', { value: formatted })}
      </Text>
      {props.applied ? (
        <LucideIcon icon={CheckIcon} size={20} color={accent} />
      ) : (
        <Text
          style={{
            color: accent,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('md'),
          }}
        >
          {i18n.t('timeForm_usePlan')}
        </Text>
      )}
    </Button>
  )
}

export default DayPlanSuggestion
