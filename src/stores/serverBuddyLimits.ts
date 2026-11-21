import { create } from 'zustand'
import { mmkvStorage } from '@/stores/mmkv'
import type { AppBuddiesConfig } from '@/lib/appUpdate/updateRequired'

const KEY = 'buddies.serverLimits'

const isPositiveInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) > 0

const parse = (raw: string | undefined): AppBuddiesConfig | null => {
  if (!raw) return null
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object') return null
  const { maxBuddies, maxOpenInvites } = value as Record<string, unknown>
  return isPositiveInteger(maxBuddies) && isPositiveInteger(maxOpenInvites)
    ? { maxBuddies, maxOpenInvites }
    : null
}

const readStored = (): AppBuddiesConfig | null => {
  try {
    return parse(mmkvStorage.getString(KEY))
  } catch {
    return null
  }
}

export const useServerBuddyLimits = create<{
  limits: AppBuddiesConfig | null
}>(() => ({ limits: readStored() }))

export const setServerBuddyLimits = (limits: AppBuddiesConfig): void => {
  const current = useServerBuddyLimits.getState().limits
  if (
    current?.maxBuddies === limits.maxBuddies &&
    current.maxOpenInvites === limits.maxOpenInvites
  )
    return
  useServerBuddyLimits.setState({ limits })
  try {
    mmkvStorage.set(KEY, JSON.stringify(limits))
  } catch {}
}
