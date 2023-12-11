import Text from './MyText'
import useTheme from '../contexts/theme'
import Button from './Button'
import { ThemeSizes } from '../types/theme'
import React, { PropsWithChildren } from 'react'
interface Props {
  onPress: () => unknown
  disabled?: boolean
  size?: ThemeSizes
}

const ActionButton: React.FC<PropsWithChildren<Props>> = ({
  onPress,
  children,
  disabled,
  size = 'lg',
}) => {
  const theme = useTheme()

  return (
    <Button
      style={{
        backgroundColor: disabled
          ? theme.colors.accentAlt
          : theme.colors.accent,
        borderRadius: theme.numbers.borderRadiusSm,
        paddingVertical: 12,
        paddingHorizontal: 24,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onPress={onPress}
      disabled={disabled}
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
