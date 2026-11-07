import type { SessionEndReason } from '@/lib/serverAccount/session'

export type WebSignInMark = {
  approvedBy?: string

  wrap?: {
    accountId: string
    credentialId: string
    wrapId: string
    keyEpoch: number
    wrap: string
  }

  openedAt?: number

  cloudSync?: true

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
    } catch {}
  },
}

const LATER_KEY = 'ww-web-sign-in-later'

export const webSignInLater = {
  read: (): boolean => {
    try {
      return session()?.getItem(LATER_KEY) === '1'
    } catch {
      return false
    }
  },
  write: () => {
    try {
      session()?.setItem(LATER_KEY, '1')
    } catch {}
  },
  clear: () => {
    try {
      session()?.removeItem(LATER_KEY)
    } catch {}
  },
}
