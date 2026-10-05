import { View } from 'react-native'
import Animated, { useDerivedValue } from 'react-native-reanimated'
import {
  BlurMask,
  Canvas,
  Circle,
  DashPathEffect,
  LinearGradient,
  Line,
  Path,
  Skia,
  vec,
} from '@shopify/react-native-skia'
import { ChartLine as ChartLineIcon } from 'lucide-react-native'
import useTheme from '@/contexts/theme'
import LucideIcon from '@/components/ui/LucideIcon'
import i18n from '@/lib/locales'
import { withAlpha } from '@/lib/color'
import { useFormattedMinutes } from '@/lib/minutes'
import {
  RevealVisualProps,
  Surface,
  VisualText,
  pulseWindow,
  seg,
  useRiseStyle,
  useVisualClock,
} from '@/features/updates/components/reveal/visuals/kit'

const CHART = { left: 22, top: 92, width: 276, height: 132 }
const MONTHS = 12
const STEP = CHART.width / (MONTHS - 1)
// Hours ahead of the goal line, month by month; then plans, then last year's
// shortfall — a believable year that's going well.
const AHEAD = [0, 4, 7, 9, 12, 14, 18, 21]
const PLANNED_AHEAD = [21, 24, 26]
const LAST_YEAR_BEHIND = [0, 5, 9, 11, 14, 17, 19, 22, 24, 26, 27, 28]
const TODAY = AHEAD.length - 1

const x = (month: number) => month * STEP
const goalY = (month: number) =>
  CHART.height - (CHART.height - 12) * (month / (MONTHS - 1))
const LOGGED_Y = AHEAD.map((ahead, month) => Math.max(4, goalY(month) - ahead))

const polyline = (points: [number, number][]) => {
  const builder = Skia.PathBuilder.Make()
  points.forEach(([px, py], i) =>
    i === 0 ? builder.moveTo(px, py) : builder.lineTo(px, py)
  )
  return builder.detach()
}

const goalPath = polyline(
  Array.from({ length: MONTHS }, (_, m) => [x(m), goalY(m)])
)
const lastYearPath = polyline(
  LAST_YEAR_BEHIND.map((behind, m) => [
    x(m),
    Math.min(CHART.height, goalY(m) + behind),
  ])
)
const loggedPoints = LOGGED_Y.map((y, m): [number, number] => [x(m), y])
const loggedPath = polyline(loggedPoints)
const areaPath = (() => {
  const builder = Skia.PathBuilder.Make()
  loggedPoints.forEach(([px, py], i) =>
    i === 0 ? builder.moveTo(px, py) : builder.lineTo(px, py)
  )
  builder.lineTo(x(TODAY), CHART.height).lineTo(0, CHART.height).close()
  return builder.detach()
})()
const plannedPath = polyline(
  PLANNED_AHEAD.map((ahead, i) => [
    x(TODAY + i),
    Math.max(4, goalY(TODAY + i) - ahead),
  ])
)

/**
 * Service Year Pace: the dashed goal line draws in, the year so far climbs
 * above it, and a finger scrubs through the months.
 */
