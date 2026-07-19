import type { ReactNode } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Circle } from 'react-native-svg'

interface Props {
  /** Fraction of the ring to fill, 0–1 (clamped). */
  progress: number
  /** Outer diameter in px. */
  size?: number
  /** Ring thickness in px. */
  strokeWidth?: number
  /** Color of the filled arc. */
  color: string
  /** Color of the unfilled track behind it. */
  trackColor: string
  /** Optional content centered inside the ring. */
  children?: ReactNode
  style?: StyleProp<ViewStyle>
}

/**
 * A minimal circular progress ring: a full track with a filled arc that grows
 * clockwise from the top (12 o'clock). Presentational only — the caller owns
 * the fraction and colors, so it suits both quota meters and any other ring
 * readout.
 */
const CircularProgress = ({
  progress,
  size = 24,
  strokeWidth = 2.5,
  color,
  trackColor,
  children,
  style,
}: Props) => {
  const clamped = Math.min(1, Math.max(0, progress))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const center = size / 2

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      {/* Rotate the whole ring so the arc starts at the top rather than 3 o'clock. */}
      <View style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Svg width={size} height={size}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={trackColor}
            strokeWidth={strokeWidth}
            fill='none'
          />
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill='none'
            strokeLinecap='round'
            strokeDasharray={clamped < 1 ? circumference : undefined}
            strokeDashoffset={
              clamped < 1 ? circumference * (1 - clamped) : undefined
            }
          />
        </Svg>
      </View>
      {children}
    </View>
  )
}

export default CircularProgress
