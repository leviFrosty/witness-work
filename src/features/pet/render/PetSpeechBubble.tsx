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
 * with `right` / `bottom` so it grows away from the pet.
 */
export default function PetSpeechBubble({
  text,
  right,
  bottom,
}: {
  text: string
  right: number
  bottom: number
}) {
  const theme = useTheme()
  return (
    <View
      pointerEvents='none'
      accessibilityElementsHidden
      importantForAccessibility='no-hide-descendants'
      style={{ position: 'absolute', right, bottom }}
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
