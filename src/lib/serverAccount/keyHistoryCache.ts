import type { StoredKeyHistory } from '@/lib/serverAccount/keyChangeClient'
import {
  type KeyHistory,
  openKeyHistory,
  parseKeyHistory,
} from '@/lib/serverAccount/keyHistory'

/**
 * This device's copy of the account's key history (docs/account-key-change.md,
 * "The key history blob"): opened, and kept in this-device-only secret storage
 * with the account it belongs to, so old backup files, slots, photos and labels
 * open without asking the server each time. Read again after a key change or a
 * rejoin (`refresh`).
 */

export type KeyHistoryCacheDeps = {
  /** This-device-only secret storage; null deletes. */
  store: {
    read: () => Promise<string | null>
    write: (value: string | null) => Promise<void>
  }
  /** `GET /account/key-history` as this account key's session. */
  fetchHistory: (accountKey: Uint8Array) => Promise<StoredKeyHistory>
}

type Cached = { accountId: string; history: KeyHistory | null }

function parseCached(raw: string | null): Cached | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as {
      accountId?: unknown
      history?: unknown
    } | null
    if (typeof value?.accountId !== 'string') return null
    return {
      accountId: value.accountId,
      history:
        value.history === null
          ? null
          : parseKeyHistory(JSON.stringify(value.history)),
    }
  } catch {
    return null
  }
}

export function createKeyHistoryCache(deps: KeyHistoryCacheDeps) {
  let loaded: Promise<Cached | null> | null = null
  const load = () =>
    (loaded ??= deps.store
      .read()
      .catch(() => null)
      .then(parseCached))

  async function save(
    accountId: string,
    history: KeyHistory | null
  ): Promise<void> {
    const cached: Cached = { accountId, history }
    loaded = Promise.resolve(cached)
    // Kept for this launch even when the store fails.
    await deps.store.write(JSON.stringify(cached)).catch(() => undefined)
  }

  return {
    /** The history kept for `accountId`, or null. */
    async read(accountId: string): Promise<KeyHistory | null> {
      const cached = await load()
      return cached?.accountId === accountId ? cached.history : null
    },
    /**
     * Reads the server's history and opens it with the account's current key.
     * Throws when it can't be read or doesn't open, keeping what it had.
     */
    async refresh(
      accountKey: Uint8Array,
      accountId: string
    ): Promise<KeyHistory | null> {
      const stored = await deps.fetchHistory(accountKey)
      const history =
        stored.history === null
          ? null
          : openKeyHistory(
              accountKey,
              accountId,
              stored.keyEpoch,
              stored.history
            )
      await save(accountId, history)
      return history
    },
    /** Keeps a history this device just sealed (a key change). */
    save,
    async clear(): Promise<void> {
      loaded = Promise.resolve(null)
      await deps.store.write(null).catch(() => undefined)
    },
  }
}

export type KeyHistoryCache = ReturnType<typeof createKeyHistoryCache>
