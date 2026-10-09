import { useEffect, useState } from 'react'
import { TextStyle } from 'react-native'
import * as Font from 'expo-font'
import { fonts } from '@/constants/theme'

/**
 * Inter's italic faces, loaded the first time a note with italics renders
 * rather than at launch. iOS can't slant a custom font on its own, so without
 * them italic text would render upright.
 */
const ITALIC = 'Inter_400Regular_Italic'
const BOLD_ITALIC = 'Inter_700Bold_Italic'

let load: Promise<void> | undefined
const loaded = () => Font.isLoaded(ITALIC) && Font.isLoaded(BOLD_ITALIC)

function loadItalics(): Promise<void> {
  load ??= Font.loadAsync({
    [ITALIC]: require('@/assets/fonts/Inter_400Regular_Italic.ttf'),
    [BOLD_ITALIC]: require('@/assets/fonts/Inter_700Bold_Italic.ttf'),
  }).catch(() => {
    // Fall back to a synthesized slant; try again next time.
    load = undefined
  })
  return load
}

/** Whether the italic faces are ready, loading them when `needed`. */
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

/** The text style for a span's marks, given whether italics have loaded. */
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
