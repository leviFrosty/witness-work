import { useId } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg'
import useTheme from '@/contexts/theme'
import { lightModeColors } from '@/constants/theme'
import type { BadgeArtId, BadgeLevel } from '@/types/badges'
import { BADGE_EMBLEMS } from './art/emblems'
import {
  badgePalette,
  type BadgeArtState,
  type BadgeScheme,
} from './art/palette'
import {
  EMBLEM_TRANSFORM,
  MEDALLION,
  MEDALLION_VIEWBOX,
  emblemStrokeScale,
  medallionScene,
  resolveEmblem,
  type SceneCircle,
  type SceneGradient,
} from './art/medallion'

type BadgeMedallionProps = {
  art: BadgeArtId

  level: BadgeLevel | null

  size: number

  state?: BadgeArtState

  scheme?: BadgeScheme

  face?: 'front' | 'back'
  style?: StyleProp<ViewStyle>
}

const GradientDef = ({ gradient }: { gradient: SceneGradient }) => {
  const stops = gradient.stops.map((stop, i) => (
    <Stop
      key={i}
      offset={stop.offset}
      stopColor={stop.color}
      stopOpacity={stop.opacity ?? 1}
    />
  ))
  if (gradient.kind === 'linear') {
    return (
      <LinearGradient
        id={gradient.id}
        gradientUnits='userSpaceOnUse'
        x1={gradient.x1}
        y1={gradient.y1}
        x2={gradient.x2}
        y2={gradient.y2}
      >
        {stops}
      </LinearGradient>
    )
  }
  return (
    <RadialGradient
      id={gradient.id}
      gradientUnits='userSpaceOnUse'
      cx={gradient.cx}
      cy={gradient.cy}
      r={gradient.r}
      fx={gradient.fx}
      fy={gradient.fy}
    >
      {stops}
    </RadialGradient>
  )
}

const FrameCircle = ({ circle }: { circle: SceneCircle }) => (
  <Circle
    cx={circle.cx}
    cy={circle.cy}
    r={circle.r}
    fill={circle.fill}
    stroke={circle.stroke}
    strokeWidth={circle.strokeWidth}
    strokeDasharray={circle.strokeDasharray}
  />
)

const BadgeMedallion = ({
  art,
  level,
  size,
  state = 'earned',
  scheme,
  face = 'front',
  style,
}: BadgeMedallionProps) => {
  const theme = useTheme()
  const idPrefix = `badge${useId().replace(/[^A-Za-z0-9_-]/g, '')}`
  const resolvedScheme: BadgeScheme =
    scheme ??
    (theme.colors.background === lightModeColors.background ? 'light' : 'dark')

  const palette = badgePalette(level, resolvedScheme, state)
  const front = face === 'front'
  const pips =
    front && level !== null && size >= MEDALLION.pipMinSize ? level : 0
  const scene = medallionScene(palette, idPrefix, pips)
  const parts = front
    ? resolveEmblem(BADGE_EMBLEMS[art], palette, emblemStrokeScale(size))
    : []

  return (
    <View
      style={[{ width: size, height: size }, style]}
      accessibilityElementsHidden
      importantForAccessibility='no-hide-descendants'
      pointerEvents='none'
    >
      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${MEDALLION_VIEWBOX} ${MEDALLION_VIEWBOX}`}
      >
        <Defs>
          {scene.gradients.map((gradient) => (
            <GradientDef key={gradient.id} gradient={gradient} />
          ))}
        </Defs>
        {scene.back.map((circle) => (
          <FrameCircle key={circle.key} circle={circle} />
        ))}
        <G
          transform={EMBLEM_TRANSFORM}
          opacity={palette.emblemOpacity}
          strokeLinecap='round'
          strokeLinejoin='round'
        >
          {parts.map((part) =>
            part.type === 'circle' ? (
              <Circle
                key={part.key}
                cx={part.cx}
                cy={part.cy}
                r={part.r}
                fill={part.fill}
                stroke={part.stroke}
                strokeWidth={part.strokeWidth}
                opacity={part.opacity}
              />
            ) : (
              <Path
                key={part.key}
                d={part.d}
                fill={part.fill}
                stroke={part.stroke}
                strokeWidth={part.strokeWidth}
                opacity={part.opacity}
              />
            )
          )}
        </G>
        {scene.front.map((circle) => (
          <FrameCircle key={circle.key} circle={circle} />
        ))}
      </Svg>
    </View>
  )
}

export default BadgeMedallion
