import { createContext, PropsWithChildren, useContext } from 'react'
import useTheme from '@/contexts/theme'
import {
  Platform,
  Text as ReactNativeText,
  TextProps,
  TextStyle,
  StyleSheet,
} from 'react-native'
import { usePreferences } from '@/stores/preferences'
import { alignText, isRtlLayout } from '@/lib/direction'
import { tracking } from '@/lib/tracking'

interface Props extends TextProps {}

// True inside a Text, where a span must not set its own alignment.
const NestedText = createContext(false)

const Text: React.FC<PropsWithChildren<Props>> = ({
  children,
  style,
  ...props
}) => {
  const theme = useTheme()
  const fontSizeOffset = usePreferences((s) => s.fontSizeOffset)
  const nested = useContext(NestedText)
  // iOS aligns unaligned text by its first letter, so a Latin name in an RTL
  // layout would sit on the left. Hug the reading start instead, as Android
  // already does; spans inside take their paragraph's alignment.
  const alignStart = Platform.OS === 'ios' && isRtlLayout() && !nested

  const flatStyle = (StyleSheet.flatten(style) ?? {}) as TextStyle
  const incomingFontSize = flatStyle.fontSize ?? theme.fontSize('md')
  const modifiedStyle: TextStyle = {
    ...flatStyle,
    fontSize: incomingFontSize + fontSizeOffset,
  }
  if (flatStyle.letterSpacing)
    modifiedStyle.letterSpacing = tracking(flatStyle.letterSpacing)

  return (
    <ReactNativeText
      {...props}
      style={[
        {
          color: theme.colors.text,
          fontFamily: theme.fonts.regular,
          ...(alignStart && { textAlign: alignText('start') }),
        },
        modifiedStyle,
      ]}
    >
      {alignStart ? (
        <NestedText.Provider value>{children}</NestedText.Provider>
      ) : (
        children
      )}
    </ReactNativeText>
  )
}

export default Text
