import { Platform } from 'react-native'

const GESTURES = ['pointerdown', 'keydown', 'touchstart'] as const

type Gestures = {
  addEventListener(type: string, listener: () => void, options: object): void
  removeEventListener(type: string, listener: () => void, options: object): void
}

const OPTIONS = { capture: true, passive: true }

export function createGestureTracker(
  target: Gestures | null,
  userActivation?: { hasBeenActive: boolean }
) {
  let activated = target === null
  const listener = () => {
    activated = true
    for (const type of GESTURES)
      target?.removeEventListener(type, listener, OPTIONS)
  }
  if (target)
    for (const type of GESTURES)
      target.addEventListener(type, listener, OPTIONS)
  return () => {
    if (userActivation?.hasBeenActive) activated = true
    return activated
  }
}

const tracker = createGestureTracker(
  Platform.OS === 'web' && typeof window !== 'undefined' ? window : null,
  typeof navigator === 'undefined' ? undefined : navigator.userActivation
)

export const hasUserGesture = (): boolean => tracker()
