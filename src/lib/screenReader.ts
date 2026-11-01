export const transparentToScreenReaders = {
  accessible: false,
  focusable: false,
  importantForAccessibility: 'no',
} as const

export const hiddenFromScreenReaders = {
  accessible: false,
  focusable: false,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const
