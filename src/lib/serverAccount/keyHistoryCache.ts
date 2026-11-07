import type { StoredKeyHistory } from '@/lib/serverAccount/keyChangeClient'
import {
  type KeyHistory,
  openKeyHistory,
  parseKeyHistory,
} from '@/lib/serverAccount/keyHistory'

export type KeyHistoryCacheDeps = {
  store: {
    read: () => Promise<string | null>
    write: (value: string | null) => Promise<void>
  }

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

    await deps.store.write(JSON.stringify(cached)).catch(() => undefined)
  }

  return {
    async read(accountId: string): Promise<KeyHistory | null> {
      const cached = await load()
      return cached?.accountId === accountId ? cached.history : null
    },

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

    save,
    async clear(): Promise<void> {
      loaded = Promise.resolve(null)
      await deps.store.write(null).catch(() => undefined)
    },
  }
}

export type KeyHistoryCache = ReturnType<typeof createKeyHistoryCache>
