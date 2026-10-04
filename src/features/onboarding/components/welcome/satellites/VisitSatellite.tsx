import { useEffect } from 'react'
import { Text, View } from 'react-native'
import { Bell as BellIcon, User as UserIcon } from 'lucide-react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import moment from 'moment'
import useTheme from '@/contexts/theme'
import LucideIcon from '@/components/ui/LucideIcon'
import { withAlpha } from '@/lib/color'
import { formatTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import SatelliteSurface, {
  SatelliteProps,
  Skeleton,
} from '@/features/onboarding/components/welcome/satellites/SatelliteSurface'

/** A contact with a follow-up already on the calendar. */
const VisitSatellite = ({
  palette,
  focus,
  active,
  reduceMotion,
}: SatelliteProps) => {
  const theme = useTheme()
  const color = theme.colors.cyan
  const followUp = moment().add(2, 'days').hour(10).minute(0)
  const ring = useSharedValue(0)

  // The follow-up's bell rings as the story reaches visits.
  useEffect(() => {
    if (!active || reduceMotion) return
    const swing = { duration: 140, easing: Easing.inOut(Easing.quad) }
    ring.value = withSequence(
      withTiming(1, swing),
      withTiming(-1, swing),
      withTiming(0.7, swing),
      withTiming(-0.5, swing),
      withTiming(0, swing)
    )
  }, [active, reduceMotion, ring])

  const bellStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${ring.value * 18}deg` }],
  }))

  return (
    <SatelliteSurface
      palette={palette}
      focus={focus}
      accent={color}
      style={{
        width: 190,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <View>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: withAlpha(color, 0x33),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LucideIcon icon={UserIcon} size={20} color={color} />
        </View>
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: -5,
              right: -7,
              width: 20,
              height: 20,
              borderRadius: 10,
              borderWidth: 2,
              borderColor: palette.badgeBorder,
              backgroundColor: theme.colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
            },
            bellStyle,
          ]}
        >
          <LucideIcon
            icon={BellIcon}
            size={10}
            color='#FFFFFF'
            strokeWidth={2.6}
          />
        </Animated.View>
      </View>
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton palette={palette} width='82%' />
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          style={{
            fontSize: 12,
            fontFamily: theme.fonts.medium,
            color: palette.textAlt,
          }}
        >
          {i18n.t('contactDetails.upNextWhen', {
            day: followUp.format('ddd'),
            time: formatTime(followUp),
          })}
        </Text>
      </View>
    </SatelliteSurface>
  )
}

export default VisitSatellite
