import { AccessibilityInfo } from 'react-native'
import type { ToastIntent } from '@/stores/toasts'

/**
 * Each intent's time on screen. Undo matches the Follow-up card's; an unlock
 * stays long enough to read its art and decide whether to open it.
 */
export const TOAST_MS: Record<ToastIntent, number> = {
  success: 3000,
  info: 4000,
  error: 5000,
  undo: 5000,
  unlock: 8000,
  news: 5000,
}

/**
 * How long a toast with a button stays while VoiceOver or TalkBack is on. They
 * hear the toast, then swipe to its button, which 5 s rarely allows; WCAG 2.2.1
 * asks for at least ten times the default. Capped rather than held until
 * dismissed, so it doesn't stay in the swipe order over every screen they visit
 * next.
 */
export const SCREEN_READER_ACTION_TOAST_MS = 60_000

/** A toast with nothing to press only has to be heard. */
export const SCREEN_READER_TOAST_MS = 10_000

const hasAction = (intent: ToastIntent) =>
  intent === 'undo' || intent === 'unlock'

/**
 * A toast's time on screen: `requested`, or its intent's default, lengthened
 * for a screen reader. Android raises it to the User's "Time to take action"
 * setting.
 */
export const toastDuration = async (
  intent: ToastIntent,
  screenReader: boolean,
  requested?: number
) => {
  const base = requested ?? TOAST_MS[intent]
  const ms = screenReader
    ? Math.max(
        base,
        hasAction(intent)
          ? SCREEN_READER_ACTION_TOAST_MS
          : SCREEN_READER_TOAST_MS
      )
    : base
  // Android answers 0 when it can't read the setting.
  return Math.max(ms, await AccessibilityInfo.getRecommendedTimeoutMillis(ms))
}
