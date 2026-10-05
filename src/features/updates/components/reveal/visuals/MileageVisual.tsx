import { useState } from 'react'
import { View } from 'react-native'
import Animated, {
  DerivedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import {
  Car as CarIcon,
  Fuel as FuelIcon,
  MapPin as MapPinIcon,
  Route as RouteIcon,
} from 'lucide-react-native'
import moment from 'moment'
import useTheme from '@/contexts/theme'
import LucideIcon from '@/components/ui/LucideIcon'
import i18n, { TranslationKey } from '@/lib/locales'
import { withAlpha } from '@/lib/color'
import useMileageFormatter from '@/features/mileage/hooks/useMileageFormatter'
import {
  IconTile,
  RevealVisualProps,
  Surface,
  VisualText,
  backOut,
  seg,
  segInOut,
  useRiseStyle,
  useVisualClock,
} from '@/features/updates/components/reveal/visuals/kit'

const ROAD_Y = 52
const ROAD_LEFT = 34
const ROAD_RIGHT = 286
const CAR = 40
// The month so far, then today's trip on top of it (in miles; shown in the
// user's own units).
const MONTH_MILES = 30.2
const TRIP_MILES = 12.4
const TRIP_COST = 2.1
const DAYS = 30
const TODAY = 22
const TRIP_DAYS: Record<number, number> = {
  2: 0.6,
  5: 0.9,
  9: 0.45,
  13: 0.75,
  16: 1,
  19: 0.55,
}
const TODAY_HEIGHT = 0.8
const BARS_H = 44

/**
 * Mileage: a car drives today's route while the month's distance climbs, then
 * the day's bar rises on the card's chart.
 */
const MileageVisual = ({
  palette,
  active,
  reduceMotion,
}: RevealVisualProps) => {
  const theme = useTheme()
  const color = theme.colors.teal
  const format = useMileageFormatter()
  const [miles, setMiles] = useState(
    reduceMotion ? MONTH_MILES + TRIP_MILES : MONTH_MILES
  )
  const { intro, loop } = useVisualClock({
    active,
    reduceMotion,
    introMs: 1400,
    loopMs: 5600,
    restAt: 0.8,
  })

  const roadStyle = useRiseStyle(intro, 0, 0.4)
  const cardStyle = useRiseStyle(intro, 0.2, 0.7, 24)
  const drive = useDerivedValue(() => segInOut(loop.value, 0.06, 0.55))
  const logged = useDerivedValue(() =>
    loop.value >= 0.94 ? 0 : seg(loop.value, 0.55, 0.68)
  )

  // The distance climbs with the car, in steps the eye can follow.
  useAnimatedReaction(
    () => Math.round((MONTH_MILES + TRIP_MILES * drive.value) * 5) / 5,
    (now, before) => {
      if (now !== before) scheduleOnRN(setMiles, now)
    }
  )

  const carStyle = useAnimatedStyle(() => {
    const p = drive.value
    const away = seg(loop.value, 0.9, 0.98)
    return {
      opacity: seg(loop.value, 0, 0.05) * (1 - away),
      transform: [
        { translateX: ROAD_LEFT - CAR / 2 + (ROAD_RIGHT - ROAD_LEFT) * p },
        { translateY: -Math.abs(Math.sin(p * Math.PI * 7)) * 2 },
        { rotate: `${Math.sin(p * Math.PI * 7) * 2}deg` },
      ],
    }
  })
  const pinStyle = useAnimatedStyle(() => {
    const hop = seg(loop.value, 0.53, 0.6) * (1 - seg(loop.value, 0.6, 0.68))
    return { transform: [{ translateY: -hop * 8 }] }
  })
  const trailStyle = useAnimatedStyle(() => ({
    width: (ROAD_RIGHT - ROAD_LEFT) * drive.value,
    opacity: 1 - seg(loop.value, 0.9, 0.98),
  }))
  const tripsBefore = useAnimatedStyle(() => ({ opacity: 1 - logged.value }))
  const tripsAfter = useAnimatedStyle(() => ({ opacity: logged.value }))

  return (
    <View style={{ flex: 1 }}>
      <Animated.View
        style={[
          { position: 'absolute', top: 0, left: 0, right: 0, height: 84 },
          roadStyle,
        ]}
      >
        <View
          style={{
            position: 'absolute',
            top: ROAD_Y,
            left: ROAD_LEFT,
            width: ROAD_RIGHT - ROAD_LEFT,
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}
        >
          {Array.from({ length: 21 }, (_, i) => (
            <View
              key={i}
              style={{
                width: 7,
                height: 3,
                borderRadius: 1.5,
                backgroundColor: palette.skeleton,
              }}
            />
          ))}
        </View>
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: ROAD_Y,
              left: ROAD_LEFT,
              height: 3,
              borderRadius: 1.5,
              backgroundColor: color,
            },
            trailStyle,
          ]}
        />
        <View style={{ position: 'absolute', top: ROAD_Y - 22, left: 6 }}>
          <LucideIcon icon={MapPinIcon} size={22} color={palette.textAlt} />
        </View>
        <Animated.View
          style={[
            { position: 'absolute', top: ROAD_Y - 24, left: ROAD_RIGHT + 4 },
            pinStyle,
          ]}
        >
          <LucideIcon icon={MapPinIcon} size={24} color={color} />
        </Animated.View>
        <Animated.View
          style={[{ position: 'absolute', top: ROAD_Y - CAR - 4 }, carStyle]}
        >
          <IconTile icon={CarIcon} color={color} size={CAR} filled />
        </Animated.View>
      </Animated.View>

      <Animated.View
        style={[
          { position: 'absolute', top: 96, left: 8, right: 8 },
          cardStyle,
        ]}
      >
        <Surface palette={palette} style={{ padding: 14, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <IconTile icon={CarIcon} color={color} size={26} />
            <VisualText
              style={{
                fontSize: 14,
                fontFamily: theme.fonts.bold,
                color: palette.text,
              }}
            >
              {i18n.t('mileage.title')}
            </VisualText>
            <VisualText style={{ fontSize: 12, color: palette.textAlt }}>
              {moment().format('MMMM')}
            </VisualText>
          </View>
          <VisualText
            style={{
              fontSize: 28,
              fontFamily: theme.fonts.bold,
              color: palette.text,
              fontVariant: ['tabular-nums'],
            }}
          >
            {format.distance(miles)}
          </VisualText>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
            >
              <LucideIcon icon={RouteIcon} size={13} color={palette.textAlt} />
              <View>
                <Animated.View style={tripsBefore}>
                  <VisualText style={{ fontSize: 12, color: palette.textAlt }}>
                    {i18n.t('mileage.tripCount' as TranslationKey, {
                      count: 6,
                    })}
                  </VisualText>
                </Animated.View>
                <Animated.View
                  style={[{ position: 'absolute', left: 0 }, tripsAfter]}
                >
                  <VisualText style={{ fontSize: 12, color: palette.textAlt }}>
                    {i18n.t('mileage.tripCount' as TranslationKey, {
                      count: 7,
                    })}
                  </VisualText>
                </Animated.View>
              </View>
            </View>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
            >
              <LucideIcon icon={FuelIcon} size={13} color={palette.textAlt} />
              <VisualText style={{ fontSize: 12, color: palette.textAlt }}>
                {format.cost(TRIP_COST * 7)}
              </VisualText>
            </View>
          </View>
          <View
            style={{
              height: BARS_H,
              flexDirection: 'row',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
            }}
          >
            {Array.from({ length: DAYS }, (_, day) => (
              <DayBar
                key={day}
                day={day}
                intro={intro}
                logged={logged}
                color={color}
                rest={palette.skeleton}
              />
            ))}
          </View>
        </Surface>
      </Animated.View>
    </View>
  )
}

const DayBar = ({
  day,
  intro,
  logged,
  color,
  rest,
}: {
  day: number
  intro: DerivedValue<number>
  logged: DerivedValue<number>
  color: string
  rest: string
}) => {
  const share = day === TODAY ? TODAY_HEIGHT : (TRIP_DAYS[day] ?? 0)
  const style = useAnimatedStyle(() => {
    const grow = backOut(
      seg(intro.value, 0.4 + day * 0.012, 0.75 + day * 0.012)
    )
    const p = day === TODAY ? logged.value : grow
    return {
      height: Math.max(4, BARS_H * share * Math.max(0, p)),
    }
  })
  return (
    <Animated.View
      style={[
        {
          width: 5,
          borderRadius: 2.5,
          backgroundColor:
            day === TODAY ? color : share > 0 ? withAlpha(color, 0xa6) : rest,
          // Days still to come stay faint.
          opacity: day > TODAY ? 0.4 : 1,
        },
        style,
      ]}
    />
  )
}

export default MileageVisual
