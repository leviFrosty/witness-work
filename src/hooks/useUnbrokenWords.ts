import { useState } from 'react'
import {
  type NativeSyntheticEvent,
  type TextLayoutEventData,
  useWindowDimensions,
} from 'react-native'

const STEP = 0.85
const MIN_SCALE = 0.4

const BREAKS_ANYWHERE = /[฀-๿぀-ヿ㐀-鿿가-힯]/

export const breaksAWord = (text: string, lines: { text: string }[]) => {
  if (BREAKS_ANYWHERE.test(text)) return false
  const words = (value: string) => value.split(/\s+/).filter(Boolean).length
  return (
    lines.reduce((count, line) => count + words(line.text), 0) > words(text)
  )
}

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
