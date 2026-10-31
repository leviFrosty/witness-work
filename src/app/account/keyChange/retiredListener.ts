import type { KeyRetiredListener } from '@/lib/serverAccount/keyRetiredHub'
import type { KeyRetiredOutcome } from './retired'

/**
 * Hands each retired key to `handle` (`handleKeyRetired`), once installed,
 * whatever the key change itself waits for: a browser signed out by a change
 * elsewhere has no key, and heard of it at launch, before the app loaded.
 */
export function createRetiredKeyListener(deps: {
  onKeyRetired: (listener: KeyRetiredListener) => () => void
  handle: (
    accountPub: string,
    changedAt: number | null,
    from: { held: boolean }
  ) => Promise<KeyRetiredOutcome>
  warn: (message: string, error: unknown) => void
}): () => void {
  let listening = false
  return () => {
    if (listening) return
    listening = true
    // A browser signed out by the change waits for this before it settles.
    deps.onKeyRetired(async (accountPub, changedAt, { held }) => {
      await deps.handle(accountPub, changedAt, { held }).catch((error) => {
        deps.warn('[keyChange] handling a retired key failed', error)
      })
    })
  }
}
