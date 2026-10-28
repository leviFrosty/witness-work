import type { ReactNode } from 'react'
import { create } from 'zustand'
import type { AppIcon } from '@/components/ui/LucideIcon'
import i18n from '@/lib/locales'

/**
 * What a toast is for, which decides where it shows and how long it stays
 * (`docs/toasts.md`):
 *
 * - `success`, `info`, `error`: the result of something the User just did.
 * - `undo`: a finished action they can take back.
 * - `unlock`: something they earned (a badge, a pet item). Tapping it opens the
 *   full-screen moment; one they don't act on waits in the notifications tray.
 * - `news`: something the app brings them that they didn't just do, like an alert
 *   arriving while the app is open.
 */
export type ToastIntent =
  | 'success'
  | 'info'
  | 'error'
  | 'undo'
  | 'unlock'
  | 'news'

export type ToastPlacement = 'top' | 'bottom'

/**
 * The User's own action answers at the bottom, near their thumb; what the app
 * brings them drops in from the top.
 */
export const toastPlacement = (intent: ToastIntent): ToastPlacement =>
  intent === 'unlock' || intent === 'news' ? 'top' : 'bottom'

/**
 * Why a toast left. `opened`, `swiped` and `action` mean the User dealt with
 * it; the rest mean they may not have seen it, so an unlock stays in the tray.
 */
export type ToastCloseReason =
  /** Tapped open (an unlock's full-screen moment). */
  | 'opened'
  /** Swiped away. */
  | 'swiped'
  /** Its button (Undo) was tapped. */
  | 'action'
  /** Its time ran out. */
  | 'timeout'
  /** The app went to the background while it showed. */
  | 'background'
  /** It never got on screen before its moment passed. */
  | 'expired'
  /** A newer toast took its place. */
  | 'replaced'
  /** Closed in code. */
  | 'dismissed'

/** Whether the User dealt with a toast that closed for `reason`. */
export const toastAcknowledged = (reason: ToastCloseReason) =>
  reason === 'opened' || reason === 'swiped' || reason === 'action'

/**
 * Whether an unlock that closed for `reason` is settled now. One that was
 * opened is settled by its full-screen moment when that closes, so it stays
 * news if the moment never gets to play.
 */
export const toastSettlesUnlock = (reason: ToastCloseReason) =>
  reason === 'swiped' || reason === 'action'

export type ToastButton = { label: string; onPress: () => void }

/**
 * A small picture after a bottom toast's text, like what a save earned
 * (`measureReward`). `label` is read out with the toast.
 */
export type ToastAccessory = { label: string; render: () => ReactNode }

export type ToastInput = {
  title: string
  message?: string
  /** Leads `success`, `info`, `error` and `news` toasts. */
  icon?: AppIcon
  /** A trailing text button, like Undo. */
  action?: ToastButton
  /** Trails a bottom toast's text, before its button. */
  accessory?: ToastAccessory
  /** An unlock's small heading, e.g. "New badge". */
  eyebrow?: string
  /** An unlock's picture, drawn `size` points square. */
  art?: (size: number) => ReactNode
  /** Tapping the toast. Unlocks open their full-screen moment here. */
  onOpen?: () => void
  /** Runs once when it first shows on screen. */
  onShow?: () => void
  /** Runs once when it leaves, with why. */
  onClose?: (reason: ToastCloseReason) => void
  /** Time on screen; each intent has a default. */
  durationMs?: number
  /**
   * Must be on screen by then (epoch ms), or it closes as `expired`: an unlock
   * waiting behind a takeover stops once its action's moment has passed.
   */
  expiresAt?: number
  /**
   * What it's about, e.g. `badge:yearRound.2`. A toast with the same key
   * replaces the one before, and the tray leaves out keys on screen.
   */
  key?: string
}

export type Toast = ToastInput & {
  id: number
  intent: ToastIntent
  createdAt: number
}

/** Most toasts kept per placement; the oldest goes when another arrives. */
export const MAX_TOASTS = 6

type ToastsState = { toasts: Toast[] }

