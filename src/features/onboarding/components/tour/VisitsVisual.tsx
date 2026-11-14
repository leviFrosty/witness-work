import { View } from 'react-native'
import Svg, { Path, Rect } from 'react-native-svg'
import Animated, {
  DerivedValue,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated'
import {
  Bell as BellIcon,
  MapPin as MapPinIcon,
  NotebookPen as NotebookPenIcon,
} from 'lucide-react-native'
import moment from 'moment'
import useTheme from '@/contexts/theme'
import LucideIcon from '@/components/ui/LucideIcon'
import { useMarkerColors } from '@/hooks/useMarkerColors'
import i18n from '@/lib/locales'
import { withAlpha } from '@/lib/color'
import { formatDisplay, formatTime } from '@/lib/dates'
import {
  RevealVisualProps,
  Surface,
  VISUAL,
  VisualText,
  backOut,
  seg,
  useRiseStyle,
  useVisualClock,
} from '@/features/updates/components/reveal/visuals/kit'

const CARD = { top: 0, height: 108 }
const NEXT = { top: 116, height: 62 }
const MAP = { top: 186, height: 94 }

const LOOP_MS = 6400

const RING_MS = 1600

const T = {
  note: [0.05, 0.15],
  next: [0.22, 0.32],
  bell: [0.32, 0.44],
  pins: 0.44,
  pulse: [0.6, 0.64],
  reset: [0.92, 0.97],
}

const CONTACT_PIN = { x: 172, y: 46, size: 26 }
const PIN = 15

const VisitsVisual = ({ palette, active, reduceMotion }: RevealVisualProps) => {
  const theme = useTheme()
  const markers = useMarkerColors()
  const tint = theme.colors.indigo
  const accent = theme.colors.accent
  const { intro, loop } = useVisualClock({
    active,
    reduceMotion,
    introMs: 1000,
    loopMs: LOOP_MS,
    restAt: 0.8,
  })

  const name = i18n.t('onboardingTour_sample_name')
  const initial = Array.from(name)[0] ?? ''
  const nextVisit = moment().add(2, 'days').hour(10).minute(0)

  const cardStyle = useRiseStyle(intro, 0, 0.55, 22)
  const mapStyle = useRiseStyle(intro, 0.3, 1, 22)
  const reset = useDerivedValue(() => seg(loop.value, T.reset[0], T.reset[1]))

  const noteStyle = useAnimatedStyle(() => {
    const p = seg(loop.value, T.note[0], T.note[1]) * (1 - reset.value)
    return {
      opacity: p,
      transform: [{ translateY: (1 - p) * 8 }],
    }
  })
  const nextStyle = useAnimatedStyle(() => {
    const p = seg(loop.value, T.next[0], T.next[1])
    return {
      opacity: Math.min(1, p * 1.6) * (1 - reset.value),
      transform: [
        { translateY: (1 - backOut(p)) * 14 },
        { scale: 0.9 + 0.1 * backOut(p) },
      ],
    }
  })
  const bellStyle = useAnimatedStyle(() => {
    const p = (loop.value - T.bell[0]) / (T.bell[1] - T.bell[0])
    const swing = p > 0 && p < 1 ? Math.sin(p * Math.PI * 4) * (1 - p) : 0
    return { transform: [{ rotate: `${swing * 20}deg` }] }
  })

  return (
    <View style={{ flex: 1 }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            top: CARD.top,
            height: CARD.height,
          },
          cardStyle,
        ]}
      >
        <Surface
          palette={palette}
          style={{ flex: 1, paddingHorizontal: 16, paddingTop: 14, gap: 10 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: 46,
                height: 46,
                borderRadius: 23,
                backgroundColor: tint,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <VisualText
                style={{
                  fontSize: 20,
                  fontFamily: theme.fonts.bold,
                  color: '#FFFFFF',
                }}
              >
                {initial}
              </VisualText>
            </View>
            <View style={{ flex: 1, gap: 3, alignItems: 'flex-start' }}>
              <VisualText
                minimumFontScale={0.7}
                style={{
                  fontSize: 20,
                  lineHeight: 24,
                  fontFamily: theme.fonts.bold,
                  color: palette.text,
                }}
              >
                {name}
              </VisualText>
              <View
                style={{
                  height: 20,
                  paddingHorizontal: 8,
                  borderRadius: 10,
                  justifyContent: 'center',
                  backgroundColor: withAlpha(tint, 0x2e),
                }}
              >
                <VisualText style={{ fontSize: 12, color: tint }}>
                  {i18n.t('defaultNavPreview_contactRole')}
                </VisualText>
              </View>
            </View>
          </View>
          <Animated.View
            style={[
              { flexDirection: 'row', alignItems: 'center', gap: 8 },
              noteStyle,
            ]}
          >
            <LucideIcon
              icon={NotebookPenIcon}
              size={15}
              color={palette.textAlt}
            />
            <VisualText
              minimumFontScale={0.8}
              style={{
                flex: 1,
                fontSize: 14,
                fontFamily: theme.fonts.medium,
                color: palette.text,
              }}
            >
              {i18n.t('onboardingTour_sample_note')}
            </VisualText>
          </Animated.View>
        </Surface>
      </Animated.View>

      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            top: NEXT.top,
            height: NEXT.height,
          },
          nextStyle,
        ]}
      >
        <Surface
          palette={palette}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 16,
          }}
        >
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              borderCurve: 'continuous',
              backgroundColor: withAlpha(accent, 0x2e),
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Animated.View style={bellStyle}>
              <LucideIcon
                icon={BellIcon}
                size={20}
                color={accent}
                strokeWidth={2.4}
              />
            </Animated.View>
          </View>
          <View style={{ flex: 1 }}>
            <VisualText style={{ fontSize: 12, color: palette.textAlt }}>
              {i18n.t('map_cardDetail_nextVisit')}
            </VisualText>
            <VisualText
              minimumFontScale={0.7}
              style={{
                fontSize: 20,
                lineHeight: 25,
                fontFamily: theme.fonts.bold,
                color: palette.text,
              }}
            >
              {i18n.t('contactDetails.upNextWhen', {
                day: formatDisplay(nextVisit, 'dddd'),
                time: formatTime(nextVisit),
              })}
            </VisualText>
          </View>
        </Surface>
      </Animated.View>

      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            top: MAP.top,
            height: MAP.height,
          },
          mapStyle,
        ]}
      >
        <Surface palette={palette} style={{ flex: 1 }}>
          <View
            style={{
              flex: 1,
              borderRadius: 17,
              borderCurve: 'continuous',
              overflow: 'hidden',
            }}
          >
            <Svg
              width={VISUAL.width}
              height={MAP.height}
              viewBox={`0 0 ${VISUAL.width} ${MAP.height}`}
            >
              <Rect
                x={232}
                y={-6}
                width={74}
                height={34}
                rx={10}
                fill={withAlpha(accent, 0x26)}
              />
              <Path
                d='M-4 88 C 80 72, 190 100, 324 76'
                stroke={withAlpha(theme.colors.cyan, 0x33)}
                strokeWidth={8}
                fill='none'
              />
              <Path
                d='M-4 58 C 70 46, 150 70, 324 42'
                stroke={palette.mapRoad}
                strokeWidth={6}
                strokeLinecap='round'
                fill='none'
              />
              <Path
                d='M110 -4 L 122 98'
                stroke={palette.mapRoad}
                strokeWidth={3.5}
              />
              <Path
                d='M222 -4 L 212 98'
                stroke={palette.mapRoad}
                strokeWidth={3.5}
              />
              <Path
                d='M-4 26 L 324 18'
                stroke={palette.mapRoad}
                strokeWidth={3}
              />
              <Path
                d='M56 -4 L 50 98'
                stroke={palette.mapRoad}
                strokeWidth={2}
              />
            </Svg>
            <Pin
              x={70}
              y={64}
              index={0}
              color={markers.longerThanAWeekAgo}
              loop={loop}
              reset={reset}
            />
            <ContactPin
              initial={initial}
              color={tint}
              loop={loop}
              reset={reset}
            />
            <Pin
              x={262}
              y={54}
              index={2}
              color={markers.withinThePastWeek}
              loop={loop}
              reset={reset}
            />
            <View
              style={{
                position: 'absolute',
                left: 8,
                top: 8,
                height: 24,
                paddingHorizontal: 9,
                borderRadius: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                backgroundColor: palette.base,
                borderWidth: 1,
                borderColor: palette.surfaceBorder,
              }}
            >
              <LucideIcon
                icon={MapPinIcon}
                size={13}
                color={theme.colors.cyan}
                strokeWidth={2.4}
              />
              <VisualText style={{ fontSize: 12, color: palette.text }}>
                {i18n.t('onboardingTour_contacts_callsNearYou')}
              </VisualText>
            </View>
          </View>
        </Surface>
      </Animated.View>
    </View>
  )
}

