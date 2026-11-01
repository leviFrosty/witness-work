import { createContext, useContext, useLayoutEffect } from 'react'
import { NavigationRouteContext } from '@react-navigation/native'

type SystemBackButton = {
  available: boolean
  routeKey: string

  request: (routeKey: string) => () => void
}

export const SystemBackButtonContext = createContext<SystemBackButton>({
  available: false,
  routeKey: '',
  request: () => () => {},
})

export function useSystemBackButton(wanted: boolean) {
  const { available, routeKey, request } = useContext(SystemBackButtonContext)

  const route = useContext(NavigationRouteContext)
  const active = wanted && available && route?.key === routeKey

  useLayoutEffect(
    () => (active ? request(routeKey) : undefined),
    [active, request, routeKey]
  )
  return active
}
