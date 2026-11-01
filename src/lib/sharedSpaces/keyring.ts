import { fromB64u, sameBytes, toB64u } from '@/lib/bytes'

export type SpaceKeyringStorage = {
  read: () => string | null | Promise<string | null>
  write: (value: string | null) => void | Promise<void>
}

type Stored = Record<string, Record<string, string>>

export type KeyringChange = 'new' | 'same' | 'mismatch'

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
      } catch {}
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

  let loaded = false
  let loading: Promise<void> | null = null

  let forgotten: Set<string> | 'all' = new Set()
  let writing: Promise<void> = Promise.resolve()
  let dirty = false

  const load = (value: string | null) => {
    const stored = forgotten === 'all' ? new Map() : parse(value)
    if (forgotten !== 'all')
      for (const spaceId of forgotten) stored.delete(spaceId)

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

    if (dirty) persist()
  }

  const failed = (error: unknown) => {
    options.onError?.(error)
    loading = null
  }

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
      keys = new Map()
      void ready()
    }
    return keys
  }

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

    key(spaceId: string, epoch: number): Uint8Array | null {
      return held().get(spaceId)?.get(epoch) ?? null
    },

    epochs(spaceId: string): number[] {
      return [...(held().get(spaceId)?.keys() ?? [])].sort((a, b) => b - a)
    },

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

    forget(spaceId: string) {
      if (!loaded && forgotten !== 'all') forgotten.add(spaceId)
      held().delete(spaceId)
      persist()
    },

    forgetAll() {
      if (!loaded) forgotten = 'all'
      held().clear()
      dirty = false
      writing = writing
        .then(() => storage.write(null))
        .catch((error: unknown) => options.onError?.(error))
    },

    flushed: (): Promise<void> =>
      (loading ?? Promise.resolve()).then(() => writing),
  }
}

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
