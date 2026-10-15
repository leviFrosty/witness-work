import { createContext, PropsWithChildren, ReactNode, useContext } from 'react'
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
import { appDigitSystem, formatPlainNumber } from '@/lib/numbers'

/**
 * Bare numbers rendered as text (`<Text>{count}</Text>`) take the app
 * Language's digits, Arabic-Indic in Arabic. Strings stay as they are: they may
 * be names, addresses or phone numbers.
 */
const localizeNumberChildren = (children: ReactNode): ReactNode => {
  if (typeof children === 'number') return formatPlainNumber(children)
  if (Array.isArray(children))
    return children.map((child: ReactNode) =>
      typeof child === 'number' ? formatPlainNumber(child) : child
    )
  return children
}

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
  const content =
    appDigitSystem() === 'latn' ? children : localizeNumberChildren(children)

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
        <NestedText.Provider value>{content}</NestedText.Provider>
      ) : (
        content
      )}
    </ReactNativeText>
  )
}

export default Text
