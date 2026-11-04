import { Platform } from 'react-native'

/**
 * Browsers block sound until the page has had a tap or key press. This tracks
 * that, so sounds can wait for it rather than throw. Native has no such rule.
 */
const GESTURES = ['pointerdown', 'keydown', 'touchstart'] as const

type Gestures = {
  addEventListener(type: string, listener: () => void, options: object): void
  removeEventListener(type: string, listener: () => void, options: object): void
}

const OPTIONS = { capture: true, passive: true }

/**
 * Whether the user has interacted yet, and the listeners that flip it. Reads
 * the browser's own record (`navigator.userActivation`) first, where it has
 * one, so a gesture before this loaded still counts.
 */
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

/** Whether the page may play sound now: always off the web. */
export const hasUserGesture = (): boolean => tracker()
