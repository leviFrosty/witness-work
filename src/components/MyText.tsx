import { PropsWithChildren } from 'react'
import useTheme from '../contexts/theme'
import { Text as ReactNativeText, TextProps, TextStyle } from 'react-native'
import { usePreferences } from '../stores/preferences'

interface Props extends TextProps {}

const Text: React.FC<PropsWithChildren<Props>> = ({
  children,
  style,
  ...props
}) => {
  const theme = useTheme()
  const { fontSizeOffset } = usePreferences()

  const userOffsetFontSize = (incomingStyle: TextStyle) => {
    const incomingFontSize = incomingStyle.fontSize || theme.fontSize('md')
    const newFontSize = incomingFontSize + fontSizeOffset
    return { ...incomingStyle, fontSize: newFontSize }
  }

  const modifiedStyle = style ? userOffsetFontSize(style as TextStyle) : {}

  return (
    <ReactNativeText
      {...props}
      style={[
        [{ color: theme.colors.text, fontFamily: theme.fonts.regular }],
        [modifiedStyle],
      ]}
    >
      {children}
    </ReactNativeText>
  )
}

export default Text
