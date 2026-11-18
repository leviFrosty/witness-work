import type { NavigationState, PartialState } from '@react-navigation/native'

type AnyState = NavigationState | PartialState<NavigationState>

const SECRET_PARAMS = ['link'] as const

export function holdsSecret(state: AnyState): boolean {
  return state.routes.some(
    (route) =>
      SECRET_PARAMS.some(
        (name) =>
          route.params !== null &&
          typeof route.params === 'object' &&
          (route.params as Record<string, unknown>)[name] !== undefined
      ) ||
      (route.state !== undefined && holdsSecret(route.state))
  )
}

export function partialState(state: AnyState): PartialState<NavigationState> {
  return {
    ...(state.index === undefined ? {} : { index: state.index }),
    routes: state.routes.map((route) => ({
      ...(route.key === undefined ? {} : { key: route.key }),
      name: route.name,
      ...(route.params === undefined ? {} : { params: route.params }),
      ...(route.state ? { state: partialState(route.state) } : {}),
    })),
  } as PartialState<NavigationState>
}

export function routeKeys(state: AnyState, keys = new Set<string>()) {
  for (const route of state.routes) {
    if (route.key) keys.add(route.key)
    if (route.state) routeKeys(route.state, keys)
  }
  return keys
}

export function normalizePath(path: string): string {
  try {
    const url = new URL(path, 'https://app.invalid')
    return decodeURIComponent(url.pathname) + url.search
  } catch {
    return path
  }
}
