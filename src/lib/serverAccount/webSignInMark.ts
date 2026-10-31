import type { SessionEndReason } from '@/lib/serverAccount/session'

/**
 * What a browser's sign-in keeps in the tab's `sessionStorage` so it outlives a
 * reload: signing in as another account wipes and reloads every tab before the
 * flow can finish (`webAccount.openWebSessionWithTicket`), and the server
 * ending a session wipes and reloads too. The wipe leaves `sessionStorage`
 * alone. Nothing secret: a passkey wrap is ciphertext only that passkey opens.
 */
export type WebSignInMark = {
  /** "Approved by …" still to show, with That Wasn't Me. */
  approvedBy?: string
  /** A wrap for the passkey that signed in but couldn't unlock, still to save. */
  wrap?: {
    accountId: string
    credentialId: string
    wrapId: string
    keyEpoch: number
    wrap: string
  }
  /** Signed in here: the web's Cloud Sync screen checks the account next. */
  cloudSync?: true
  /** Why the server signed this browser out, when it wiped (`revoked`). */
  ended?: SessionEndReason
}

const KEY = 'ww-web-sign-in'

export type WebSignInMarkStore = {
  read: () => WebSignInMark | null
  write: (mark: WebSignInMark | null) => void
}

const session = (): Storage | undefined => {
  try {
    return globalThis.sessionStorage
  } catch {
    return undefined
  }
}

/** The tab's mark. Without `sessionStorage`, nothing outlives a reload. */
export const webSignInMark: WebSignInMarkStore = {
  read: () => {
    try {
      const raw = session()?.getItem(KEY)
      return raw ? (JSON.parse(raw) as WebSignInMark) : null
    } catch {
      return null
    }
  },
  write: (mark) => {
    try {
      const empty = !mark || Object.keys(mark).length === 0
      if (empty) session()?.removeItem(KEY)
      else session()?.setItem(KEY, JSON.stringify(mark))
    } catch {
      // Private browsing with storage off: the flow finishes in memory.
    }
  },
}
