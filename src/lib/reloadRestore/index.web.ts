import {
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { MMKV } from 'react-native-mmkv'
import {
  NavigationRouteContext,
  type NavigationState,
  type PartialState,
} from '@react-navigation/native'
import { decodeDraft, encodeDraft } from '@/lib/reloadRestore/draftJson'
import {
  holdsSecret,
  normalizePath,
  partialState,
  routeKeys,
} from '@/lib/reloadRestore/navigationSnapshot'

const NAVIGATION_KEY = 'navigation'
const DRAFT_PREFIX = 'draft:'

let _store: MMKV | null = null
const store = (): MMKV => (_store ??= new MMKV({ id: 'reload-restore' }))

type SavedNavigation = {
  path: string
  state: PartialState<NavigationState>
}

const draftKey = (routeKey: string, name: string) =>
  `${DRAFT_PREFIX}${JSON.stringify([routeKey, name])}`

const draftRouteKey = (key: string): string | null => {
  try {
    const [routeKey] = JSON.parse(key.slice(DRAFT_PREFIX.length)) as unknown[]
    return typeof routeKey === 'string' ? routeKey : null
  } catch {
    return null
  }
}

export function rememberNavigation(
  state: NavigationState | undefined,
  path: string | undefined
) {
  if (!state || !path) return
  if (holdsSecret(state)) store().delete(NAVIGATION_KEY)
  else {
    const saved: SavedNavigation = {
      path: normalizePath(path),
      state: partialState(state),
    }
    store().set(NAVIGATION_KEY, JSON.stringify(saved))
  }
  const live = routeKeys(state)
  for (const key of store().getAllKeys()) {
    if (!key.startsWith(DRAFT_PREFIX)) continue
    const routeKey = draftRouteKey(key)
    if (!routeKey || !live.has(routeKey)) store().delete(key)
  }
}

let restoreTaken = false

export function restoredNavigation(
  path: string
): PartialState<NavigationState> | undefined {
  if (restoreTaken) return undefined
  restoreTaken = true
  const raw = store().getString(NAVIGATION_KEY)
  if (!raw) return undefined
  try {
    const saved = JSON.parse(raw) as SavedNavigation
    return saved.path === normalizePath(path) ? saved.state : undefined
  } catch {
    return undefined
  }
}

export function useReloadState<T>(
  name: string | null,
  initial: T | (() => T)
): [T, Dispatch<SetStateAction<T>>] {
  const routeKey = useContext(NavigationRouteContext)?.key
  const key = routeKey && name ? draftKey(routeKey, name) : null
  const [value, setValue] = useState<T>(() => {
    const raw = key ? store().getString(key) : undefined
    const restored = raw === undefined ? undefined : decodeDraft<T>(raw)
    if (restored) return restored.value
    return typeof initial === 'function' ? (initial as () => T)() : initial
  })

  useEffect(() => {
    if (key) store().set(key, encodeDraft(value))
  }, [key, value])

  useEffect(
    () => () => {
      if (key) store().delete(key)
    },
    [key]
  )

  return [value, setValue]
}

export function forgetReloadRestore() {
  store().clearAll()
}

export function resetReloadRestoreForTests() {
  restoreTaken = false
  _store = null
}
