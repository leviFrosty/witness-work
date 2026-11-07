import { sameBytes } from '@/lib/bytes'
import { accountPubOf } from '@/lib/serverAccount/keys'
import {
  type SealedSecrets,
  sealedSecrets,
} from '@/lib/webStorage/sealedSecrets'

export const WEB_ACCOUNT_KEY_NAME = 'account-key'

type Deps = {
  secrets: Pick<SealedSecrets, 'read' | 'write'>
  randomBytes: (length: number) => Uint8Array

  publicKeyOf: (key: Uint8Array) => string
}

export function createWebAccountKey({
  secrets,
  randomBytes,
  publicKeyOf,
}: Deps) {
  let key: Uint8Array | null = null
  let loading: Promise<Uint8Array | null> | null = null
  const listeners = new Set<(key: Uint8Array | null) => void>()

  const notify = () => {
    for (const listener of listeners) listener(key)
  }

  function load(): Promise<Uint8Array | null> {
    loading ??= secrets
      .read(WEB_ACCOUNT_KEY_NAME)
      .then((read) => {
        if (key === null && read?.length === 32) key = read
        return key
      })
      .catch(() => {
        loading = null
        return key
      })
    return loading
  }

  function forget() {
    const had = key !== null
    key = null
    loading = Promise.resolve(null)
    if (had) notify()
  }

  async function readStored(): Promise<Uint8Array | null> {
    const read = await secrets.read(WEB_ACCOUNT_KEY_NAME)
    return read?.length === 32 ? read : null
  }

  async function save(next: Uint8Array): Promise<void> {
    if (next.length !== 32) throw new Error('Account key must be 32 bytes')
    await load()
    await secrets.write(WEB_ACCOUNT_KEY_NAME, next)
    const changed = key === null || !sameBytes(key, next)
    key = new Uint8Array(next)
    if (changed) notify()
  }

  return {
    load,

    current: (): Uint8Array | null => key,
    peek: async (): Promise<Uint8Array | null> => {
      await load()
      return key
    },

    readStored,

    save,

    async seal(next: Uint8Array): Promise<void> {
      if (next.length !== 32) throw new Error('Account key must be 32 bytes')
      forget()
      await secrets.write(WEB_ACCOUNT_KEY_NAME, next)
    },

    async create(): Promise<Uint8Array> {
      await load()

      if (key || (await readStored()))
        throw new Error('This browser already has an account')
      const next = randomBytes(32)
      await save(next)
      return next
    },

    async discard(made: Uint8Array): Promise<void> {
      await load()
      const stored = await readStored()
      if (stored && sameBytes(stored, made)) {
        await secrets.write(WEB_ACCOUNT_KEY_NAME, null)
        forget()
      } else if (key && sameBytes(key, made)) {
        forget()
      }
    },

    forget,

    async retire(accountPub: string): Promise<boolean> {
      const stored = await secrets.read(WEB_ACCOUNT_KEY_NAME)
      if (!stored || publicKeyOf(stored) !== accountPub) return false
      await secrets.write(WEB_ACCOUNT_KEY_NAME, null)
      forget()
      return true
    },

    subscribe(listener: (key: Uint8Array | null) => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export type WebAccountKey = ReturnType<typeof createWebAccountKey>

export const webAccountKey = createWebAccountKey({
  secrets: sealedSecrets,
  randomBytes: (length) =>
    globalThis.crypto.getRandomValues(new Uint8Array(length)),
  publicKeyOf: accountPubOf,
})
