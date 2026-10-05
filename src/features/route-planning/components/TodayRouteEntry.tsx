import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import moment from 'moment'
import {
  ChevronRight as ChevronRightIcon,
  Route as RouteIcon,
} from 'lucide-react-native'
import IsSupporter from '@/components/IsSupporter'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'
import type { RootStackNavigation } from '@/types/rootStack'
import useDayRouteStops from '@/features/route-planning/hooks/useDayRouteStops'

/**
 * "Plan today's route" in the day view. Shows only on today, once at least two
 * stops have a location; non-Supporters get the standard gate.
 */
export default function TodayRouteEntry({
  date,
  onNavigate,
}: {
  date: Date
  /** Runs the navigation, e.g. after the hosting sheet closes. */
  onNavigate?: (go: () => void) => void
}) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { stops } = useDayRouteStops(date)
  if (!moment(date).isSame(moment(), 'day') || stops.length < 2) return null

  const go = () => navigation.navigate('TodayRoute')

  return (
    <View style={{ paddingTop: 12 }}>
      <IsSupporter feature='routePlanning' analyticsSurface='today_route'>
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
            <LucideIcon
              icon={RouteIcon}
              size={17}
              color={theme.colors.accent}
            />
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
          <LucideIcon
            icon={ChevronRightIcon}
            size={16}
            color={theme.colors.textAlt}
          />
        </Button>
      </IsSupporter>
    </View>
  )
}
