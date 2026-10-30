/**
 * React-native-web has no `currentlyFocusedInput`. Its only use here is
 * scrolling a field clear of the on-screen keyboard, which the browser already
 * does, so the web finds none.
 */
export const focusedInput = () => null
