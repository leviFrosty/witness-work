import { useEffect, useState } from 'react'
import * as Font from 'expo-font'
import { APP_FONTS, appFontsLoaded } from '@/app/useAppFonts'

export const FONT_WAIT_MS = 250

export function useGuestFonts() {
  const [settled, setSettled] = useState(appFontsLoaded)

  useEffect(() => {
    if (settled) return
    const settle = () => setSettled(true)
    const timer = setTimeout(settle, FONT_WAIT_MS)
    Font.loadAsync(
      Object.fromEntries(
        Object.entries(APP_FONTS).map(([family, uri]) => [
          family,
          { uri, display: Font.FontDisplay.SWAP },
        ])
      )
    ).then(settle, settle)
    return () => clearTimeout(timer)
  }, [settled])

  return settled
}
