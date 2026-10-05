import { View } from 'react-native'
import Svg, { Path, Rect } from 'react-native-svg'
import Animated, {
  DerivedValue,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated'
import {
  Map as MapIcon,
  Navigation as NavigationIcon,
  UserRound as UserRoundIcon,
} from 'lucide-react-native'
import useTheme from '@/contexts/theme'
import LucideIcon from '@/components/ui/LucideIcon'
import { useMarkerColors } from '@/hooks/useMarkerColors'
import i18n from '@/lib/locales'
import { withAlpha } from '@/lib/color'
import {
  Bar,
  RevealVisualProps,
  Surface,
  TapRipple,
  VisualText,
  backOut,
  seg,
  segInOut,
  useRiseStyle,
  useVisualClock,
} from '@/features/updates/components/reveal/visuals/kit'

const SEG_X = 8
const SEG_Y = 42
const SEG_W = 176
const SEG_H = 34
const HALF = SEG_W / 2
const MAP_LABEL = { x: SEG_X + HALF * 1.5, y: SEG_Y + SEG_H / 2 }
const LIST_LABEL = { x: SEG_X + HALF * 0.5, y: SEG_Y + SEG_H / 2 }
const PANE = { x: 8, y: 88, width: 304, height: 184 }
const MARKER = 16
const SELECTED = 2
const ROWS = [
  { name: 112, detail: 168 },
  { name: 90, detail: 140 },
  { name: 128, detail: 120 },
  { name: 100, detail: 156 },
]
const FLY_FROM = { x: 160, y: 262 }
const CHIP = 46

/**
 * Map is no longer a tab: its icon lifts out of the old tab bar and settles
 * into Contacts' List | Map switch, which then flips the list to the map — pins
 * dropping in, one opening its contact.
 */
const MapVisual = ({ palette, active, reduceMotion }: RevealVisualProps) => {
  const theme = useTheme()
  const markers = useMarkerColors()
  const { intro, loop } = useVisualClock({
    active,
    reduceMotion,
    introMs: 2000,
    loopMs: 6000,
    restAt: 0.66,
  })
  const pins = [
    { x: 52, y: 58, color: markers.withinThePastWeek, pulse: true },
    { x: 138, y: 34, color: markers.longerThanAWeekAgo },
    { x: 214, y: 82, color: markers.withinThePastWeek },
    { x: 96, y: 124, color: markers.longerThanAMonthAgo },
    { x: 262, y: 136, color: markers.noConversations },
    { x: 176, y: 146, color: markers.longerThanAWeekAgo },
  ]

  const headerStyle = useRiseStyle(intro, 0, 0.2)
  const switchStyle = useRiseStyle(intro, 0.08, 0.3)
  const paneStyle = useRiseStyle(intro, 0.15, 0.45, 26)
  // 0 = the list, 1 = the map.
  const view = useDerivedValue(
    () =>
      segInOut(loop.value, 0.12, 0.26) * (1 - segInOut(loop.value, 0.86, 0.98))
  )
  const mapTap = useDerivedValue(() => seg(loop.value, 0.08, 0.2))
  const listTap = useDerivedValue(() => seg(loop.value, 0.84, 0.94))
  const pinTap = useDerivedValue(() => seg(loop.value, 0.5, 0.6))
  const callout = useDerivedValue(
    () => seg(loop.value, 0.54, 0.62) * (1 - seg(loop.value, 0.76, 0.82))
  )

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: HALF * view.value }],
  }))
  const mapLabelStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 + 0.3 * Math.sin(Math.PI * seg(intro.value, 0.8, 1)) },
    ],
  }))
  const listStyle = useAnimatedStyle(() => ({
    opacity: 1 - view.value,
    transform: [{ translateX: -36 * view.value }],
  }))
  const mapStyle = useAnimatedStyle(() => ({
    opacity: view.value,
    transform: [{ translateX: 36 * (1 - view.value) }],
  }))
  const calloutStyle = useAnimatedStyle(() => ({
    opacity: callout.value,
    transform: [{ translateY: (1 - backOut(callout.value)) * 30 }],
  }))
  // The old tab's icon, arcing up from where the tab bar was into the switch.
  const flyStyle = useAnimatedStyle(() => {
    const p = seg(intro.value, 0.5, 0.86)
    const x =
      FLY_FROM.x + (MAP_LABEL.x - FLY_FROM.x) * p + Math.sin(Math.PI * p) * 44
    const y = FLY_FROM.y + (MAP_LABEL.y - FLY_FROM.y) * p
    return {
      opacity:
        seg(intro.value, 0.36, 0.46) * (1 - seg(intro.value, 0.78, 0.88)),
      transform: [
        { translateX: x - CHIP / 2 },
        { translateY: y - CHIP / 2 },
        { scale: 1.1 - 0.6 * p },
      ],
    }
  })

  return (
    <View style={{ flex: 1 }}>
      <Animated.View
        style={[{ position: 'absolute', top: 4, left: 8 }, headerStyle]}
      >
        <VisualText
          style={{
            fontSize: 24,
            fontFamily: theme.fonts.bold,
            color: palette.text,
          }}
        >
          {i18n.t('contacts_screen_title')}
        </VisualText>
      </Animated.View>

      <Animated.View
        style={[
          {
            position: 'absolute',
            top: SEG_Y,
            left: SEG_X,
            width: SEG_W,
            height: SEG_H,
          },
          switchStyle,
        ]}
      >
        <Surface
          palette={palette}
          style={{ flex: 1, borderRadius: SEG_H / 2 }}
        />
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 3,
              left: 3,
              width: HALF - 6,
              height: SEG_H - 6,
              borderRadius: (SEG_H - 6) / 2,
              backgroundColor: withAlpha(theme.colors.accent, 0x33),
            },
            thumbStyle,
          ]}
        />
        <SwitchLabel
          label={i18n.t('contacts_view_list')}
          left={0}
          color={palette.text}
        />
        <SwitchLabel
          label={i18n.t('map')}
          left={HALF}
          color={palette.text}
          style={mapLabelStyle}
        />
      </Animated.View>
      <TapRipple
        tap={mapTap}
        color={theme.colors.accent}
        size={40}
        style={{ left: MAP_LABEL.x - 20, top: MAP_LABEL.y - 20 }}
      />
      <TapRipple
        tap={listTap}
        color={theme.colors.accent}
        size={40}
        style={{ left: LIST_LABEL.x - 20, top: LIST_LABEL.y - 20 }}
      />

      <Animated.View
        style={[
          {
            position: 'absolute',
            top: PANE.y,
            left: PANE.x,
            width: PANE.width,
            height: PANE.height,
          },
          paneStyle,
        ]}
      >
        <Surface
          palette={palette}
          style={{ flex: 1, overflow: 'hidden', borderRadius: 20 }}
        >
          <Animated.View
            style={[{ position: 'absolute', inset: 0, padding: 10 }, listStyle]}
          >
            {ROWS.map((row, i) => (
              <View
                key={i}
                style={{
                  height: 41,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: 6,
                }}
              >
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: withAlpha(theme.colors.indigo, 0x2e),
                  }}
                >
                  <LucideIcon
                    icon={UserRoundIcon}
                    size={15}
                    color={theme.colors.indigo}
                  />
                </View>
                <View style={{ gap: 6 }}>
                  <Bar palette={palette} width={row.name} height={9} />
                  <Bar palette={palette} width={row.detail} height={6} />
                </View>
              </View>
            ))}
          </Animated.View>

          <Animated.View style={[{ position: 'absolute', inset: 0 }, mapStyle]}>
            <Svg
              width={PANE.width}
              height={PANE.height}
              viewBox={`0 0 ${PANE.width} ${PANE.height}`}
            >
              <Rect
                x={196}
                y={8}
                width={92}
                height={48}
                rx={12}
                fill={withAlpha(theme.colors.accent, 0x26)}
              />
              <Path
                d='M-6 166 C 70 144, 150 182, 310 150'
                stroke={withAlpha(theme.colors.cyan, 0x33)}
                strokeWidth={12}
                fill='none'
              />
              <Path
                d='M-6 98 C 60 80, 130 114, 310 72'
                stroke={palette.mapRoad}
                strokeWidth={9}
                strokeLinecap='round'
                fill='none'
              />
              <Path
                d='M84 -6 L 104 190'
                stroke={palette.mapRoad}
                strokeWidth={6}
              />
              <Path
                d='M-6 26 L 310 50'
                stroke={palette.mapRoad}
                strokeWidth={5}
              />
              <Path
                d='M236 -6 L 220 190'
                stroke={palette.mapRoad}
                strokeWidth={4}
              />
              <Path
                d='M152 -6 L 162 190'
                stroke={palette.mapRoad}
                strokeWidth={3}
              />
            </Svg>
            {pins.map((pin, i) => (
              <Pin
                key={i}
                index={i}
                x={pin.x}
                y={pin.y}
                color={pin.color}
                pulse={pin.pulse}
                selected={i === SELECTED}
                loop={loop}
                callout={callout}
              />
            ))}
            <TapRipple
              tap={pinTap}
              color={theme.colors.accent}
              size={36}
              style={{
                left: pins[SELECTED].x - 18,
                top: pins[SELECTED].y - 18,
              }}
            />
            <Animated.View
              style={[
                { position: 'absolute', left: 10, right: 10, bottom: 10 },
                calloutStyle,
              ]}
            >
              <Surface
                palette={palette}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  padding: 10,
                  borderRadius: 16,
                  backgroundColor: theme.colors.card,
                }}
              >
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: withAlpha(theme.colors.indigo, 0x2e),
                  }}
                >
                  <LucideIcon
                    icon={UserRoundIcon}
                    size={16}
                    color={theme.colors.indigo}
                  />
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Bar palette={palette} width={116} height={9} />
                  <Bar palette={palette} width={78} height={6} />
                </View>
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.colors.accent,
                  }}
                >
                  <LucideIcon
                    icon={NavigationIcon}
                    size={14}
                    strokeWidth={2.4}
                    color={theme.colors.textInverse}
                  />
                </View>
              </Surface>
            </Animated.View>
          </Animated.View>
        </Surface>
      </Animated.View>

      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            width: CHIP,
            height: CHIP,
            borderRadius: CHIP / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.purple,
            shadowColor: theme.colors.purple,
            shadowOpacity: 0.4,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
          },
          flyStyle,
        ]}
      >
        <LucideIcon
          icon={MapIcon}
          size={22}
          strokeWidth={2.4}
          color='#FFFFFF'
        />
      </Animated.View>
    </View>
  )
}

