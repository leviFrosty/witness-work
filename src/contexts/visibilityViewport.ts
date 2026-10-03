import { createContext, type RefObject } from 'react'
import type { View } from 'react-native'

/** The nearest clipping viewport, including scroll views and native popovers. */
export const VisibilityViewportContext = createContext<RefObject<Pick<
  View,
  'measureInWindow'
> | null> | null>(null)
