import {
  Text as NativeText,
  type StyleProp,
  type TextProps,
  type TextStyle,
} from 'react-native'
import Text from '@/components/ui/MyText'

const MARK = '\u0001'

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
