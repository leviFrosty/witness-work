import { View, StyleProp, TextStyle, ViewStyle } from 'react-native'
import { PropsWithChildren, useContext } from 'react'
import { ThemeContext } from '../contexts/theme'
import Text from './MyText'
import { ThemeSize } from '../types/theme'

type Props = {
  color?: string
  fullWidth?: boolean
  size?: ThemeSize
  textStyle?: StyleProp<TextStyle>
  style?: StyleProp<ViewStyle>
}

const Badge: React.FC<PropsWithChildren<Props>> = ({
  color: _color,
  fullWidth,
  children,
  size = 'md',
  style,
}) => {
  const theme = useContext(ThemeContext)
  const color = _color || theme.colors.accent3

  return (
    <View
      style={[
        {
          borderRadius: theme.numbers.borderRadiusLg,
          paddingHorizontal: 15,
          paddingVertical: 2,
          backgroundColor: color,
          flex: fullWidth ? 1 : 0,
          justifyContent: 'center',
          alignItems: 'center',
        },
        [style],
      ]}
    >
      {typeof children === 'string' ? (
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            textTransform: 'uppercase',
            color: 'white' ?? theme.colors.textInverse,
            fontSize: theme.fontSize(size),
          }}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  )
}

export default Badge
