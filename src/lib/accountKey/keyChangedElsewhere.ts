import { create } from 'zustand'

export type KeyChangedElsewhere = {
  accountId: string | null

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

export const keyChangedElsewhere = (): KeyChangedElsewhere | null =>
  useKeyChangedElsewhere.getState().signedOut
