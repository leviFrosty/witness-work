import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg'

interface StripedFillProps {
  color: string
  size?: number
  strokeWidth?: number
  opacity?: number
}

const StripedFill = ({
  color,
  size = 7,
  strokeWidth = 2,
  opacity = 0.6,
}: StripedFillProps) => (
  <Svg
    width='100%'
    height='100%'
    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    opacity={opacity}
  >
    <Defs>
      <Pattern
        id='striped-fill'
        width={size}
        height={size}
        patternUnits='userSpaceOnUse'
      >
        <Path
          d={`M0,${size} L${size},0`}
          stroke={color}
          strokeWidth={strokeWidth}
        />
        <Path d='M-1,1 L1,-1' stroke={color} strokeWidth={strokeWidth} />
        <Path
          d={`M${size - 1},${size + 1} L${size + 1},${size - 1}`}
          stroke={color}
          strokeWidth={strokeWidth}
        />
      </Pattern>
    </Defs>
    <Rect width='100%' height='100%' fill='url(#striped-fill)' />
  </Svg>
)

export default StripedFill
