import { View, StyleProp, TextStyle } from 'react-native'
import { PropsWithChildren, useContext } from 'react'
import { ThemeContext } from '../contexts/theme'
import Text from './MyText'
import { ThemeSizes } from '../types/theme'

type Props = {
  color?: string
  fullWidth?: boolean
  size?: ThemeSizes
  textStyle?: StyleProp<TextStyle>
}

const Badge: React.FC<PropsWithChildren<Props>> = ({
  color: _color,
  fullWidth,
  children,
  textStyle,
  size = 'md',
}) => {
  const theme = useContext(ThemeContext)
  const color = _color || theme.colors.accent3

  return (
    <View
      style={{
        borderRadius: theme.numbers.borderRadiusLg,
        paddingHorizontal: 15,
        paddingVertical: 2,
        backgroundColor: color,
        flex: fullWidth ? 1 : 0,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {typeof children === 'string' ? (
        <Text
          style={[
            [
              {
                fontFamily: theme.fonts.semiBold,
                textTransform: 'uppercase',
                fontSize: theme.fontSize(size),
              },
            ],
            [textStyle],
          ]}
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
