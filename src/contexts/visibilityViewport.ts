import { createContext, type RefObject } from 'react'
import type { View } from 'react-native'

export const VisibilityViewportContext = createContext<RefObject<Pick<
  View,
  'measureInWindow'
> | null> | null>(null)
