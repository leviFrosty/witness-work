import { View } from 'react-native'
import {
  CalendarDays as CalendarDaysIcon,
  Users as UsersIcon,
} from 'lucide-react-native'
import InfoPopover from '@/components/ui/InfoPopover'
import LucideIcon, { AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { segmentBoldMarkup } from '@/lib/projectedTotalCopy'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'

const Row = ({
  icon,
  text,
  info,
}: {
  icon: AppIcon
  /** May bold a phrase with `**`. */
  text: string
  info?: { title: string; description: string }
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
      {info ? (
        <InfoPopover title={info.title} description={info.description} />
      ) : null}
    </View>
  )
}

/**
 * Where planning lives after setup, so this step reads as a preview rather than
 * the only chance to plan — and an intro to planning with Buddies.
 */
const PlanMonthNextSteps = () => {
  const theme = useTheme()
  const buddiesEnabled = useBuddiesEnabled()

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
      {buddiesEnabled ? (
        <Row
          icon={UsersIcon}
          text={i18n.t('planMonth.next.buddies')}
          info={{
            title: i18n.t('buddies_onboardingWelcomeTitle'),
            description: i18n.t('planMonth.next.buddiesInfo'),
          }}
        />
      ) : null}
    </View>
  )
}

export default PlanMonthNextSteps
