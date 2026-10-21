import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native-reanimated', () => ({
  default: { View: () => null },
  useAnimatedKeyboard: () => ({ height: { value: 0 } }),
  useAnimatedStyle: (style: () => object) => style(),
}))

import { footerLift, STEP_BOTTOM_PADDING } from './OnboardingFooter'

describe('footerLift', () => {
  it("stays put while there's no keyboard", () => {
    expect(footerLift(0)).toBe(0)
  })

  it("stays put for a keyboard that doesn't reach the footer", () => {
    expect(footerLift(STEP_BOTTOM_PADDING - 20)).toBe(0)
  })

  it('lifts the footer just above a keyboard that covers it', () => {
    // A 336 pt keyboard reaches 276 pt past the footer's resting bottom edge,
    // plus the 12 pt gap.
    expect(footerLift(336)).toBe(288)
  })
})
