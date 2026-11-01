import type { StateCreator, StoreMutatorIdentifier } from 'zustand'
import {
  persist as zustandPersist,
  type PersistOptions,
} from 'zustand/middleware'

type Persist = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
  U = T,
>(
  initializer: StateCreator<T, [...Mps, ['zustand/persist', unknown]], Mcs>,
  options: PersistOptions<T, U> &
    Required<Pick<PersistOptions<T, U>, 'migrate'>>
) => StateCreator<T, Mps, [['zustand/persist', U], ...Mcs]>

export const keepPersistedState = <U>(persistedState: unknown) =>
  persistedState as U

export const persist: Persist = (initializer, options) =>
  zustandPersist(initializer, keepUnloadedData(options))

function keepUnloadedData<T, U>(
  options: PersistOptions<T, U> &
    Required<Pick<PersistOptions<T, U>, 'migrate'>>
): PersistOptions<T, U> {
  const { name, storage, migrate } = options
  if (!storage) return options
  const version = options.version ?? 0
  const merge =
    options.merge ??
    ((persisted: unknown, current: T) => ({
      ...current,
      ...(persisted as Partial<T>),
    }))

  let hydration: 'loading' | 'loaded' | 'kept' = 'loaded'
  let reported = false

  const keep = (reason: string, details: Record<string, unknown> = {}) => {
    hydration = 'kept'
    if (reported) return
    reported = true

    void import('@/lib/errorTracking')
      .then(({ errorTracking }) =>
        errorTracking.captureException(
          new Error(`Kept the saved ${name} store: ${reason}`),
          { storageKey: name, reason, version, ...details }
        )
      )
      .catch(() => {})
  }

  return {
    ...options,
    storage: {
      ...storage,
      setItem: (key, value) =>
        hydration === 'loaded' ? storage.setItem(key, value) : undefined,
    },
    migrate: (persistedState, savedVersion) => {
      if (savedVersion <= version) return migrate(persistedState, savedVersion)
      keep('saved by a newer version', { savedVersion })
      return persistedState as U
    },
    merge: (persistedState, current) => {
      const merged = merge(persistedState, current)
      if (hydration === 'loading') hydration = 'loaded'
      return merged
    },
    onRehydrateStorage: (state) => {
      hydration = 'loading'
      const after = options.onRehydrateStorage?.(state)
      return (hydrated, error) => {
        if (error !== undefined) {
          keep('could not be loaded', {
            errorName: error instanceof Error ? error.name : typeof error,
          })
        }
        after?.(hydrated, error)
      }
    },
  }
}
