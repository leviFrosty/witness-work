import { useId } from 'react'
import { StyleProp, View, ViewStyle } from 'react-native'
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg'

/**
 * A round pool of light that fades to nothing at its edge, since views can't
 * blur. `opacity` is the strength at the center.
 */
const SoftGlow = ({
  size,
  color,
  opacity,
  style,
}: {
  size: number
  color: string
  opacity: number
  style?: StyleProp<ViewStyle>
}) => {
  const id = `softGlow${useId().replace(/[^A-Za-z0-9_-]/g, '')}`
  return (
    <View
      pointerEvents='none'
      style={[{ position: 'absolute', width: size, height: size }, style]}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx='50%' cy='50%' r='50%'>
            <Stop offset='0' stopColor={color} stopOpacity={opacity} />
            <Stop
              offset='0.55'
              stopColor={color}
              stopOpacity={opacity * 0.45}
            />
            <Stop offset='1' stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </View>
  )
}

export default SoftGlow
