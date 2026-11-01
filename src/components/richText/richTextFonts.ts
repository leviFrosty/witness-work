import { useEffect, useState } from 'react'
import { TextStyle } from 'react-native'
import * as Font from 'expo-font'
import { fonts } from '@/constants/theme'

const ITALIC = 'Inter_400Regular_Italic'
const BOLD_ITALIC = 'Inter_700Bold_Italic'

let load: Promise<void> | undefined
const loaded = () => Font.isLoaded(ITALIC) && Font.isLoaded(BOLD_ITALIC)

function loadItalics(): Promise<void> {
  load ??= Font.loadAsync({
    [ITALIC]: require('@/assets/fonts/Inter_400Regular_Italic.ttf'),
    [BOLD_ITALIC]: require('@/assets/fonts/Inter_700Bold_Italic.ttf'),
  }).catch(() => {
    load = undefined
  })
  return load
}

export function useItalicFonts(needed: boolean): boolean {
  const [ready, setReady] = useState(loaded)
  useEffect(() => {
    if (!needed || ready) return
    let active = true
    void loadItalics().then(() => {
      if (active) setReady(loaded())
    })
    return () => {
      active = false
    }
  }, [needed, ready])
  return ready
}

export function markFontStyle(
  bold: boolean,
  italic: boolean,
  italicsReady: boolean
): TextStyle {
  if (italic && italicsReady) {
    return { fontFamily: bold ? BOLD_ITALIC : ITALIC }
  }
  return {
    ...(bold && { fontFamily: fonts.bold }),
    ...(italic && { fontStyle: 'italic' }),
  }
}
