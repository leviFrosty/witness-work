import { Route as RouteIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import useDayRouteStops from '@/features/route-planning/hooks/useDayRouteStops'
import useOpenTodayRoute from '@/features/route-planning/hooks/useOpenTodayRoute'

/**
 * Compact "Plan Route" in Home's Follow-up card header, where publishers look
 * at today's calls. Shows once at least two of today's stops have a location.
 */
export default function TodayRouteAction() {
  const theme = useTheme()
  const open = useOpenTodayRoute('home_follow_ups')
  const { stops } = useDayRouteStops(new Date())
  if (stops.length < 2) return null

  return (
    <Button
      onPress={open}
      accessibilityLabel={i18n.t('routePlan_entryTitle')}
      hitSlop={8}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: theme.colors.accentTranslucent,
      }}
    >
      <LucideIcon icon={RouteIcon} size={14} color={theme.colors.accent} />
      <Text
        style={{
          color: theme.colors.accent,
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('sm'),
        }}
      >
        {i18n.t('routePlan_homeAction')}
      </Text>
    </Button>
  )
}
