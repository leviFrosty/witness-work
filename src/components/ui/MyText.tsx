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
import { alignText } from '@/lib/direction'
import { tracking } from '@/lib/tracking'
import { appDigitSystem, formatPlainNumber } from '@/lib/numbers'

const localizeNumberChildren = (children: ReactNode): ReactNode => {
  if (typeof children === 'number') return formatPlainNumber(children)
  if (Array.isArray(children))
    return children.map((child: ReactNode) =>
      typeof child === 'number' ? formatPlainNumber(child) : child
    )
  return children
}

interface Props extends TextProps {}

const NestedText = createContext(false)

const Text: React.FC<PropsWithChildren<Props>> = ({
  children,
  style,
  ...props
}) => {
  const theme = useTheme()
  const fontSizeOffset = usePreferences((s) => s.fontSizeOffset)
  const nested = useContext(NestedText)

  const alignStart = Platform.OS === 'ios' && !nested

  const flatStyle = (StyleSheet.flatten(style) ?? {}) as TextStyle
  const incomingFontSize = flatStyle.fontSize ?? theme.fontSize('md')
  const modifiedStyle: TextStyle = {
    ...flatStyle,

    fontFamily: flatStyle.fontFamily ?? theme.fonts.regular,
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
