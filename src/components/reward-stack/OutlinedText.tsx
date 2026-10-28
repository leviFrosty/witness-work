import { Text, View, type TextStyle } from 'react-native'
import { fonts } from '@/constants/theme'
import { tracking } from '@/lib/tracking'

/** Around each glyph, in tenths of the font size, plus a drop below. */
const OUTLINE = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.8, 0.8],
  [-0.8, 0.8],
  [0.8, -0.8],
  [-0.8, -0.8],
  [0, 2],
] as const

/**
 * Chunky game text: `text` in `color` over a hard dark outline and a drop
 * shadow, readable over anything. React Native draws one shadow at most, so the
 * outline is copies of the text behind it.
 */
export default function OutlinedText({
  text,
  size,
  color,
  stroke = '#2a1206',
}: {
  text: string
  size: number
  color: string
  stroke?: string
}) {
  const offset = size / 10
  const style: TextStyle = {
    fontSize: size,
    lineHeight: size * 1.15,
    fontFamily: fonts.bold,
    letterSpacing: tracking(-0.5),
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  }
  return (
    <View>
      {OUTLINE.map(([x, y], i) => (
        <Text
          key={i}
          allowFontScaling={false}
          style={[
            style,
            {
              color: stroke,
              position: 'absolute',
              left: x * offset,
              top: y * offset,
            },
          ]}
        >
          {text}
        </Text>
      ))}
      <Text allowFontScaling={false} style={[style, { color }]}>
        {text}
      </Text>
    </View>
  )
}
