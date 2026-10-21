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

/**
 * `migrate` for a store whose saved shape hasn't changed since its first
 * version. Replace it with a real migration when bumping the store's
 * `version`.
 */
export const keepPersistedState = <U>(persistedState: unknown) =>
  persistedState as U

/**
 * Zustand's `persist`, except that it never writes over saved data it couldn't
 * load. Zustand keeps a store's defaults when the saved blob can't be parsed,
 * migrated or merged, and the next change would then save those defaults in its
 * place. Here the store keeps working in memory, but its blob stays as it is
 * until a launch loads it: a fixed build, or the newer build that saved it.
 *
 * A blob saved by a newer version of the store (the app went back to an older
 * build) is loaded as it is, without migrating, and isn't written either, so
 * the older build can't relabel it with its own version or drop what it doesn't
 * know.
 *
 * Every store states a `migrate`, so a version bump can't silently reset one.
 */
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
  // `loading` from the start of a hydration until its merge succeeds; `kept`
  // once it decides not to write over the saved blob. Writes go through when
  // `loaded`.
  let hydration: 'loading' | 'loaded' | 'kept' = 'loaded'
  let reported = false

  const keep = (reason: string, details: Record<string, unknown> = {}) => {
    hydration = 'kept'
    if (reported) return
    reported = true
    // Loaded on demand: only a failed load reports, so stores don't pull in
    // error tracking's native modules. Structural only: a parse error's
    // message can quote the saved data.
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
