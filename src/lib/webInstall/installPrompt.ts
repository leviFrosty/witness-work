import { useSyncExternalStore } from 'react'

/** Chromium's `beforeinstallprompt` event, which no DOM type lists. */
export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type State = { event: InstallPromptEvent | null; installed: boolean }

let state: State = { event: null, installed: false }
let started = false
const listeners = new Set<() => void>()

function set(next: State) {
  state = next
  listeners.forEach((listener) => listener())
}

/**
 * Listens for the browser's install prompt, as early as the web entry can: it
 * fires once, soon after load, possibly before the app has rendered. The event
 * is kept (and its own mini-infobar suppressed) so the banner's Install button
 * can use it later. Safe to call twice.
 */
export function startInstallPromptCapture(): void {
  if (started || typeof window === 'undefined') return
  started = true
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    set({ ...state, event: event as InstallPromptEvent })
  })
  window.addEventListener('appinstalled', () => {
    set({ event: null, installed: true })
  })
}

export const installPromptState = (): State => state

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useInstallPromptState(): State {
  return useSyncExternalStore(subscribe, installPromptState)
}

/**
 * Opens the browser's install prompt. It works once per event, so a prompt the
 * User closes is spent until the browser offers another. Resolves with their
 * choice, or null when there was no prompt to open.
 */
export async function promptInstall(): Promise<
  'accepted' | 'dismissed' | null
> {
  const { event } = state
  if (!event) return null
  set({ ...state, event: null })
  try {
    await event.prompt()
    return (await event.userChoice).outcome
  } catch {
    return null
  }
}

/** Tests only. */
export function resetInstallPrompt() {
  state = { event: null, installed: false }
  listeners.clear()
}
