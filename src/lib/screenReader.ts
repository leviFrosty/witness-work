/**
 * Keeps a wrapper (a `Pressable` or `View` around content) out of the screen
 * reader's way while the content inside stays readable on its own.
 *
 * `accessible={false}` alone isn't enough on Android: a `Pressable` stays
 * focusable through its own `focusable` prop, so TalkBack still stops on it and
 * reads all the text inside as one item, announced "disabled" when the wrapper
 * has nothing to do.
 */
export const transparentToScreenReaders = {
  accessible: false,
  focusable: false,
  importantForAccessibility: 'no',
} as const

/**
 * Hides content and everything inside it from screen readers, on both
 * platforms: decoration, or text another element already reads.
 */
export const hiddenFromScreenReaders = {
  accessible: false,
  focusable: false,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const
