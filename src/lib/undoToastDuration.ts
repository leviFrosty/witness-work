import { AccessibilityInfo } from 'react-native'

/** How long Undo stays available, like the Follow-up card's. */
export const UNDO_TOAST_MS = 5000

/**
 * How long Undo stays available while VoiceOver or TalkBack is on. They hear
 * the toast, then swipe to its Undo button, which 5 s rarely allows; WCAG 2.2.1
 * asks for at least ten times the default. Capped rather than held until
 * dismissed: the toast has no close button, so it would otherwise stay in the
 * swipe order over every screen they visit next.
 */
export const SCREEN_READER_UNDO_TOAST_MS = 60_000

/**
 * The Undo toast's time on screen. Android raises it to the user's "Time to
 * take action" setting; elsewhere the recommended value is the one passed in.
 */
export const undoToastDuration = async (screenReader: boolean) => {
  const ms = screenReader ? SCREEN_READER_UNDO_TOAST_MS : UNDO_TOAST_MS
  // Android answers 0 when it can't read the setting.
  return Math.max(ms, await AccessibilityInfo.getRecommendedTimeoutMillis(ms))
}
