let launching = true

/**
 * True until navigation puts its first screen on display. A screen rendered
 * while this is true is the one the user sees straight after the splash — the
 * onboarding welcome only picks up from the splash when it is that screen.
 */
export const isLaunching = () => launching

/** Called once navigation is ready and its first screen is up. */
export const markLaunched = () => {
  launching = false
}
