import { create } from 'zustand'
import { mmkvStorage } from '@/stores/mmkv'
import {
  nextServerSupporterChange,
  parseServerSupporterEntry,
  serverSupporterActive,
  type ServerSupporterEntry,
} from '@/lib/serverAccount/serverSupporter'

const KEY = 'supporter.server'

const readStored = (): ServerSupporterEntry | null => {
  try {
    return parseServerSupporterEntry(mmkvStorage.getString(KEY))
  } catch {
    return null
  }
}

/**
 * The last answer ww-api gave about the account's Supporter status
 * (`@/lib/serverAccount/serverSupporter`), for `useIsSupporter`'s fallback.
 * Device-local MMKV, outside preferences, so it never syncs. `active` flips by
 * itself at the answer's expiry.
 */
type ServerSupporterState = {
  entry: ServerSupporterEntry | null
  /**
   * The current session's account fingerprint: undefined until the session
   * loads this launch, null without one.
   */
  account: string | null | undefined
  active: boolean
}

let expiryTimer: ReturnType<typeof setTimeout> | null = null
/** SetTimeout's longest wait; a later expiry re-arms on the way. */
const MAX_TIMER_MS = 2 ** 31 - 1

const deriveAndArmExpiry = (
  entry: ServerSupporterEntry | null,
  account: string | null | undefined
): ServerSupporterState => {
  const now = Date.now()
  if (expiryTimer) clearTimeout(expiryTimer)
  expiryTimer = null
  const next = nextServerSupporterChange(entry, now)
  if (next !== null)
    expiryTimer = setTimeout(
      () => {
        const state = useServerSupporter.getState()
        useServerSupporter.setState(
          deriveAndArmExpiry(state.entry, state.account)
        )
      },
      Math.min(next - now, MAX_TIMER_MS)
    )
  return { entry, account, active: serverSupporterActive(entry, account, now) }
}

export const useServerSupporter = create<ServerSupporterState>(() =>
  deriveAndArmExpiry(readStored(), undefined)
)

export const setServerSupporterEntry = (
  entry: ServerSupporterEntry | null
): void => {
  useServerSupporter.setState(
    deriveAndArmExpiry(entry, useServerSupporter.getState().account)
  )
  try {
    if (entry) mmkvStorage.set(KEY, JSON.stringify(entry))
    else mmkvStorage.delete(KEY)
  } catch {
    // Kept in memory for this launch; the next read writes it again.
  }
}

export const setServerSupporterAccount = (account: string | null): void => {
  const state = useServerSupporter.getState()
  if (state.account === account) return
  useServerSupporter.setState(deriveAndArmExpiry(state.entry, account))
}