const YearPaceVisual = ({
  palette,
  active,
  reduceMotion,
}: RevealVisualProps) => {
  const theme = useTheme()
  const accent = theme.colors.accent
  const ahead = useFormattedMinutes(21 * 60).formatted
  const { intro, loop } = useVisualClock({
    active,
    reduceMotion,
    introMs: 2000,
    loopMs: 4800,
    restAt: 0,
  })

  const cardStyle = useRiseStyle(intro, 0, 0.25, 22)
  const headlineStyle = useRiseStyle(intro, 0.7, 1)
  const goalEnd = useDerivedValue(() => seg(intro.value, 0.15, 0.55))
  const lastYearEnd = useDerivedValue(() => seg(intro.value, 0.25, 0.65))
  const loggedEnd = useDerivedValue(() => seg(intro.value, 0.45, 0.95))
  const areaOpacity = useDerivedValue(() => seg(intro.value, 0.7, 1))
  const plannedOpacity = useDerivedValue(() => seg(intro.value, 0.85, 1))
  const todayOpacity = useDerivedValue(() => seg(intro.value, 0.9, 1))
  const todayGlow = useDerivedValue(
    () =>
      todayOpacity.value * (0.35 + 0.35 * Math.sin(loop.value * Math.PI * 4))
  )

  // A finger scrubs from the start of the year to today and lets go.
  const scrubOpacity = useDerivedValue(() =>
    pulseWindow(loop.value, 0.12, 0.18, 0.62, 0.7)
  )
  const scrub = useDerivedValue(() => {
    const at = seg(loop.value, 0.15, 0.6) * TODAY
    const i = Math.min(TODAY - 1, Math.floor(at))
    const f = at - i
    return {
      x: at * STEP,
      y: LOGGED_Y[i] + (LOGGED_Y[i + 1] - LOGGED_Y[i]) * f,
    }
  })
  const scrubTop = useDerivedValue(() => vec(scrub.value.x, 0))
  const scrubBottom = useDerivedValue(() => vec(scrub.value.x, CHART.height))
  const scrubX = useDerivedValue(() => scrub.value.x)
  const scrubY = useDerivedValue(() => scrub.value.y)

  const legend = [
    { label: i18n.t('serviceYearPace.legend.logged'), color: accent },
    { label: i18n.t('serviceYearPace.legend.goal'), color: palette.textAlt },
    {
      label: i18n.t('serviceYearPace.legend.lastYear'),
      color: withAlpha(palette.textAlt, 0x80),
    },
  ]

  return (
    <Animated.View style={[{ flex: 1 }, cardStyle]}>
      <Surface palette={palette} style={{ flex: 1, padding: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <LucideIcon icon={ChartLineIcon} size={14} color={palette.textAlt} />
          <VisualText style={{ fontSize: 12, color: palette.textAlt }}>
            {i18n.t('serviceYearPace.title')}
          </VisualText>
        </View>
        <Animated.View style={[{ marginTop: 8 }, headlineStyle]}>
          <VisualText
            style={{
              fontSize: 22,
              fontFamily: theme.fonts.bold,
              color: accent,
            }}
          >
            {i18n.t('serviceYearPace.aheadOfPace', { value: ahead })}
          </VisualText>
        </Animated.View>
      </Surface>
      <Canvas
        style={{
          position: 'absolute',
          left: CHART.left,
          top: CHART.top,
          width: CHART.width,
          height: CHART.height,
        }}
      >
        {[0.34, 0.67].map((at) => (
          <Line
            key={at}
            p1={vec(0, CHART.height * at)}
            p2={vec(CHART.width, CHART.height * at)}
            color={palette.ringTrack}
            strokeWidth={1}
          >
            <DashPathEffect intervals={[3, 5]} />
          </Line>
        ))}
        <Path
          path={lastYearPath}
          style='stroke'
          strokeWidth={2}
          strokeJoin='round'
          strokeCap='round'
          color={withAlpha(palette.textAlt, 0x59)}
          end={lastYearEnd}
        />
        <Path
          path={goalPath}
          style='stroke'
          strokeWidth={2}
          strokeCap='round'
          color={palette.textAlt}
          end={goalEnd}
        >
          <DashPathEffect intervals={[6, 6]} />
        </Path>
        <Path path={areaPath} opacity={areaOpacity}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, CHART.height)}
            colors={[withAlpha(accent, 0x66), withAlpha(accent, 0x00)]}
          />
        </Path>
        <Path
          path={plannedPath}
          style='stroke'
          strokeWidth={3}
          strokeCap='round'
          color={accent}
          opacity={plannedOpacity}
        >
          <DashPathEffect intervals={[5, 6]} />
        </Path>
        <Path
          path={loggedPath}
          style='stroke'
          strokeWidth={3.5}
          strokeJoin='round'
          strokeCap='round'
          color={accent}
          end={loggedEnd}
        />
        <Circle
          cx={x(TODAY)}
          cy={LOGGED_Y[TODAY]}
          r={11}
          color={accent}
          opacity={todayGlow}
        >
          <BlurMask blur={6} style='normal' />
        </Circle>
        <Circle
          cx={x(TODAY)}
          cy={LOGGED_Y[TODAY]}
          r={5}
          color={accent}
          opacity={todayOpacity}
        />
        <Line
          p1={scrubTop}
          p2={scrubBottom}
          color={palette.textAlt}
          strokeWidth={1.5}
          opacity={scrubOpacity}
        />
        <Circle
          cx={scrubX}
          cy={scrubY}
          r={6}
          color={palette.base}
          opacity={scrubOpacity}
        />
        <Circle
          cx={scrubX}
          cy={scrubY}
          r={6}
          style='stroke'
          strokeWidth={3}
          color={accent}
          opacity={scrubOpacity}
        />
      </Canvas>
      <View
        style={{
          position: 'absolute',
          left: CHART.left,
          right: 18,
          bottom: 16,
          flexDirection: 'row',
          flexWrap: 'wrap',
          columnGap: 14,
          rowGap: 4,
        }}
      >
        {legend.map((item) => (
          <View
            key={item.label}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
          >
            <View
              style={{
                width: 14,
                height: 3,
                borderRadius: 1.5,
                backgroundColor: item.color,
              }}
            />
            <VisualText style={{ fontSize: 10, color: palette.textAlt }}>
              {item.label}
            </VisualText>
          </View>
        ))}
      </View>
    </Animated.View>
  )
}

export default YearPaceVisual
