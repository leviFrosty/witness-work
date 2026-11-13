import { useEffect, useState } from 'react'
import * as Font from 'expo-font'
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter'
import { loadFonts } from '@/lib/fonts/loadFonts'

export const APP_FONTS: Record<string, number> = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter: Inter_500Medium,
  InterBold: Inter_700Bold,
}

export const appFontsLoaded = () =>
  Object.keys(APP_FONTS).every((family) => Font.isLoaded(family))

export function useAppFonts() {
  const [settled, setSettled] = useState(appFontsLoaded)

  useEffect(() => {
    if (settled) return
    let active = true
    const settle = () => {
      if (active) setSettled(true)
    }
    loadFonts(APP_FONTS).then(settle, settle)
    return () => {
      active = false
    }
  }, [settled])

  return settled
}
