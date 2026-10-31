import { fromB64u, sameBytes, toB64u } from '@/lib/bytes'

/**
 * The space keys this device trusts, by space and key epoch
 * (docs/shared-cars-protocol.md, "Trusted keys"): ones it made, ones an
 * invitation brought, and ones the key chain or the User's key check vouched
 * for (`keyTrust`). Only trusted keys go in, and a key in it is never replaced:
 * a wrap is made from public values, so a different key for a held epoch is one
 * somebody planted. A cache too: every key can be trusted again from the
 * member's wrap, the key chain and the key check, so it's kept on the device
 * only, outside the sync payload, our backups, the Buddies roster and, where
 * the platform allows, device backups (ADR 0037 §4, `deviceKeyring`).
 *
 * Reads are synchronous, from memory; `ready()` loads what storage holds first,
 * and every change is written back in the background, the latest one last.
 * Nothing is written back until storage has been read: a write after a failed
 * read would lose the epochs it holds. `ready()` reads again until it works.
 * `forgetAll` alone writes at once, since it means to lose them.
 */

/** Where the keyring keeps its one JSON value; null deletes it. */
export type SpaceKeyringStorage = {
  read: () => string | null | Promise<string | null>
  write: (value: string | null) => void | Promise<void>
}

type Stored = Record<string, Record<string, string>>

/** What `trust` did with a key. */
export type KeyringChange =
  /** It's new here. */
  | 'new'
  /** The keyring held it already. */
  | 'same'
  /** The keyring trusts another key for the epoch, and kept it. */
  | 'mismatch'

export type SpaceKeyring = ReturnType<typeof createSpaceKeyring>

function parse(value: string | null): Map<string, Map<number, Uint8Array>> {
  const keys = new Map<string, Map<number, Uint8Array>>()
  let parsed: unknown
  try {
    parsed = JSON.parse(value ?? '{}')
  } catch {
    return keys
  }
  if (typeof parsed !== 'object' || parsed === null) return keys
  for (const [spaceId, epochs] of Object.entries(parsed as Stored)) {
    if (typeof epochs !== 'object' || epochs === null) continue
    const held = new Map<number, Uint8Array>()
    for (const [epoch, text] of Object.entries(epochs)) {
      const number = Number(epoch)
      if (!Number.isSafeInteger(number) || number < 1) continue
      try {
        const key = fromB64u(text)
        if (key.length === 32) held.set(number, key)
      } catch {
        // A damaged entry is a key to trust again.
      }
    }
    if (held.size > 0) keys.set(spaceId, held)
  }
  return keys
}

function serialize(keys: Map<string, Map<number, Uint8Array>>): string | null {
  if (keys.size === 0) return null
  const out: Stored = {}
  for (const [spaceId, epochs] of keys)
    out[spaceId] = Object.fromEntries(
      [...epochs].map(([epoch, key]) => [String(epoch), toB64u(key)])
    )
  return JSON.stringify(out)
}

export function createSpaceKeyring(
  storage: SpaceKeyringStorage,
  options: { onError?: (error: unknown) => void } = {}
) {
  let keys: Map<string, Map<number, Uint8Array>> | null = null
  /** Storage was read this launch; until it is, nothing is written back. */
  let loaded = false
  let loading: Promise<void> | null = null
  /** Spaces forgotten (or `all`) before storage was read. */
  let forgotten: Set<string> | 'all' = new Set()
  let writing: Promise<void> = Promise.resolve()
  let dirty = false

  const load = (value: string | null) => {
    const stored = forgotten === 'all' ? new Map() : parse(value)
    if (forgotten !== 'all')
      for (const spaceId of forgotten) stored.delete(spaceId)
    // Keys trusted before storage could be read join the stored ones. A stored
    // key was trusted first, so it stays.
    for (const [spaceId, epochs] of keys ?? new Map()) {
      const held = stored.get(spaceId) ?? new Map<number, Uint8Array>()
      for (const [epoch, key] of epochs as Map<number, Uint8Array>)
        if (!held.has(epoch)) held.set(epoch, key)
      stored.set(spaceId, held)
    }
    keys = stored
    loaded = true
    loading = null
    forgotten = new Set()
    // What changed while storage was unread goes in now.
    if (dirty) persist()
  }

  /** The read failed: tried again by the next `ready()`. */
  const failed = (error: unknown) => {
    options.onError?.(error)
    loading = null
  }

  /**
   * Loads storage, once it works; synchronous storage loads at once. Settles
   * either way: a failed read leaves the keyring in memory for now.
   */
  function ready(): Promise<void> {
    if (loaded) return Promise.resolve()
    if (loading) return loading
    let value: string | null | Promise<string | null>
    try {
      value = storage.read()
    } catch (error) {
      failed(error)
      return Promise.resolve()
    }
    if (!(value instanceof Promise)) {
      load(value)
      return Promise.resolve()
    }
    loading = value.then(load, failed)
    return loading
  }

  const held = () => {
    if (!keys) {
      // Read before `ready()` settled: what's in memory so far.
      keys = new Map()
      void ready()
    }
    return keys
  }

  /**
   * Writes the keyring back, after any write already under way. Before storage
   * has been read, the change waits for the read (`load`).
   */
  function persist() {
    dirty = true
    if (!loaded) {
      void ready()
      return
    }
    writing = writing
      .then(async () => {
        if (!dirty) return
        dirty = false
        await storage.write(serialize(held()))
      })
      .catch((error: unknown) => options.onError?.(error))
  }

  return {
    ready,

    /**
     * Epoch `epoch`'s key for `spaceId`, or null. The same array every time, so
     * what's derived from it can be cached by it.
     */
    key(spaceId: string, epoch: number): Uint8Array | null {
      return held().get(spaceId)?.get(epoch) ?? null
    },

    /** The epochs held for `spaceId`, newest first. */
    epochs(spaceId: string): number[] {
      return [...(held().get(spaceId)?.keys() ?? [])].sort((a, b) => b - a)
    },

    /**
     * Keeps a key this device trusts for `epoch` now. A held epoch keeps its
     * key, whatever this one is: `mismatch` says they differ.
     */
    trust(spaceId: string, epoch: number, key: Uint8Array): KeyringChange {
      if (key.length !== 32) throw new Error('Space key must be 32 bytes')
      const all = held()
      const current = all.get(spaceId)?.get(epoch)
      if (current) return sameBytes(current, key) ? 'same' : 'mismatch'
      const epochs = all.get(spaceId) ?? new Map<number, Uint8Array>()
      epochs.set(epoch, new Uint8Array(key))
      all.set(spaceId, epochs)
      persist()
      return 'new'
    },

    /** Forgets every key of `spaceId`, once this device is off it. */
    forget(spaceId: string) {
      if (!loaded && forgotten !== 'all') forgotten.add(spaceId)
      held().delete(spaceId)
      persist()
    },

    /**
     * Forgets every key, for a reset: written over at once, even when storage
     * couldn't be read, so a reset leaves none behind.
     */
    forgetAll() {
      if (!loaded) forgotten = 'all'
      held().clear()
      dirty = false
      writing = writing
        .then(() => storage.write(null))
        .catch((error: unknown) => options.onError?.(error))
    },

    /** Settles once every change so far is in storage (or waits for a read). */
    flushed: (): Promise<void> =>
      (loading ?? Promise.resolve()).then(() => writing),
  }
}

/** A keyring held in memory only, for tests and headless members. */
export function memoryKeyringStorage(): SpaceKeyringStorage & {
  value: () => string | null
} {
  let value: string | null = null
  return {
    read: () => value,
    write: (next) => {
      value = next
    },
    value: () => value,
  }
}
