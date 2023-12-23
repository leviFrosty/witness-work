import React, { PropsWithChildren } from 'react'
import { GestureResponderEvent, Pressable, PressableProps } from 'react-native'
import Haptics from '../lib/haptics'
import Animated, {
  Easing,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import useTheme from '../contexts/theme'

export interface ButtonProps extends PressableProps {
  onPress?: (event: GestureResponderEvent) => void
  onLongPress?: (event: GestureResponderEvent) => void
  disabled?: boolean
  noTransform?: boolean
  variant?: 'solid' | 'outline'
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

const Button: React.FC<PropsWithChildren<ButtonProps>> = ({
  children,
  onPress,
  onLongPress,
  style,
  disabled,
  noTransform,
  variant,
  ...props
}) => {
  const translateY = useSharedValue(0)
  const opacity = useSharedValue(1)
  const theme = useTheme()

  const _onPress = (event: GestureResponderEvent) => {
    Haptics.light()
    onPress?.(event)
  }

  const _onLongPress = (event: GestureResponderEvent) => {
    Haptics.medium()
    onLongPress?.(event)
  }

  const onPressIn = () => {
    opacity.value = 0.7
    if (noTransform) {
      return
    }
    translateY.value = withTiming(1, {
      duration: 10,
      easing: Easing.in(Easing.quad),
    })
  }

  const onPressOut = () => {
    opacity.value = 1
    if (noTransform) {
      return
    }
    translateY.value = withTiming(0, {
      duration: 20,
      easing: Easing.in(Easing.quad),
    })
  }

  const styled = !!variant

  return (
    <AnimatedPressable
      hitSlop={10}
      disabled={disabled}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onPress={onPress ? _onPress : undefined}
      onLongPress={onLongPress ? _onLongPress : undefined}
      style={[
        [
          {
            borderWidth: variant === 'outline' ? 1 : undefined,
            borderColor: styled ? theme.colors.border : undefined,
            borderRadius: styled ? theme.numbers.borderRadiusMd : undefined,
            paddingHorizontal: styled ? 15 : undefined,
            paddingVertical: styled ? 20 : undefined,
            flexDirection: styled ? 'row' : undefined,
            alignItems: styled ? 'center' : undefined,
            backgroundColor:
              variant === 'solid' ? theme.colors.card : undefined,
            transform: [{ translateY: translateY }],
            opacity,
          },
        ],
        [style],
      ]}
      {...props}
    >
      {children}
    </AnimatedPressable>
  )
}

export default Button
