import { createContext, useContext } from 'react'
import { NavigationRouteContext } from '@react-navigation/native'

export const StackPanelContext = createContext<string | null>(null)

export function useIsPanelRoot() {
  const panelRoot = useContext(StackPanelContext)
  const route = useContext(NavigationRouteContext)
  return panelRoot !== null && route?.key === panelRoot
}
