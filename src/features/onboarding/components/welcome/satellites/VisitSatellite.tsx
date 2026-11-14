import { useEffect } from 'react'
import { View } from 'react-native'
import { Bell as BellIcon } from 'lucide-react-native'
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
  SatelliteText,
} from '@/features/onboarding/components/welcome/satellites/SatelliteSurface'

const VisitSatellite = ({
  palette,
  focus,
  active,
  reduceMotion,
}: SatelliteProps) => {
  const theme = useTheme()
  const color = theme.colors.cyan
  const name = i18n.t('onboardingTour_sample_name')
  const followUp = moment().add(2, 'days').hour(10).minute(0)
  const ring = useSharedValue(0)

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
        width: 220,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <SatelliteText
          style={{
            fontSize: 17,
            fontFamily: theme.fonts.bold,
            color: '#FFFFFF',
          }}
        >
          {Array.from(name)[0] ?? ''}
        </SatelliteText>
      </View>
      <View style={{ flex: 1, gap: 5 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SatelliteText
            style={{
              flexShrink: 1,
              fontSize: 15,
              fontFamily: theme.fonts.bold,
              color: palette.text,
            }}
          >
            {name}
          </SatelliteText>
          <View
            style={{
              flexShrink: 1,
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: 8,
              backgroundColor: withAlpha(color, 0x2e),
            }}
          >
            <SatelliteText
              style={{
                fontSize: 11,
                fontFamily: theme.fonts.semiBold,
                color,
              }}
            >
              {i18n.t('defaultNavPreview_contactRole')}
            </SatelliteText>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Animated.View style={bellStyle}>
            <LucideIcon
              icon={BellIcon}
              size={12}
              color={palette.textAlt}
              strokeWidth={2.6}
            />
          </Animated.View>
          <SatelliteText
            style={{
              flexShrink: 1,
              fontSize: 12,
              fontFamily: theme.fonts.semiBold,
              color: palette.textAlt,
            }}
          >
            {i18n.t('contactDetails.upNextWhen', {
              day: followUp.format('ddd'),
              time: formatTime(followUp),
            })}
          </SatelliteText>
        </View>
      </View>
    </SatelliteSurface>
  )
}

export default VisitSatellite
