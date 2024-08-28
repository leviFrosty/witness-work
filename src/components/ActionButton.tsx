import Text from './MyText'
import useTheme from '../contexts/theme'
import Button, { ButtonProps } from './Button'
import { ThemeSize } from '../types/theme'
import React, { PropsWithChildren } from 'react'
import { StyleProp, ViewStyle } from 'react-native'
interface Props extends ButtonProps {
  onPress: () => unknown
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  size?: ThemeSize
}

const ActionButton: React.FC<PropsWithChildren<Props>> = ({
  onPress,
  children,
  disabled,
  size = 'lg',
  style,
  ...props
}) => {
  const theme = useTheme()

  return (
    <Button
      style={[
        [
          {
            backgroundColor: disabled
              ? theme.colors.accentAlt
              : theme.colors.accent,
            borderRadius: theme.numbers.borderRadiusSm,
            paddingVertical: 12,
            paddingHorizontal: 24,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
          },
        ],
        [style],
      ]}
      onPress={onPress}
      disabled={disabled}
      {...props}
    >
      {typeof children === 'string' ? (
        <Text
          style={{
            fontSize: theme.fontSize(size),
            color: theme.colors.textInverse,
            fontFamily: theme.fonts.bold,
          }}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </Button>
  )
}

export default ActionButton
