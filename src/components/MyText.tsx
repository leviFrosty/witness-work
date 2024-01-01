import { PropsWithChildren } from 'react'
import useTheme from '../contexts/theme'
import { Text as ReactNativeText, TextProps } from 'react-native'

interface Props extends TextProps {}

const Text: React.FC<PropsWithChildren<Props>> = ({
  children,
  style,
  ...props
}) => {
  const theme = useTheme()

  return (
    <ReactNativeText
      {...props}
      style={[
        [{ color: theme.colors.text, fontFamily: theme.fonts.regular }],
        [style],
      ]}
    >
      {children}
    </ReactNativeText>
  )
}

export default Text
