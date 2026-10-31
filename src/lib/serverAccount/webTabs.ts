import type { SessionTabMessage } from '@/lib/serverAccount/session'

/**
 * How a browser's tabs share one account session (docs/passkeys-protocol.md,
 * "Tabs"): one refreshes at a time, under the Web Lock `ww-session`, and a
 * `BroadcastChannel` tells the others the new access token, an ended session,
 * and signing in or out. Browsers without Web Locks or the channel run each tab
 * on its own.
 */

export const SESSION_LOCK = 'ww-session'
export const SESSION_CHANNEL = 'ww-session'

export type WebTabMessage =
  | SessionTabMessage
  /**
   * This browser was wiped (signed out, signed out by the server, or another
   * account signed in): reload.
   */
  | { type: 'wiped' }
  /** This browser signed in (again): reload to pick it up. */
  | { type: 'signedIn'; sessionId: string }
  /**
   * The account key changed on another device, and the tab whose refresh was
   * refused forgot the retired key and kept the data: reload, signed out.
   */
  | { type: 'keyRetired' }
  /** This browser changed its account key and stored the new one: reload. */
  | { type: 'rekeyed' }

const isString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0

function parse(data: unknown): WebTabMessage | null {
  if (typeof data !== 'object' || data === null) return null
  const message = data as Record<string, unknown>
  switch (message.type) {
    case 'tokens':
      return isString(message.sessionId) &&
        isString(message.refreshHash) &&
        isString(message.accessToken) &&
        typeof message.accessExpiresAt === 'number'
        ? (message as WebTabMessage)
        : null
    case 'ended':
      return isString(message.sessionId) && isString(message.reason)
        ? (message as WebTabMessage)
        : null
    case 'wiped':
      return { type: 'wiped' }
    case 'signedIn':
      return isString(message.sessionId)
        ? { type: 'signedIn', sessionId: message.sessionId }
        : null
    case 'keyRetired':
      return { type: 'keyRetired' }
    case 'rekeyed':
      return { type: 'rekeyed' }
  }
  return null
}

type Deps = {
  locks: Pick<LockManager, 'request'> | undefined
  Channel: (new (name: string) => BroadcastChannel) | undefined
}

export function createSessionTabs({ locks, Channel }: Deps) {
  let channel: BroadcastChannel | null = null
  const listeners = new Set<(message: WebTabMessage) => void>()

  const open = () => {
    if (channel || !Channel) return channel
    try {
      channel = new Channel(SESSION_CHANNEL)
    } catch {
      return null
    }
    channel.onmessage = (event: MessageEvent) => {
      const message = parse(event.data)
      if (!message) return
      for (const listener of listeners) listener(message)
    }
    return channel
  }

  return {
    /** Runs `run` while no other tab holds the session lock. */
    exclusive<T>(run: () => Promise<T>): Promise<T> {
      if (!locks?.request) return run()
      return locks.request(SESSION_LOCK, run) as Promise<T>
    },
    /** Tells every other tab of this browser. */
    publish(message: WebTabMessage) {
      try {
        open()?.postMessage(message)
      } catch {
        // A closed channel: the other tabs learn it on their next refresh.
      }
    },
    /** Calls `listener` with each message another tab sends. */
    subscribe(listener: (message: WebTabMessage) => void): () => void {
      open()
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export type SessionTabs = ReturnType<typeof createSessionTabs>

/** The page's tabs. */
export const sessionTabs = createSessionTabs({
  locks: typeof navigator === 'undefined' ? undefined : navigator.locks,
  Channel:
    typeof BroadcastChannel === 'undefined' ? undefined : BroadcastChannel,
})

/** Reloads this tab: after a wipe, or to pick up a sign-in. */
export const reloadPage = () => window.location.reload()
