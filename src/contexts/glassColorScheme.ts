import { createContext } from 'react'
import { GlassColorScheme } from 'expo-glass-effect'

export const GlassColorSchemeOverrideContext = createContext<
  GlassColorScheme | undefined
>(undefined)