const SwitchLabel = ({
  label,
  left,
  color,
  style,
}: {
  label: string
  left: number
  color: string
  style?: ReturnType<typeof useAnimatedStyle>
}) => (
  <Animated.View
    style={[
      {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left,
        width: HALF,
        alignItems: 'center',
        justifyContent: 'center',
      },
      style,
    ]}
  >
    <VisualText style={{ fontSize: 13, color }}>{label}</VisualText>
  </Animated.View>
)

/** A contact on the map, dropping in once the map shows. */
const Pin = ({
  index,
  x,
  y,
  color,
  pulse,
  selected,
  loop,
  callout,
}: {
  index: number
  x: number
  y: number
  color: string
  pulse?: boolean
  selected: boolean
  loop: DerivedValue<number>
  callout: DerivedValue<number>
}) => {
  const theme = useTheme()
  const pinStyle = useAnimatedStyle(() => {
    const p = seg(loop.value, 0.24 + index * 0.04, 0.34 + index * 0.04)
    return {
      opacity: Math.min(1, p * 3),
      transform: [
        { translateY: -(1 - backOut(p)) * 18 },
        { scale: selected ? 1 + 0.35 * callout.value : 1 },
      ],
    }
  })
  const ringStyle = useAnimatedStyle(() => {
    const r = (loop.value * 3.75) % 1
    return {
      opacity: pulse ? (1 - r) * 0.5 * seg(loop.value, 0.3, 0.4) : 0,
      transform: [{ scale: 1 + r * 1.6 }],
    }
  })
  const dot = {
    position: 'absolute' as const,
    width: MARKER,
    height: MARKER,
    borderRadius: MARKER / 2,
    backgroundColor: color,
  }
  return (
    <View
      style={{
        position: 'absolute',
        left: x - MARKER / 2,
        top: y - MARKER / 2,
        width: MARKER,
        height: MARKER,
      }}
    >
      <Animated.View style={[dot, ringStyle]} />
      <Animated.View
        style={[
          dot,
          {
            borderWidth: 3,
            borderColor: '#FFFFFF',
            shadowColor: theme.colors.shadow,
            shadowOpacity: 0.25,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 },
          },
          pinStyle,
        ]}
      />
    </View>
  )
}

export default MapVisual
