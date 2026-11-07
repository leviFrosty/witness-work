import type { KeyRetiredListener } from '@/lib/serverAccount/keyRetiredHub'
import type { KeyRetiredOutcome } from './retired'

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

    deps.onKeyRetired(async (accountPub, changedAt, { held }) => {
      await deps.handle(accountPub, changedAt, { held }).catch((error) => {
        deps.warn('[keyChange] handling a retired key failed', error)
      })
    })
  }
}
