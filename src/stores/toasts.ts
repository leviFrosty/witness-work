import type { ReactNode } from 'react'
import { create } from 'zustand'
import type { AppIcon } from '@/components/ui/LucideIcon'
import i18n from '@/lib/locales'

export type ToastIntent =
  | 'success'
  | 'info'
  | 'error'
  | 'undo'
  | 'unlock'
  | 'news'

export type ToastPlacement = 'top' | 'bottom'

export const toastPlacement = (intent: ToastIntent): ToastPlacement =>
  intent === 'unlock' || intent === 'news' ? 'top' : 'bottom'

export type ToastCloseReason =
  | 'opened'
  | 'swiped'
  | 'action'
  | 'timeout'
  | 'background'
  | 'expired'
  | 'replaced'
  | 'dismissed'

export const toastAcknowledged = (reason: ToastCloseReason) =>
  reason === 'opened' || reason === 'swiped' || reason === 'action'

export const toastSettlesUnlock = (reason: ToastCloseReason) =>
  reason === 'swiped' || reason === 'action'

export type ToastButton = { label: string; onPress: () => void }

export type ToastAccessory = { label: string; render: () => ReactNode }

export type ToastInput = {
  title: string
  message?: string

  icon?: AppIcon

  action?: ToastButton

  accessory?: ToastAccessory

  eyebrow?: string

  art?: (size: number) => ReactNode

  onOpen?: () => void

  onShow?: () => void

  onClose?: (reason: ToastCloseReason) => void

  durationMs?: number

  expiresAt?: number

  key?: string
}

export type Toast = ToastInput & {
  id: number
  intent: ToastIntent
  createdAt: number
}

export const MAX_TOASTS = 6

type ToastsState = { toasts: Toast[] }

export const useToasts = create<ToastsState>(() => ({ toasts: [] }))

const RECENT_TOASTS = 12

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

export const toast = {
  success: (title: string, input: Omit<ToastInput, 'title'> = {}) =>
    show('success', { ...input, title }),
  info: (title: string, input: Omit<ToastInput, 'title'> = {}) =>
    show('info', { ...input, title }),
  error: (title: string, input: Omit<ToastInput, 'title'> = {}) =>
    show('error', { ...input, title }),
  news: (title: string, input: Omit<ToastInput, 'title'> = {}) =>
    show('news', { ...input, title }),

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

  dismiss: (id: number, reason: ToastCloseReason = 'dismissed') =>
    close(id, reason),
}

export const toastKeys = (toasts: readonly Toast[]): string[] =>
  toasts.flatMap((t) => (t.key ? [t.key] : []))

export function resetToasts() {
  useToasts.setState({ toasts: [] })
}
