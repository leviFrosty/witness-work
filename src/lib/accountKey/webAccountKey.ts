import { sameBytes } from '@/lib/bytes'
import {
  type SealedSecrets,
  sealedSecrets,
} from '@/lib/webStorage/sealedSecrets'

/**
 * The account key in a browser (docs/passkeys-protocol.md, "On the web"), where
 * there's no iCloud Keychain or Block Store: sealed in IndexedDB
 * (`sealedSecrets`), read once into memory at launch so the app's synchronous
 * checks (`BuddiesKeychain.isAvailable`) can answer. A browser never makes one
 * by itself: it arrives with a sign-in (a passkey, a phone, a recovery key), or
 * web sign-up makes it (`create`).
 */

export const WEB_ACCOUNT_KEY_NAME = 'account-key'

type Deps = {
  secrets: Pick<SealedSecrets, 'read' | 'write'>
  randomBytes: (length: number) => Uint8Array
}

export function createWebAccountKey({ secrets, randomBytes }: Deps) {
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
        // One saved while reading wins.
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

  async function save(next: Uint8Array): Promise<void> {
    if (next.length !== 32) throw new Error('Account key must be 32 bytes')
    await load()
    await secrets.write(WEB_ACCOUNT_KEY_NAME, next)
    const changed = key === null || !sameBytes(key, next)
    key = new Uint8Array(next)
    if (changed) notify()
  }

  return {
    /** Reads the sealed key into memory; at launch, before the app renders. */
    load,
    /** The key in memory, once `load` ran; null when signed out. */
    current: (): Uint8Array | null => key,
    peek: async (): Promise<Uint8Array | null> => {
      await load()
      return key
    },
    /** Seals and keeps a key that arrived with a sign-in. */
    save,
    /**
     * Seals a key for the next page load without loading it into this one, nor
     * telling listeners: another account signing in, which reloads first.
     */
    async seal(next: Uint8Array): Promise<void> {
      if (next.length !== 32) throw new Error('Account key must be 32 bytes')
      forget()
      await secrets.write(WEB_ACCOUNT_KEY_NAME, next)
    },
    /**
     * Makes a new account key for web sign-up and stores it before anything
     * else happens. Refuses while one is here: sign-up as someone else wipes
     * the browser first.
     */
    async create(): Promise<Uint8Array> {
      await load()
      if (key) throw new Error('This browser already has an account')
      const next = randomBytes(32)
      await save(next)
      return next
    },
    /** Forgets the key in memory, after the browser was wiped. */
    forget,
    /**
     * Deletes the sealed key alone: the server retired it, as a key change on
     * another device does (ADR 0039). The data stays for the same account's
     * new key (`webAccount`'s `owner`); any other sign-out wipes instead.
     */
    async retire(): Promise<void> {
      await load()
      await secrets.write(WEB_ACCOUNT_KEY_NAME, null)
      forget()
    },
    /** Calls `listener` when the key arrives or goes. Returns an unsubscribe. */
    subscribe(listener: (key: Uint8Array | null) => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export type WebAccountKey = ReturnType<typeof createWebAccountKey>

/** This browser's account key. */
export const webAccountKey = createWebAccountKey({
  secrets: sealedSecrets,
  randomBytes: (length) =>
    globalThis.crypto.getRandomValues(new Uint8Array(length)),
})
