import type { ReactNode } from 'react'
import { View, type LayoutChangeEvent } from 'react-native'
import Svg, {
  Path,
  Defs,
  LinearGradient,
  Stop,
  Rect,
  G,
  Circle,
} from 'react-native-svg'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'

export const PAPER_BG = '#F5ECD6'
export const PAPER_BG_EDGE = '#E6D9B4'
export const PAPER_BG_BACK = '#EFE4C7'
export const PAPER_INK = '#1B2A4E'
export const PAPER_INK_SOFT = '#2A3A60'
export const PAPER_LABEL = '#7B6B49'
export const PAPER_LINE = '#C9B98F'
export const PAPER_SHADOW = 'rgba(50, 36, 14, 0.35)'

export const PAPER_WIDTH = 320
export const PAPER_HEIGHT_MIN = 480
const RAGGED_INSET = 6
const RAGGED_SEGMENTS_X = 14
const RAGGED_SEGMENTS_Y = 20

// Deterministic pseudo-random in [-1, 1] from a seed.
export function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 9999.137) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

// Build a slightly irregular rectangle path so the paper edge reads as torn.
function buildRaggedPaperPath(
  width: number,
  height: number,
  seed: number,
  jitter = 2.4
): string {
  const points: { x: number; y: number }[] = []
  const segX = RAGGED_SEGMENTS_X
  const segY = RAGGED_SEGMENTS_Y

  // Top edge, left -> right
  for (let i = 0; i <= segX; i++) {
    const t = i / segX
    points.push({
      x: width * t,
      y: pseudoRandom(seed + i * 1.3) * jitter,
    })
  }
  // Right edge, top -> bottom
  for (let i = 1; i <= segY; i++) {
    const t = i / segY
    points.push({
      x: width + pseudoRandom(seed + 100 + i * 1.7) * jitter,
      y: height * t,
    })
  }
  // Bottom edge, right -> left
  for (let i = 1; i <= segX; i++) {
    const t = i / segX
    points.push({
      x: width * (1 - t),
      y: height + pseudoRandom(seed + 200 + i * 2.1) * jitter,
    })
  }
  // Left edge, bottom -> top
  for (let i = 1; i < segY; i++) {
    const t = i / segY
    points.push({
      x: pseudoRandom(seed + 300 + i * 1.9) * jitter,
      y: height * (1 - t),
    })
  }

  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}`
  }
  d += ' Z'
  return d
}

export const BackPaperSheet = ({ height }: { height: number }) => {
  const path = buildRaggedPaperPath(PAPER_WIDTH, height, 31, 2.6)
  return (
    <View
      style={{
        position: 'absolute',
        top: 8,
        left: 16,
        transform: [{ rotate: '-1.2deg' }],
        shadowColor: PAPER_SHADOW,
        shadowOpacity: 0.5,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 10 },
      }}
    >
      <Svg width={PAPER_WIDTH} height={height}>
        <Defs>
          <LinearGradient id='backFill' x1='0' y1='0' x2='1' y2='1'>
            <Stop offset='0' stopColor={PAPER_BG_BACK} />
            <Stop offset='1' stopColor={PAPER_BG_EDGE} />
          </LinearGradient>
        </Defs>
        <Path
          d={path}
          fill='url(#backFill)'
          stroke={PAPER_BG_EDGE}
          strokeWidth={0.5}
        />
      </Svg>
    </View>
  )
}

export const PaperSurface = ({
  height,
  onLayoutContent,
  children,
}: {
  height: number
  onLayoutContent: (e: LayoutChangeEvent) => void
  children: ReactNode
}) => {
  const path = buildRaggedPaperPath(PAPER_WIDTH, height, 7, 2.2)

  const fibers = (() => {
    const fiberCount = Math.round(60 * (height / PAPER_HEIGHT_MIN))
    const arr: { cx: number; cy: number; r: number; o: number }[] = []
    for (let i = 0; i < fiberCount; i++) {
      arr.push({
        cx: ((pseudoRandom(i + 1) + 1) / 2) * PAPER_WIDTH,
        cy: ((pseudoRandom(i + 200) + 1) / 2) * height,
        r: 0.6 + ((pseudoRandom(i + 400) + 1) / 2) * 0.8,
        o: 0.04 + ((pseudoRandom(i + 600) + 1) / 2) * 0.06,
      })
    }
    return arr
  })()

  return (
    <View
      style={{
        width: PAPER_WIDTH,
        transform: [{ rotate: '0.6deg' }],
        shadowColor: PAPER_SHADOW,
        shadowOpacity: 0.5,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 12 },
      }}
    >
      <View>
        <Svg
          width={PAPER_WIDTH}
          height={height}
          style={{ position: 'absolute' }}
        >
          <Defs>
            <LinearGradient id='paperFill' x1='0' y1='0' x2='1' y2='1'>
              <Stop offset='0' stopColor='#F8F0DA' />
              <Stop offset='0.5' stopColor={PAPER_BG} />
              <Stop offset='1' stopColor={PAPER_BG_EDGE} />
            </LinearGradient>
            <LinearGradient id='foldShade' x1='0' y1='0' x2='0.7' y2='1'>
              <Stop offset='0' stopColor='#000' stopOpacity='0' />
              <Stop offset='0.55' stopColor='#000' stopOpacity='0.04' />
              <Stop offset='0.6' stopColor='#000' stopOpacity='0' />
            </LinearGradient>
          </Defs>

          <Path
            d={path}
            fill='url(#paperFill)'
            stroke={PAPER_BG_EDGE}
            strokeWidth={0.5}
          />

          {/* Subtle paper fibers */}
          <G>
            {fibers.map((f, i) => (
              <Circle
                key={i}
                cx={f.cx}
                cy={f.cy}
                r={f.r}
                fill='#7A6A45'
                opacity={f.o}
              />
            ))}
          </G>

          {/* Soft fold shading */}
          <Rect
            x={0}
            y={0}
            width={PAPER_WIDTH}
            height={height}
            fill='url(#foldShade)'
          />

          {/* Inner shadow tint at edges */}
          <Path
            d={path}
            fill='none'
            stroke='rgba(110, 84, 38, 0.18)'
            strokeWidth={2}
          />
        </Svg>

        <View
          onLayout={onLayoutContent}
          style={{
            paddingHorizontal: RAGGED_INSET + 26,
            paddingTop: RAGGED_INSET + 22,
            paddingBottom: RAGGED_INSET + 22,
            minHeight: PAPER_HEIGHT_MIN,
          }}
        >
          {children}
        </View>
      </View>
    </View>
  )
}

export const PaperRow = ({
  label,
  children,
  extraGap,
  accessory,
}: {
  label: string
  children: React.ReactNode
  extraGap?: boolean
  accessory?: React.ReactNode
}) => {
  const theme = useTheme()
  return (
    <View style={{ marginTop: extraGap ? 16 : 14 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 4,
        }}
      >
        <Text
          style={{
            color: PAPER_LABEL,
            fontFamily: theme.fonts.semiBold,
            fontSize: 11,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </Text>
        {accessory}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>{children}</View>
      </View>
      <View
        style={{
          height: 1,
          backgroundColor: PAPER_LINE,
          opacity: 0.55,
          marginTop: 3,
        }}
      />
    </View>
  )
}

export const HandwrittenValue = ({
  value,
  fontFamily,
  seed,
}: {
  value: number | string
  fontFamily: string
  seed: number
}) => {
  const chars = String(value).split('')
  return (
    <View
      style={{
        flexDirection: 'row',
        minHeight: 48,
        paddingTop: 4,
        alignItems: 'flex-end',
      }}
    >
      {chars.map((ch, i) => {
        const rot = pseudoRandom(seed + i * 3.7) * 1.6
        const dy = pseudoRandom(seed + 50 + i * 2.3) * 1.6
        const inkVariation = Math.floor(pseudoRandom(seed + 90 + i) * 12)
        const inkColor = inkVariation < 0 ? PAPER_INK : PAPER_INK_SOFT
        return (
          <Text
            key={i}
            style={{
              fontFamily,
              fontSize: 30,
              color: inkColor,
              transform: [
                { rotate: `${rot.toFixed(2)}deg` },
                { translateY: dy },
              ],
              marginRight: 1,
              lineHeight: 42,
              includeFontPadding: false,
            }}
          >
            {ch}
          </Text>
        )
      })}
    </View>
  )
}
