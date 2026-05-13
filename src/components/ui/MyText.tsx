import { PropsWithChildren } from 'react'
import useTheme from '@/contexts/theme'
import {
  Text as ReactNativeText,
  TextProps,
  TextStyle,
  StyleSheet,
} from 'react-native'
import { usePreferences } from '@/stores/preferences'

interface Props extends TextProps {}

const Text: React.FC<PropsWithChildren<Props>> = ({
  children,
  style,
  ...props
}) => {
  const theme = useTheme()
  const { fontSizeOffset } = usePreferences()

  const flatStyle = (StyleSheet.flatten(style) ?? {}) as TextStyle
  const incomingFontSize = flatStyle.fontSize ?? theme.fontSize('md')
  const modifiedStyle: TextStyle = {
    ...flatStyle,
    fontSize: incomingFontSize + fontSizeOffset,
  }

  return (
    <ReactNativeText
      {...props}
      style={[
        { color: theme.colors.text, fontFamily: theme.fonts.regular },
        modifiedStyle,
      ]}
    >
      {children}
    </ReactNativeText>
  )
}

export default Text
