import { useSyncExternalStore } from 'react'

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

export function resetInstallPrompt() {
  state = { event: null, installed: false }
  listeners.clear()
}
