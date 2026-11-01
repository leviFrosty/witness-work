import { logger } from '@/lib/logger'

export type InviteSecrets = { joinSecret: string; key: string }

export type InviteSecretStorage = {
  read: () => string | null | Promise<string | null>
  write: (value: string | null) => void | Promise<void>
}

export type InviteSecretStore = ReturnType<typeof createInviteSecretStore>

function parse(value: string | null): Map<string, InviteSecrets> {
  const held = new Map<string, InviteSecrets>()
  let parsed: unknown
  try {
    parsed = JSON.parse(value ?? '{}')
  } catch {
    return held
  }
  if (typeof parsed !== 'object' || parsed === null) return held
  for (const [id, entry] of Object.entries(parsed as Record<string, unknown>)) {
    const { joinSecret, key } = (entry ?? {}) as Partial<InviteSecrets>

    if (typeof joinSecret === 'string' && typeof key === 'string')
      held.set(id, { joinSecret, key })
  }
  return held
}

const serialize = (held: Map<string, InviteSecrets>): string | null =>
  held.size === 0 ? null : JSON.stringify(Object.fromEntries(held))

export function createInviteSecretStore(
  storage: InviteSecretStorage,
  options: { onError?: (error: unknown) => void } = {}
) {
  const held = new Map<string, InviteSecrets>()
  let loaded = false
  let loading: Promise<boolean> | null = null

  let forgotten: Set<string> | 'all' = new Set()
  let writing: Promise<void> = Promise.resolve()
  let dirty = false

  function ready(): Promise<boolean> {
    if (loaded) return Promise.resolve(true)
    loading ??= load().finally(() => {
      loading = null
    })
    return loading
  }

  async function load(): Promise<boolean> {
    try {
      const stored = parse(await storage.read())
      if (forgotten === 'all') stored.clear()
      else for (const id of forgotten) stored.delete(id)

      for (const [id, secrets] of stored)
        if (!held.has(id)) held.set(id, secrets)
      loaded = true
      forgotten = new Set()

      if (dirty) after(() => {})
      return true
    } catch (error) {
      options.onError?.(error)
      return false
    }
  }

  function after(change: () => void) {
    writing = writing
      .then(async () => {
        if (!(await ready())) return
        change()
        if (!dirty) return
        dirty = false
        await storage.write(serialize(held))
      })
      .catch((error: unknown) => options.onError?.(error))
  }

  function persist() {
    dirty = true
    after(() => {})
  }

  return {
    ready,

    get: (id: string): InviteSecrets | null => held.get(id) ?? null,

    put(id: string, { joinSecret, key }: InviteSecrets) {
      held.set(id, { joinSecret, key })
      persist()
    },

    remove(id: string) {
      if (!loaded && forgotten !== 'all') forgotten.add(id)
      held.delete(id)
      persist()
    },

    retain(needed: () => ReadonlySet<string>) {
      after(() => {
        const keep = needed()
        for (const id of [...held.keys()])
          if (!keep.has(id)) {
            held.delete(id)
            dirty = true
          }
      })
    },

    clear() {
      held.clear()
      if (!loaded) forgotten = 'all'
      dirty = false
      writing = writing
        .then(() => storage.write(null))
        .catch((error: unknown) => options.onError?.(error))
    },

    flushed: (): Promise<void> => writing,
  }
}

export function memoryInviteSecretStorage(): InviteSecretStorage & {
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

const SECRET = 'shared-spaces-invites'

type DeviceSecretsModule = typeof import('../../../modules/device-secrets')
let native: Promise<DeviceSecretsModule> | null = null
const loadNative = () => (native ??= import('../../../modules/device-secrets'))

let memory: string | null = null

export const deviceInviteSecretStorage: InviteSecretStorage = {
  read: async () => {
    const secrets = await loadNative()
    return secrets.isAvailable() ? secrets.read(SECRET) : memory
  },
  write: async (value) => {
    const secrets = await loadNative()
    if (!secrets.isAvailable()) {
      memory = value
      return
    }
    if (value === null) await secrets.remove(SECRET)
    else await secrets.write(SECRET, value)
  },
}

export const deviceInviteSecrets = createInviteSecretStore(
  deviceInviteSecretStorage,
  {
    onError: (error) =>
      logger.warn(
        '[sharedCars] invite secrets storage',
        error instanceof Error ? error.name : 'unknown'
      ),
  }
)

export function forgetDeviceInviteSecrets() {
  deviceInviteSecrets.clear()
}
