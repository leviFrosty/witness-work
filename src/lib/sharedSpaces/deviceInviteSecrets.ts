import { logger } from '@/lib/logger'

/**
 * What joining from a Shared Car invitation takes that the invitation's other
 * fields don't: the one-time `joinSecret` for `join`, and `key`, the car's
 * space key for the invitation's epoch, both b64u. The Buddies store, which is
 * saved unencrypted and goes into device backups, keeps the rest of the
 * invitation, and of the `car.invite` that sends it; these stay on the device,
 * as the keyring's keys do (ADR 0037 §4, `deviceKeyring`), by an id the caller
 * gives each invitation.
 *
 * Reads are synchronous, from memory, once `ready()` has read storage; every
 * change is written back in the background, one write after another.
 */
export type InviteSecrets = { joinSecret: string; key: string }

/** Where the secrets keep their one JSON value; null deletes it. */
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
    // A damaged entry is an invitation whose secrets are lost.
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
  /** Ids let go (or `all`) before storage was read. */
  let forgotten: Set<string> | 'all' = new Set()
  let writing: Promise<void> = Promise.resolve()
  let dirty = false

  /**
   * Reads storage once: whether it could. One that couldn't be read is read
   * again on the next call, and nothing replaces what it holds until then, so a
   * caller only takes a secret for missing once this says true.
   */
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
      // Secrets kept while storage was still being read win.
      for (const [id, secrets] of stored)
        if (!held.has(id)) held.set(id, secrets)
      loaded = true
      forgotten = new Set()
      // Changes that waited for the read.
      if (dirty) after(() => {})
      return true
    } catch (error) {
      options.onError?.(error)
      return false
    }
  }

  /**
   * Runs `change` once storage has been read, after every change before it,
   * then writes what's held if anything changed.
   */
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

    /** `id`'s secrets, or null: none here, once `ready()` said true. */
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

    /**
     * Lets go of every secret whose id `needed` doesn't name: invitations
     * nothing still sends or answers, orphans included. `needed` is asked once
     * storage has been read, so it sees the latest state.
     */
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

    /**
     * Lets every secret go, for a reset: written over at once, even when
     * storage couldn't be read.
     */
    clear() {
      held.clear()
      if (!loaded) forgotten = 'all'
      dirty = false
      writing = writing
        .then(() => storage.write(null))
        .catch((error: unknown) => options.onError?.(error))
    },

    /** Settles once every change so far is in storage. */
    flushed: (): Promise<void> => writing,
  }
}

/** Secrets held in memory only, for tests and headless members. */
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

// Loaded on first use, so importing this module never constructs native
// storage, nor pulls `expo-modules-core` into the Buddies engine and its tests.
type DeviceSecretsModule = typeof import('../../../modules/device-secrets')
let native: Promise<DeviceSecretsModule> | null = null
const loadNative = () => (native ??= import('../../../modules/device-secrets'))

let memory: string | null = null

/**
 * This device's keystore, as the keyring's (`deviceKeyring`): a
 * this-device-only Keychain item on iOS, and a file sealed under the Android
 * Keystore in `noBackupFilesDir` on Android (`modules/device-secrets`). A
 * binary without that module keeps the secrets in memory for the launch; an
 * invitation whose secrets went with it can't be sent or joined from here
 * afterwards.
 */
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

/** Forgets every invitation's secrets on this device (Tools "Reset all"). */
export function forgetDeviceInviteSecrets() {
  deviceInviteSecrets.clear()
}
