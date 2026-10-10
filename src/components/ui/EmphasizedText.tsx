import {
  Text as NativeText,
  type StyleProp,
  type TextProps,
  type TextStyle,
} from 'react-native'
import Text from '@/components/ui/MyText'

const MARK = '\u0001'

/**
 * A translated sentence with its placeholder values set apart, e.g. the name in
 * "You talked with Chen Wei". `translate` gets marked stand-ins for `values`
 * and returns the sentence, so word order stays the translation's. Emphasized
 * values inherit the sentence's size.
 */
export default function EmphasizedText({
  translate,
  values,
  emphasis,
  ...props
}: Omit<TextProps, 'children'> & {
  translate: (values: Record<string, string>) => string
  values: Record<string, string>
  emphasis?: StyleProp<TextStyle>
}) {
  const keys = Object.keys(values)
  const marked = Object.fromEntries(
    keys.map((key, index) => [key, `${MARK}${index}${MARK}`])
  )
  // Every other part is the index of a value.
  const parts = translate(marked).split(MARK)
  return (
    <Text {...props}>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <NativeText key={index} style={emphasis}>
            {values[keys[Number(part)]]}
          </NativeText>
        ) : (
          part
        )
      )}
    </Text>
  )
}
