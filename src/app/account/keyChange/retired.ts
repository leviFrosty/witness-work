import { fromB64u } from '@/lib/bytes'
import {
  isCommitted,
  type KeyChangeRecord,
} from '@/lib/accountKey/keyChangeRecord'
import { accountPubOf } from '@/lib/serverAccount/keys'
import type { ResumeResult } from './engine'

export type KeyRetiredDeps = {
  record: () => Promise<KeyChangeRecord | null>
  resume: () => Promise<ResumeResult>
  discard: () => Promise<void>

  lose: () => Promise<void>
  lastAccountId: () => string | null

  storedKey: () => Promise<string | null>
  isRetired: (accountPub: string) => boolean

  connect: (key: Uint8Array, accountId: string) => Promise<void>
  forgetRetired: (accountPub: string) => Promise<void>
  signOut: (accountId: string | null, changedAt: number | null) => void

  accountPub: () => string | null
}

export type KeyRetiredOutcome =
  | 'ownChange'
  | 'unresolved'
  | 'rejoined'
  | 'signedOut'
  | 'ignored'

export function createKeyRetiredHandler(deps: KeyRetiredDeps) {
  return async function handleKeyRetired(
    accountPub: string,
    changedAt: number | null,
    { held = false }: { held?: boolean } = {}
  ): Promise<KeyRetiredOutcome> {
    const record = await deps.record()
    const ownChange =
      record !== null && accountPubOf(fromB64u(record.oldKey)) === accountPub
    const stored = await deps.storedKey().catch(() => null)
    if (
      !held &&
      !ownChange &&
      deps.accountPub() !== accountPub &&
      (!stored || accountPubOf(fromB64u(stored)) !== accountPub)
    )
      return 'ignored'
    if (record && ownChange) {
      if (isCommitted(record)) return 'ownChange'
      if (held) await deps.lose()
      else if (record.stage === 'confirmed') {
        const resumed = await deps.resume()
        if (resumed.state === 'done') return 'ownChange'

        if (resumed.state === 'unresolved' || resumed.state === 'awaiting')
          return 'unresolved'
      } else {
        await deps.discard().catch(() => undefined)
      }
    }
    const lastAccountId = deps.lastAccountId()

    if (stored && lastAccountId) {
      const key = fromB64u(stored)
      const pub = accountPubOf(key)
      if (pub !== accountPub && !deps.isRetired(pub)) {
        try {
          await deps.connect(key, lastAccountId)
          return 'rejoined'
        } catch {}
      }
    }
    await deps.forgetRetired(accountPub)
    deps.signOut(lastAccountId, changedAt)
    return 'signedOut'
  }
}
