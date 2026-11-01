import { View } from 'react-native'
import {
  ArrowDownUp as ArrowDownUpIcon,
  Navigation as NavigationIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import Loader from '@/components/ui/Loader'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { RouteBuilder } from '@/features/route-planning/hooks/useRouteBuilder'
import { MAX_ROUTE_STOPS } from '@/features/route-planning/lib/routeLimits'
import { routePlanErrorMessage } from '@/features/route-planning/lib/routePlanErrors'

export default function RouteActionBar({
  builder,
  bottomInset,
}: {
  builder: RouteBuilder
  bottomInset: number
}) {
  const theme = useTheme()
  const { stops, optimizing, error } = builder
  const canOptimize = stops.length >= 2 && stops.length <= MAX_ROUTE_STOPS
  const startLabel = builder.nextStop
    ? i18n.t('routePlan_navigateToStop', {
        position: builder.nextStop.position,
        name: builder.nextStop.title,
      })
    : i18n.t('routeBuilder_startRoute')
  const message = error
    ? routePlanErrorMessage(error)
    : stops.length > MAX_ROUTE_STOPS
      ? i18n.t('routeBuilder_tooManyToOptimize', { max: MAX_ROUTE_STOPS })
      : null

  return (
    <View
      style={{
        gap: 8,
        paddingTop: 12,
        paddingHorizontal: 16,
        paddingBottom: bottomInset + 12,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        backgroundColor: theme.colors.backgroundLighter,
      }}
    >
      {message && (
        <Text
          accessibilityLiveRegion='polite'
          style={{ color: theme.colors.error, fontSize: theme.fontSize('sm') }}
        >
          {message}
        </Text>
      )}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button
          onPress={builder.optimize}
          disabled={!canOptimize || optimizing}
          accessibilityLabel={i18n.t('routeBuilder_shortestOrder')}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 12,
            borderRadius: theme.numbers.borderRadiusSm,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.card,
            opacity: canOptimize ? 1 : 0.5,
          }}
        >
          {optimizing ? (
            <Loader style={{ height: 20, width: 20 }} />
          ) : (
            <LucideIcon
              icon={ArrowDownUpIcon}
              size={16}
              color={theme.colors.text}
            />
          )}
          <Text numberOfLines={1} style={{ fontFamily: theme.fonts.semiBold }}>
            {i18n.t('routeBuilder_shortestOrder')}
          </Text>
        </Button>
        <Button
          onPress={builder.startNavigation}
          disabled={stops.length === 0}
          accessibilityLabel={startLabel}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 12,
            borderRadius: theme.numbers.borderRadiusSm,
            backgroundColor:
              stops.length === 0 ? theme.colors.accentAlt : theme.colors.accent,
          }}
        >
          <LucideIcon
            icon={NavigationIcon}
            size={16}
            color={theme.colors.textInverse}
          />
          <Text
            numberOfLines={1}
            style={{
              color: theme.colors.textInverse,
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {startLabel}
          </Text>
        </Button>
      </View>
    </View>
  )
}
