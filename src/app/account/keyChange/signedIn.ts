/**
 * A session opened again (`session_opened`, or `key_changed` while signed out
 * after a change elsewhere): the sign-in after a change elsewhere is done, a
 * change of this device's own that another device's beat (still here after
 * signing back in with the account's new key) resumes and is deleted with its
 * old key, and the account's history is read, which opens what older keys
 * sealed here.
 */
export function createSignedInNote(deps: {
  /** The session's account, or null without one. */
  sessionAccountId: () => string | null
  signedOutElsewhere: () => boolean
  clearSignedOut: () => void
  /** `keyChange.resume`. */
  resume: () => Promise<unknown>
  /** The account key, if any. */
  storedKey: () => Promise<Uint8Array | null>
  refreshHistory: (key: Uint8Array, accountId: string) => Promise<unknown>
  warn: (message: string, error: unknown) => void
}): () => Promise<void> {
  return async () => {
    const accountId = deps.sessionAccountId()
    if (!accountId) return
    if (deps.signedOutElsewhere()) deps.clearSignedOut()
    void deps.resume().catch((error: unknown) => {
      deps.warn('[keyChange] resuming failed', error)
    })
    const key = await deps.storedKey().catch(() => null)
    if (key) await deps.refreshHistory(key, accountId).catch(() => undefined)
  }
}
