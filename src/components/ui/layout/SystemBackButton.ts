import { createContext, useContext, useLayoutEffect } from 'react'
import { NavigationRouteContext } from '@react-navigation/native'

type SystemBackButton = {
  /** The navigation bar can draw this screen's Back button. */
  available: boolean
  routeKey: string
  /** Asks for it; returns the function that hands it back. */
  request: (routeKey: string) => () => void
}

export const SystemBackButtonContext = createContext<SystemBackButton>({
  available: false,
  routeKey: '',
  request: () => () => {},
})

/**
 * Whether the navigation bar draws the Back button in place of a header's own:
 * on iPhone Duo it goes in the vertical bar beside the status bar.
 */
export function useSystemBackButton(wanted: boolean) {
  const { available, routeKey, request } = useContext(SystemBackButtonContext)
  // Only the stack's own screen, not one in a navigator nested inside it.
  const route = useContext(NavigationRouteContext)
  const active = wanted && available && route?.key === routeKey
  // Before paint, so neither Back button is missing for a frame.
  useLayoutEffect(
    () => (active ? request(routeKey) : undefined),
    [active, request, routeKey]
  )
  return active
}
