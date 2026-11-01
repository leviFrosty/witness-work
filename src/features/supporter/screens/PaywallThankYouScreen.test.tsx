import React, { useState, type ReactNode } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  confetti: vi.fn(),
  fire: vi.fn(),
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  ScrollView: 'ScrollView',
  View: 'View',
}))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}))
vi.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: { purchaseTier: 'supporter' } }),
  useNavigation: () => ({ canGoBack: () => true }),
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({ colors: {}, fonts: {}, numbers: {}, fontSize: () => 14 }),
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/haptics', () => ({ default: { heavy: vi.fn() } }))
vi.mock('@/components/ui/layout/Wrapper', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/components/ui/ActionButton', () => ({ default: 'ActionButton' }))
vi.mock('@/components/ui/Card', () => ({ default: 'Card' }))
vi.mock('@/components/SupporterBenefits', () => ({ default: () => null }))
vi.mock('@/components/SupporterBadge', () => ({ default: () => null }))
vi.mock('@/hooks/useIsSupporter', () => ({
  default: () => ({ isSupporter: true }),
}))
vi.mock('@/hooks/useAccount', () => ({
  default: () => ({ iCloudSharingAvailable: true }),
}))
vi.mock('@/hooks/useFireworks', () => ({
  default: () => ({ fire: mocks.fire }),
}))
vi.mock('@/providers/ConfettiProvider', () => ({
  FIREWORKS_AFTER_LOTTIE_BUFFER_MS: 400,
}))
vi.mock('@/providers/AnimationViewProvider', () => ({
  CONFETTI_DELAY_MS: 150,
  CONFETTI_DURATION: 3000,
}))

import { AnimationViewContext } from '@/contexts/AnimationView'
import PaywallThankYouScreen from '@/features/supporter/screens/PaywallThankYouScreen'

function Animations({ children }: { children: ReactNode }) {
  const [overlayMounted, setOverlayMounted] = useState(false)
  const playConfetti = () => {
    mocks.confetti()
    if (!overlayMounted) setOverlayMounted(true)
  }
  return (
    <AnimationViewContext.Provider value={{ playConfetti }}>
      {children}
    </AnimationViewContext.Provider>
  )
}

let renderer: ReactTestRenderer | undefined
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  vi.clearAllMocks()
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  vi.useRealTimers()
})

it('fires the fireworks once the confetti has played', () => {
  act(() => {
    renderer = create(
      <Animations>
        <PaywallThankYouScreen />
      </Animations>
    )
  })
  expect(mocks.confetti).toHaveBeenCalledTimes(1)
  act(() => {
    vi.advanceTimersByTime(3550)
  })
  expect(mocks.fire).toHaveBeenCalledTimes(1)
  expect(mocks.confetti).toHaveBeenCalledTimes(1)
})

it('skips the fireworks when the screen closes first', () => {
  act(() => {
    renderer = create(
      <Animations>
        <PaywallThankYouScreen />
      </Animations>
    )
  })
  act(() => renderer?.unmount())
  renderer = undefined
  act(() => {
    vi.advanceTimersByTime(3550)
  })
  expect(mocks.fire).not.toHaveBeenCalled()
})
