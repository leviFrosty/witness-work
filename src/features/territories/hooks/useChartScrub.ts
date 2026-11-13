import { useRef } from 'react'
import { Gesture, PointerType } from 'react-native-gesture-handler'
import Haptics from '@/lib/haptics'
import { notePointerHover, supportsPointerHover } from '@/lib/pointerHover'

export type ScrubPick = (index: number | null) => void

export default function useChartScrub(
  locate: (x: number, y: number) => number | null,
  onPick: ScrubPick
) {
  const last = useRef<number | null>(null)

  const pick = (x: number, y: number, touch: boolean, toggle = false) => {
    const index = locate(x, y)
    const next = toggle && index === last.current ? null : index
    if (next === last.current) return
    last.current = next
    if (touch && next !== null) void Haptics.selection()
    onPick(next)
  }
  const clear = () => {
    if (last.current === null) return
    last.current = null
    onPick(null)
  }
  const isTouch = (pointerType: PointerType) =>
    pointerType !== PointerType.MOUSE

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((event, success) => {
      if (success) pick(event.x, event.y, isTouch(event.pointerType), true)
    })
  const drag = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .onStart((event) => pick(event.x, event.y, isTouch(event.pointerType)))
    .onUpdate((event) => pick(event.x, event.y, isTouch(event.pointerType)))
  const touch = Gesture.Race(drag, tap)
  if (!supportsPointerHover) return touch

  const hover = Gesture.Hover()
    .runOnJS(true)
    .onBegin((event) => {
      notePointerHover(
        event.pointerType === PointerType.STYLUS ? 'stylus' : 'pointer'
      )
      pick(event.x, event.y, false)
    })
    .onUpdate((event) => pick(event.x, event.y, false))
    .onFinalize(clear)
  return Gesture.Simultaneous(touch, hover)
}
