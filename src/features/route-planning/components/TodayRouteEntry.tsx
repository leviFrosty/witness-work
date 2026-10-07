import { View } from 'react-native'
import moment from 'moment'
import {
  ChevronRight as ChevronRightIcon,
  Route as RouteIcon,
} from 'lucide-react-native'
import SupporterBadge from '@/components/SupporterBadge'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useFeatureAccess from '@/hooks/useFeatureAccess'
import i18n, { type TranslationKey } from '@/lib/locales'
import useDayRouteStops from '@/features/route-planning/hooks/useDayRouteStops'
import useOpenTodayRoute, {
  type TodayRouteEntrySurface,
} from '@/features/route-planning/hooks/useOpenTodayRoute'

/**
 * "Plan today's route" in the day view. Shows only on today, once at least two
 * stops have a location. Non-Supporters open it too: the route screen previews
 * their own stops and offers Supporter there.
 */
export default function TodayRouteEntry({
  date,
  surface,
  onNavigate,
}: {
  date: Date
  surface: TodayRouteEntrySurface
  /** Runs the navigation, e.g. after the hosting sheet closes. */
  onNavigate?: (go: () => void) => void
}) {
  const theme = useTheme()
  const { hasAccess } = useFeatureAccess('routePlanning')
  const go = useOpenTodayRoute(surface)
  const { stops } = useDayRouteStops(date)
  if (!moment(date).isSame(moment(), 'day') || stops.length < 2) return null

  return (
    <View style={{ paddingTop: 12 }}>
      <Button
        onPress={() => (onNavigate ? onNavigate(go) : go())}
        accessibilityLabel={i18n.t('routePlan_entryTitle')}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 14,
          borderRadius: theme.numbers.borderRadiusLg,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.card,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.accentTranslucent,
          }}
        >
          <LucideIcon icon={RouteIcon} size={17} color={theme.colors.accent} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: theme.fonts.semiBold }}>
            {i18n.t('routePlan_entryTitle')}
          </Text>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t('routePlan_entrySubtitle' as TranslationKey, {
              count: stops.length,
            })}
          </Text>
        </View>
        {hasAccess ? (
          <LucideIcon
            icon={ChevronRightIcon}
            size={16}
            color={theme.colors.textAlt}
          />
        ) : (
          <SupporterBadge iconOnly />
        )}
      </Button>
    </View>
  )
}