/**
 * Every toast showing or waiting to show, oldest first, in memory only.
 * `ToastHost` near the app root draws them; feature code calls `toast`.
 */
export const useToasts = create<ToastsState>(() => ({ toasts: [] }))

/** Recent toasts kept for Developer Tools to replay. */
const RECENT_TOASTS = 12

/** The last toasts shown, newest first, in memory only (Developer Tools). */
export const useRecentToasts = create<{ recent: Toast[] }>(() => ({
  recent: [],
}))

let nextId = 0

function close(id: number, reason: ToastCloseReason) {
  const current = useToasts.getState().toasts.find((t) => t.id === id)
  if (!current) return
  useToasts.setState(({ toasts }) => ({
    toasts: toasts.filter((t) => t.id !== id),
  }))
  current.onClose?.(reason)
}

function show(intent: ToastIntent, input: ToastInput): number {
  nextId += 1
  const created: Toast = { ...input, intent, id: nextId, createdAt: Date.now() }
  const placement = toastPlacement(intent)
  const { toasts } = useToasts.getState()
  // The same thing again replaces itself: tapping Copy twice shows one toast.
  const replaced = toasts.filter(
    (t) =>
      (input.key !== undefined && t.key === input.key) ||
      (intent !== 'unlock' &&
        t.intent === intent &&
        t.title === input.title &&
        t.message === input.message)
  )
  const kept = toasts.filter((t) => !replaced.includes(t))
  const samePlace = kept.filter((t) => toastPlacement(t.intent) === placement)
  const overflow = samePlace.slice(
    0,
    Math.max(0, samePlace.length - (MAX_TOASTS - 1))
  )
  useToasts.setState({ toasts: [...kept, created] })
  // A replay moves to the front rather than listing twice.
  useRecentToasts.setState(({ recent }) => ({
    recent: [
      created,
      ...recent.filter(
        (t) =>
          t.intent !== intent ||
          t.title !== input.title ||
          t.message !== input.message
      ),
    ].slice(0, RECENT_TOASTS),
  }))
  for (const old of [...replaced, ...overflow]) {
    if (useToasts.getState().toasts.some((t) => t.id === old.id)) {
      useToasts.setState(({ toasts }) => ({
        toasts: toasts.filter((t) => t.id !== old.id),
      }))
    }
    old.onClose?.('replaced')
  }
  return created.id
}

/**
 * The app's in-app toasts. Separate from the notifications tray, which an
 * unlock nobody acted on joins through its own feature's tray item.
 *
 * ```ts
 * toast.success(i18n.t('copied'))
 * toast.undo({ title: i18n.t('contactDismissed'), onUndo: restore })
 * toast.unlock({ eyebrow, title, art, onOpen, onClose, key })
 * ```
 */
export const toast = {
  success: (title: string, input: Omit<ToastInput, 'title'> = {}) =>
    show('success', { ...input, title }),
  info: (title: string, input: Omit<ToastInput, 'title'> = {}) =>
    show('info', { ...input, title }),
  error: (title: string, input: Omit<ToastInput, 'title'> = {}) =>
    show('error', { ...input, title }),
  news: (title: string, input: Omit<ToastInput, 'title'> = {}) =>
    show('news', { ...input, title }),
  /** A finished action with Undo. */
  undo: ({
    title,
    onUndo,
    ...input
  }: Omit<ToastInput, 'action'> & { onUndo: () => void }) =>
    show('undo', {
      ...input,
      title,
      action: { label: i18n.t('undo'), onPress: onUndo },
    }),
  unlock: (input: ToastInput) => show('unlock', input),
  /** Closes a toast; with no reason, as `dismissed`. */
  dismiss: (id: number, reason: ToastCloseReason = 'dismissed') =>
    close(id, reason),
}

/** The keys of the toasts showing or waiting to show, for the tray. */
export const toastKeys = (toasts: readonly Toast[]): string[] =>
  toasts.flatMap((t) => (t.key ? [t.key] : []))

/** Tests only: forgets every toast without closing them. */
export function resetToasts() {
  useToasts.setState({ toasts: [] })
}
