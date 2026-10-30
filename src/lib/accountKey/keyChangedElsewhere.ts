import { create } from 'zustand'

/**
 * This device was signed out because the account key changed on another device
 * (docs/account-key-change.md, "Other devices"): Cloud Sync, backup and Buddies
 * stop, local data stays, and the account screens offer the ways to sign back
 * in. Kept on this device (`lib/accountKey/index.ts` persists it) until a
 * sign-in rejoins the account.
 */
export type KeyChangedElsewhere = {
  /** The account the key changed for; null when this device didn't know it. */
  accountId: string | null
  /** When the key changed (epoch ms), as the server said. */
  changedAt: number | null
}

export const useKeyChangedElsewhere = create<{
  signedOut: KeyChangedElsewhere | null
}>(() => ({ signedOut: null }))

export const parseKeyChangedElsewhere = (
  raw: string | null | undefined
): KeyChangedElsewhere | null => {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<KeyChangedElsewhere> | null
    if (typeof value !== 'object' || value === null) return null
    return {
      accountId: typeof value.accountId === 'string' ? value.accountId : null,
      changedAt: typeof value.changedAt === 'number' ? value.changedAt : null,
    }
  } catch {
    return null
  }
}

export function setKeyChangedElsewhere(value: KeyChangedElsewhere | null) {
  useKeyChangedElsewhere.setState({ signedOut: value })
}

/** Whether this device is signed out after a key change elsewhere. */
export const keyChangedElsewhere = (): KeyChangedElsewhere | null =>
  useKeyChangedElsewhere.getState().signedOut
