import type { ReactNode } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Circle } from 'react-native-svg'

interface Props {
  progress: number

  size?: number

  strokeWidth?: number

  color: string

  trackColor: string

  children?: ReactNode
  style?: StyleProp<ViewStyle>
}

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
      {}
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
