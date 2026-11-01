import { Route as RouteIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'
import { mapPillStyle } from '@/features/map/lib/mapStyles'

export default function MapTodayRouteButton({
  stopCount,
  onPress,
}: {
  stopCount: number
  onPress: () => void
}) {
  const theme = useTheme()
  return (
    <Button
      variant='glass'
      accessibilityLabel={i18n.t('map_todayRoute_a11y' as TranslationKey, {
        count: stopCount,
      })}
      onPress={onPress}
      style={mapPillStyle(theme.colors.card)}
    >
      <LucideIcon
        icon={RouteIcon}
        size={theme.fontSize('sm')}
        color={theme.colors.accent}
      />
      <Text
        numberOfLines={1}
        style={{
          flexShrink: 1,
          fontSize: theme.fontSize('sm'),
          fontFamily: theme.fonts.semiBold,
        }}
      >
        {i18n.t('map_todayRoute')}
      </Text>
      <Text
        style={{
          fontSize: theme.fontSize('sm'),
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textAlt,
        }}
      >
        {stopCount}
      </Text>
    </Button>
  )
}
