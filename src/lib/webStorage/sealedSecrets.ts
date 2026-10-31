import { utf8 } from '@/lib/bytes'
import { secureKv, type SecureKv } from '@/lib/webStorage/secureKv'

/**
 * The browser's account secrets at rest (docs/passkeys-protocol.md, "On the
 * web"): the account key and the session's refresh token, each sealed with
 * AES-GCM under one non-extractable WebCrypto key. The wrap key and the sealed
 * values are structured clones in `secureKv`, so page code can use the wrap key
 * but never read it, and IndexedDB never holds a secret in the clear.
 *
 * Web only, like `secureKv`.
 */

export const SEALED_WRAP_KEY = 'wrap-key'
/** Web Lock held while the wrap key is made, so two tabs never make two. */
const WRAP_KEY_LOCK = 'witnesswork-wrap-key'

type Sealed = { v: 1; iv: Uint8Array; data: ArrayBuffer }

/** AES-GCM's 96-bit nonce. */
const IV_BYTES = 12

const entry = (name: string) => `sealed:${name}`
/** Binds each value to its name, so one can't be passed off as another. */
const aad = (name: string) => utf8(`ww-web/v1/sealed\n${name}`)

/** WebCrypto takes only `ArrayBuffer`-backed views; ours always are. */
const buffer = (bytes: Uint8Array) => bytes as Uint8Array<ArrayBuffer>

const isSealed = (value: unknown): value is Sealed =>
  typeof value === 'object' &&
  value !== null &&
  (value as Sealed).v === 1 &&
  (value as Sealed).iv instanceof Uint8Array &&
  (value as Sealed).iv.length === IV_BYTES &&
  (value as Sealed).data instanceof ArrayBuffer

type Options = {
  kv: Pick<SecureKv, 'get' | 'set' | 'delete' | 'clearAll'>
  subtle: SubtleCrypto | undefined
  randomBytes: (length: number) => Uint8Array
  /** Runs `make` while no other tab makes a wrap key (Web Locks). */
  exclusive?: <T>(make: () => Promise<T>) => Promise<T>
  /** A value is stored but won't open (a lost wrap key, or tampering). */
  onUnreadable?: (name: string, error: unknown) => void
}

export function createSealedSecrets({
  kv,
  subtle,
  randomBytes,
  exclusive = (make) => make(),
  onUnreadable,
}: Options) {
  /** A wrap key this page is making, which other writes wait for. */
  let making: Promise<CryptoKey> | null = null

  const crypto = () => {
    if (!subtle) throw new Error('sealedSecrets: WebCrypto is unavailable')
    return subtle
  }

  /**
   * The wrap key, read every time (another tab, or a wipe, may have changed
   * it), and made once across tabs when `create` and there's none.
   */
  async function getWrapKey(create: boolean): Promise<CryptoKey | undefined> {
    const key = await kv.get<CryptoKey>(SEALED_WRAP_KEY)
    if (key || !create) return key
    making ??= exclusive(async () => {
      // Another tab may have made it while this one waited.
      const existing = await kv.get<CryptoKey>(SEALED_WRAP_KEY)
      if (existing) return existing
      const next = await crypto().generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      )
      await kv.set(SEALED_WRAP_KEY, next)
      return next
    }).finally(() => {
      making = null
    })
    return making
  }

  return {
    /** The value saved under `name`, or null when there's none or it won't open. */
    async read(name: string): Promise<Uint8Array | null> {
      const sealed = await kv.get(entry(name))
      if (sealed === undefined) return null
      const key = await getWrapKey(false)
      if (!key || !isSealed(sealed)) {
        onUnreadable?.(
          name,
          new Error(
            key ? 'sealedSecrets: not sealed' : 'sealedSecrets: no wrap key'
          )
        )
        return null
      }
      try {
        const opened = await crypto().decrypt(
          {
            name: 'AES-GCM',
            iv: buffer(sealed.iv),
            additionalData: buffer(aad(name)),
          },
          key,
          sealed.data
        )
        return new Uint8Array(opened)
      } catch (error) {
        onUnreadable?.(name, error)
        return null
      }
    },
    /** Seals and saves `value` under `name`; null deletes it. */
    async write(name: string, value: Uint8Array | null): Promise<void> {
      if (value === null) return kv.delete(entry(name))
      const key = await getWrapKey(true)
      if (!key) throw new Error('sealedSecrets: no wrap key was made')
      const iv = randomBytes(IV_BYTES)
      const data = await crypto().encrypt(
        { name: 'AES-GCM', iv: buffer(iv), additionalData: buffer(aad(name)) },
        key,
        buffer(value)
      )
      const sealed: Sealed = { v: 1, iv, data }
      await kv.set(entry(name), sealed)
    },
    /** Deletes every sealed value and the wrap key. */
    async wipe(): Promise<void> {
      await kv.clearAll()
    },
  }
}

export type SealedSecrets = ReturnType<typeof createSealedSecrets>

const browserSubtle = (): SubtleCrypto | undefined =>
  typeof globalThis.crypto?.subtle === 'object'
    ? globalThis.crypto.subtle
    : undefined

/** The page's sealed secrets. */
export const sealedSecrets = createSealedSecrets({
  kv: secureKv,
  subtle: browserSubtle(),
  randomBytes: (length) =>
    globalThis.crypto.getRandomValues(new Uint8Array(length)),
  exclusive: (make) =>
    typeof navigator !== 'undefined' && navigator.locks?.request
      ? navigator.locks.request(WRAP_KEY_LOCK, make)
      : make(),
  // A lost wrap key, or tampering. Only the value's name and the error's kind;
  // never what was stored. Required here, so storage doesn't load the error
  // tracker's SDK.
  onUnreadable: (name, error) =>
    (
      require('@/lib/errorTracking') as typeof import('@/lib/errorTracking')
    ).errorTracking.captureMessage('Sealed secret unreadable', {
      name,
      error: error instanceof Error ? error.name : typeof error,
      reason: error instanceof Error ? error.message : null,
    }),
})
