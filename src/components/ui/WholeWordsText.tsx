import { PropsWithChildren, useState } from 'react'
import {
  StyleSheet,
  TextProps,
  TextStyle,
  useWindowDimensions,
} from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { splitWordShare } from '@/lib/wholeWords'

const MIN_SCALE = 0.4

export default function WholeWordsText({
  style,
  onTextLayout,
  children,
  ...props
}: PropsWithChildren<TextProps>) {
  const theme = useTheme()
  const { width, fontScale } = useWindowDimensions()

  const key = `${width}:${fontScale}:${typeof children === 'string' ? children : ''}`
  const [fit, setFit] = useState({ key, scale: 1 })
  const scale = fit.key === key ? fit.scale : 1

  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle
  const fontSize = flat.fontSize ?? theme.fontSize('md')

  return (
    <Text
      {...props}
      style={[
        style,
        scale < 1 && {
          fontSize: fontSize * scale,
          lineHeight: flat.lineHeight && flat.lineHeight * scale,
        },
      ]}
      onTextLayout={(e) => {
        onTextLayout?.(e)
        const share = splitWordShare(e.nativeEvent.lines.map((l) => l.text))
        if (share === null || scale <= MIN_SCALE) return
        setFit({
          key,
          scale: Math.max(MIN_SCALE, scale * Math.min(0.95, share)),
        })
      }}
    >
      {children}
    </Text>
  )
}
