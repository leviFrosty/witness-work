import { TextInput } from 'react-native'

/** The text field that has focus, if any. */
export const focusedInput = () => TextInput.State.currentlyFocusedInput()
