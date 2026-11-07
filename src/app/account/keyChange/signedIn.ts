export function createSignedInNote(deps: {
  sessionAccountId: () => string | null
  signedOutElsewhere: () => boolean
  clearSignedOut: () => void

  resume: () => Promise<unknown>

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
