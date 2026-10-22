import { useState } from 'react'
import {
  type NativeSyntheticEvent,
  type TextLayoutEventData,
  useWindowDimensions,
} from 'react-native'

const STEP = 0.85
const MIN_SCALE = 0.4
// Chinese, Japanese, Korean and Thai break lines between characters, so a
// break inside a run of letters is normal there.
const BREAKS_ANYWHERE = /[฀-๿぀-ヿ㐀-鿿가-힯]/

/**
 * Whether laying `text` out as `lines` split a word across two lines: there are
 * more words in the lines than in the text.
 */
export const breaksAWord = (text: string, lines: { text: string }[]) => {
  if (BREAKS_ANYWHERE.test(text)) return false
  const words = (value: string) => value.split(/\s+/).filter(Boolean).length
  return (
    lines.reduce((count, line) => count + words(line.text), 0) > words(text)
  )
}

/**
 * Shrinks wrapping text until no word breaks across lines. At large text sizes
 * iOS and Android break a word wider than the line ("micropho / ne"), and
 * `adjustsFontSizeToFit` counts that as fitting. Multiply the Text's font size
 * (and line height) by `scale` and pass `onTextLayout` to it.
 */
export default function useUnbrokenWords(text: string, enabled = true) {
  const { fontScale, width } = useWindowDimensions()
  const key = `${text}|${fontScale}|${width}`
  const [fit, setFit] = useState({ key, scale: 1 })
  const scale = enabled && fit.key === key ? fit.scale : 1
  const onTextLayout = (event: NativeSyntheticEvent<TextLayoutEventData>) => {
    if (!enabled || scale <= MIN_SCALE) return
    if (breaksAWord(text, event.nativeEvent.lines))
      setFit({ key, scale: Math.max(MIN_SCALE, scale * STEP) })
  }
  return { scale, onTextLayout }
}