const dropAt = (index: number) => {
  'worklet'
  return T.pins + index * 0.05
}

const usePinDrop = (
  index: number,
  loop: DerivedValue<number>,
  reset: DerivedValue<number>
) =>
  useAnimatedStyle(() => {
    const from = dropAt(index)
    const p = seg(loop.value, from, from + 0.08)
    return {
      opacity: Math.min(1, p * 3) * (1 - reset.value),
      transform: [{ translateY: (backOut(p) - 1) * 18 }],
    }
  })

const Pin = ({
  x,
  y,
  index,
  color,
  loop,
  reset,
}: {
  x: number
  y: number
  index: number
  color: string
  loop: DerivedValue<number>
  reset: DerivedValue<number>
}) => {
  const style = usePinDrop(index, loop, reset)
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: x - PIN / 2,
          top: y - PIN / 2,
          width: PIN,
          height: PIN,
          borderRadius: PIN / 2,
          borderWidth: 2.5,
          borderColor: '#FFFFFF',
          backgroundColor: color,
        },
        style,
      ]}
    />
  )
}

const ContactPin = ({
  initial,
  color,
  loop,
  reset,
}: {
  initial: string
  color: string
  loop: DerivedValue<number>
  reset: DerivedValue<number>
}) => {
  const theme = useTheme()
  const { x, y, size } = CONTACT_PIN
  const style = usePinDrop(1, loop, reset)
  const ringStyle = useAnimatedStyle(() => {
    const on = seg(loop.value, T.pulse[0], T.pulse[1]) * (1 - reset.value)
    const ring = ((loop.value * LOOP_MS) / RING_MS) % 1
    return {
      opacity: (1 - ring) * 0.5 * on,
      transform: [{ scale: 1 + ring * 1.3 }],
    }
  })
  return (
    <View
      style={{
        position: 'absolute',
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
      }}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
          },
          ringStyle,
        ]}
      />
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 2.5,
            borderColor: '#FFFFFF',
            backgroundColor: color,
            alignItems: 'center',
            justifyContent: 'center',
          },
          style,
        ]}
      >
        <VisualText
          style={{
            fontSize: 12,
            lineHeight: 15,
            fontFamily: theme.fonts.bold,
            color: '#FFFFFF',
          }}
        >
          {initial}
        </VisualText>
      </Animated.View>
    </View>
  )
}

export default VisitsVisual
