import { fromB64u } from '@/lib/bytes'
import {
  isCommitted,
  type KeyChangeRecord,
} from '@/lib/accountKey/keyChangeRecord'
import { accountPubOf } from '@/lib/serverAccount/keys'

export type DeviceAccountKeyDeps = {
  native: {
    peek: () => Promise<string | null>
    getOrCreate: () => Promise<string>
    replace: (key: string) => Promise<void>

    remove: (accountPub: string) => Promise<void>
  }

  record: () => Promise<KeyChangeRecord | null>

  retired: {
    has: (accountPub: string) => boolean
    add: (accountPub: string) => void
    delete: (accountPub: string) => void
  }

  sharedStore: boolean

  signedOut: () => boolean
}

export class AccountKeySignedOutError extends Error {
  constructor() {
    super('The account key changed on another device')
    this.name = 'AccountKeySignedOutError'
  }
}

export function createDeviceAccountKey(deps: DeviceAccountKeyDeps) {
  let derived: { key: string; pub: string } | null = null
  const pubOf = (key: string) => {
    if (derived?.key !== key)
      derived = {
        key,
        pub: accountPubOf(fromB64u(key)),
      }
    return derived.pub
  }

  const committedKey = async () => {
    const record = await deps.record()
    return record && isCommitted(record) ? record.newKey : null
  }

  const stored = async () => {
    const key = await deps.native.peek()
    if (!key) return { key: null, retired: false }
    return deps.retired.has(pubOf(key))
      ? { key: null, retired: true }
      : { key, retired: false }
  }

  return {
    async peek(): Promise<string | null> {
      return (await committedKey()) ?? (await stored()).key
    },

    async peekStored(): Promise<string | null> {
      return (await stored()).key
    },

    async getOrCreate(): Promise<string> {
      const committed = await committedKey()
      if (committed) return committed
      const current = await stored()
      if (current.key) return current.key
      if (current.retired || deps.signedOut())
        throw new AccountKeySignedOutError()
      return deps.native.getOrCreate()
    },

    async replace(key: string): Promise<void> {
      await deps.native.replace(key)
      deps.retired.delete(pubOf(key))
    },

    async forgetRetired(accountPub: string): Promise<void> {
      deps.retired.add(accountPub)
      if (deps.sharedStore) return
      const key = await deps.native.peek()
      if (key && pubOf(key) === accountPub) await deps.native.remove(accountPub)
    },

    isRetired: (accountPub: string) => deps.retired.has(accountPub),
  }
}

export type DeviceAccountKey = ReturnType<typeof createDeviceAccountKey>
