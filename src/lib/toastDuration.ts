import { AccessibilityInfo } from 'react-native'
import type { ToastIntent } from '@/stores/toasts'

export const TOAST_MS: Record<ToastIntent, number> = {
  success: 3000,
  info: 4000,
  error: 5000,
  undo: 5000,
  unlock: 8000,
  news: 5000,
}

export const SCREEN_READER_ACTION_TOAST_MS = 60_000

export const SCREEN_READER_TOAST_MS = 10_000

const hasAction = (intent: ToastIntent) =>
  intent === 'undo' || intent === 'unlock'

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

  return Math.max(ms, await AccessibilityInfo.getRecommendedTimeoutMillis(ms))
}
