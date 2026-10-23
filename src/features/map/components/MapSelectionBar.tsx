import { View } from 'react-native'
import {
  Clock as ClockIcon,
  Navigation as NavigationIcon,
} from 'lucide-react-native'
import SupporterBadge from '@/components/SupporterBadge'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'
import MapCard from '@/features/map/components/MapCard'
import { MAP_BUTTON_HEIGHT } from '@/features/map/lib/mapStyles'

/**
 * Select mode's bar over the map: how many Contacts are picked, a way to pick
 * everyone due, and Plan Route to take them to the route builder. Only picks
 * not on today's route yet count against the room it has left.
 */
export default function MapSelectionBar({
  count,
  newCount,
  maxStops,
  todayStopCount,
  supporter,
  canSelectDue,
  onSelectDue,
  onClear,
  onDone,
  onPlanRoute,
}: {
  /** Picks in view. */
  count: number
  /** Of those, the ones not on today's route yet. */
  newCount: number
  /** The most stops a route holds. */
  maxStops: number
  /** Stops on today's route already. */
  todayStopCount: number
  /** Route planning is unlocked; otherwise Plan Route shows the badge. */
  supporter: boolean
  /** Contacts in view are due and not all picked yet. */
  canSelectDue: boolean
  onSelectDue: () => void
  onClear: () => void
  onDone: () => void
  onPlanRoute: () => void
}) {
  const theme = useTheme()
  const room = Math.max(0, maxStops - todayStopCount)
  const tooMany = newCount > room
  const canPlan = count > 0 && !tooMany

  return (
    <MapCard fill={false} onAccessibilityEscape={onDone}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            accessibilityRole='header'
            accessibilityLiveRegion='polite'
            style={{
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize('lg'),
            }}
          >
            {count > 0
              ? i18n.t('map_select_count' as TranslationKey, { count })
              : i18n.t('map_select_none')}
          </Text>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: tooMany ? theme.colors.error : theme.colors.textAlt,
            }}
          >
            {!tooMany
              ? i18n.t('map_select_hint')
              : todayStopCount > 0
                ? i18n.t('map_select_roomLeft' as TranslationKey, {
                    count: room,
                  })
                : i18n.t('map_select_tooMany', { max: maxStops })}
          </Text>
        </View>
        {count > 0 && (
          <Button
            noTransform
            accessibilityRole='button'
            onPress={onClear}
            style={{
              minHeight: MAP_BUTTON_HEIGHT,
              paddingHorizontal: 8,
              justifyContent: 'center',
              backgroundColor: 'transparent',
            }}
          >
            <Text style={{ color: theme.colors.textAlt }}>
              {i18n.t('map_select_clear')}
            </Text>
          </Button>
        )}
        <Button
          noTransform
          accessibilityRole='button'
          onPress={onDone}
          style={{
            minHeight: MAP_BUTTON_HEIGHT,
            paddingHorizontal: 8,
            marginEnd: -4,
            justifyContent: 'center',
            backgroundColor: 'transparent',
          }}
        >
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.accent,
            }}
          >
            {i18n.t('map_select_done')}
          </Text>
        </Button>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <Button
          noTransform
          hitSlop={0}
          variant='outline'
          accessibilityRole='button'
          disabled={!canSelectDue}
          onPress={onSelectDue}
          style={{
            flex: 1,
            minHeight: MAP_BUTTON_HEIGHT,
            gap: 6,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: canSelectDue ? 1 : 0.5,
          }}
        >
          <LucideIcon icon={ClockIcon} size={16} color={theme.colors.text} />
          <Text
            numberOfLines={1}
            style={{
              flexShrink: 1,
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t('map_select_due')}
          </Text>
        </Button>
        <Button
          noTransform
          hitSlop={0}
          accessibilityRole='button'
          disabled={!canPlan}
          onPress={onPlanRoute}
          style={{
            flex: 1,
            minHeight: MAP_BUTTON_HEIGHT,
            gap: 6,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.numbers.borderRadiusMd,
            backgroundColor: theme.colors.accent,
            opacity: canPlan ? 1 : 0.5,
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
              flexShrink: 1,
              color: theme.colors.textInverse,
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t('map_select_planRoute')}
          </Text>
          {!supporter && <SupporterBadge iconOnly />}
        </Button>
      </View>
    </MapCard>
  )
}
