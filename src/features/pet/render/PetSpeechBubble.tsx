import { useState } from 'react'
import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'

/** Pixel speech bubble colours: cream paper, dark brown ink. */
const PAPER = '#FFFDF6'
const INK = '#3A2A20'
/** The border and the hard shadow's offset, in points. */
const EDGE = 2

/**
 * A pet's sound in a square pixel-style bubble with a hard shadow. Position it
 * with `right` (or `left`) and `bottom` so it grows away from the pet. With
 * `left` and `within` (its container's width), it moves left as far as it must
 * to stay inside.
 */
export default function PetSpeechBubble({
  text,
  right,
  left,
  within,
  bottom,
}: {
  text: string
  bottom: number
} & (
  | { right: number; left?: never; within?: never }
  | { left: number; right?: never; within?: number }
)) {
  const theme = useTheme()
  const [bubbleWidth, setBubbleWidth] = useState<number | null>(null)
  const clamps = left !== undefined && within !== undefined
  const shownLeft =
    clamps && bubbleWidth !== null
      ? Math.max(EDGE, Math.min(left, within - bubbleWidth - EDGE * 2))
      : left
  return (
    <View
      pointerEvents='none'
      accessibilityElementsHidden
      importantForAccessibility='no-hide-descendants'
      onLayout={
        clamps
          ? (event) => setBubbleWidth(event.nativeEvent.layout.width)
          : undefined
      }
      style={{
        position: 'absolute',
        right,
        left: shownLeft,
        bottom,
        // Hidden for the one layout pass that measures it.
        opacity: clamps && bubbleWidth === null ? 0 : 1,
      }}
    >
      <View
        style={{
          position: 'absolute',
          left: EDGE,
          top: EDGE,
          right: -EDGE,
          bottom: -EDGE,
          backgroundColor: INK,
        }}
      />
      <View
        style={{
          backgroundColor: PAPER,
          borderWidth: EDGE,
          borderColor: INK,
          paddingHorizontal: 6,
          paddingVertical: 2,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            color: INK,
            fontFamily: theme.fonts.bold,
            fontSize: 11,
            lineHeight: 15,
          }}
        >
          {text}
        </Text>
      </View>
    </View>
  )
}
