import { createContext, type PropsWithChildren, useContext } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import Animated, {
  type SharedValue,
  useAnimatedKeyboard,
  useAnimatedStyle,
} from 'react-native-reanimated'

/** How far above the screen's bottom edge each step's Wrapper ends. */
export const STEP_BOTTOM_PADDING = 60
/** Room left between the footer and the keyboard's top edge. */
const KEYBOARD_GAP = 12

/**
 * Lift needed to keep a footer that sits `STEP_BOTTOM_PADDING` above the
 * screen's bottom edge clear of a keyboard `keyboardHeight` tall.
 */
export const footerLift = (keyboardHeight: number) => {
  'worklet'
  return Math.max(keyboardHeight + KEYBOARD_GAP - STEP_BOTTOM_PADDING, 0)
}

const KeyboardHeightContext = createContext<SharedValue<number> | null>(null)

/**
 * Follows the keyboard for every step's footer, for as long as onboarding is
 * up. Reanimated stops watching the keyboard once nothing subscribes, so a
 * footer subscribing on its own would start from the height the keyboard had
 * when the previous step went away, even after it has closed.
 */
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

/**
 * A step's bottom actions, riding on top of the keyboard. On both platforms the
 * keyboard covers a step instead of resizing it, so a field's keyboard would
 * otherwise hide Continue. The lift follows the animated keyboard frame, so the
 * footer moves with it.
 */
const OnboardingFooter = ({ style, children }: PropsWithChildren<Props>) => {
  const keyboardHeight = useContext(KeyboardHeightContext)
  const lift = useAnimatedStyle(() => ({
    paddingBottom: footerLift(keyboardHeight?.value ?? 0),
  }))

  return <Animated.View style={[style, lift]}>{children}</Animated.View>
}

export default OnboardingFooter
