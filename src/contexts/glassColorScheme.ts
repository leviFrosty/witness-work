import { createContext } from 'react'
import { GlassColorScheme } from 'expo-glass-effect'

/**
 * Forces the glass appearance for a subtree regardless of the user's theme —
 * e.g. map overlays that sit on dark satellite imagery. `undefined` defers to
 * the user's preference (see `useGlassColorScheme`).
 */
export const GlassColorSchemeOverrideContext = createContext<
  GlassColorScheme | undefined
>(undefined)
