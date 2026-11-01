import { useEffect, useState } from 'react'
import * as Font from 'expo-font'
import { Inter_800ExtraBold } from '@expo-google-fonts/inter'
import { fonts, type Fonts } from '@/constants/theme'
import { boldTextFonts, EXTRA_BOLD_FONT } from '@/lib/boldTextFonts'
import useBoldTextEnabled from '@/hooks/useBoldTextEnabled'

export default function useBoldTextFonts(): Fonts {
  const boldText = useBoldTextEnabled()
  const [extraBoldLoaded, setExtraBoldLoaded] = useState(() =>
    Font.isLoaded(EXTRA_BOLD_FONT)
  )

  useEffect(() => {
    if (!boldText || extraBoldLoaded) return
    Font.loadAsync({ [EXTRA_BOLD_FONT]: Inter_800ExtraBold }).then(
      () => setExtraBoldLoaded(true),

      () => {}
    )
  }, [boldText, extraBoldLoaded])

  return boldText ? boldTextFonts(fonts, extraBoldLoaded) : fonts
}
