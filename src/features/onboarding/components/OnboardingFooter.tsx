import { createContext, type PropsWithChildren, useContext } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import Animated, {
  type SharedValue,
  useAnimatedKeyboard,
  useAnimatedStyle,
} from 'react-native-reanimated'

export const STEP_BOTTOM_PADDING = 60

const KEYBOARD_GAP = 12

export const footerLift = (keyboardHeight: number) => {
  'worklet'
  return Math.max(keyboardHeight + KEYBOARD_GAP - STEP_BOTTOM_PADDING, 0)
}

const KeyboardHeightContext = createContext<SharedValue<number> | null>(null)

export const OnboardingKeyboardProvider = ({ children }: PropsWithChildren) => {
  const keyboard = useAnimatedKeyboard()
  return (
    <KeyboardHeightContext.Provider value={keyboard.height}>
      {children}
    </KeyboardHeightContext.Provider>
  )
}

interface Props {
  style?: StyleProp<ViewStyle>
}

const OnboardingFooter = ({ style, children }: PropsWithChildren<Props>) => {
  const keyboardHeight = useContext(KeyboardHeightContext)
  const lift = useAnimatedStyle(() => ({
    paddingBottom: footerLift(keyboardHeight?.value ?? 0),
  }))

  return <Animated.View style={[style, lift]}>{children}</Animated.View>
}

export default OnboardingFooter
