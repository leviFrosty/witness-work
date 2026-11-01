import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
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
}: StripedFillProps) => {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null)
  return (
    <View
      pointerEvents='none'
      style={StyleSheet.absoluteFill}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout
        setBox((current) =>
          current?.width === width && current.height === height
            ? current
            : { width, height }
        )
      }}
    >
      {box && (
        <Svg
          width={box.width}
          height={box.height}
          opacity={opacity}
          style={{ position: 'absolute', top: 0, left: 0 }}
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
          <Rect
            width={box.width}
            height={box.height}
            fill='url(#striped-fill)'
          />
        </Svg>
      )}
    </View>
  )
}

export default StripedFill
