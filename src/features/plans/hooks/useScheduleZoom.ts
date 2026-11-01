import {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import type { ScheduleView } from '@/features/plans/components/ScheduleViewToggle'
import { type Rect, zoomTransform } from '@/features/plans/lib/scheduleZoom'

const NO_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 }
const ZOOM_DURATION = 440
const FADE_DURATION = 220

const ZOOM_EASING = Easing.bezier(0.2, 0.85, 0.25, 1)

export default function useScheduleZoom(initial: ScheduleView) {
  const reduceMotion = useReducedMotion()

  const progress = useSharedValue(initial === 'year' ? 1 : 0)

  const monthFrame = useSharedValue<Rect>(NO_RECT)

  const yearFrame = useSharedValue<Rect>(NO_RECT)
  const monthRect = useSharedValue<Rect>(NO_RECT)
  const tileRect = useSharedValue<Rect>(NO_RECT)

  const monthReady = useSharedValue(1)
  const yearReady = useSharedValue(1)

  const zoomTo = (
    view: ScheduleView,
    rects?: { month: Rect; tile: Rect } | null,

    onSettled?: () => void
  ) => {
    const zooms = !!rects && !reduceMotion
    monthRect.set(zooms ? rects.month : NO_RECT)
    tileRect.set(zooms ? rects.tile : NO_RECT)
    progress.set(
      withTiming(
        view === 'year' ? 1 : 0,
        {
          duration: zooms ? ZOOM_DURATION : FADE_DURATION,
          easing: ZOOM_EASING,
        },
        () => {
          if (onSettled) scheduleOnRN(onSettled)
        }
      )
    )
  }

  const hold = (view: ScheduleView) => {
    if (view === 'month') monthReady.set(0)
    else yearReady.set(0)
  }

  const release = (view: ScheduleView) => {
    const ready = view === 'month' ? monthReady : yearReady
    ready.set(withTiming(1, { duration: FADE_DURATION }))
  }

  const monthChromeStyle = useAnimatedStyle(() => ({
    opacity:
      Math.max(
        interpolate(progress.value, [0, 0.4], [1, 0], 'clamp'),
        1 - yearReady.value
      ) * monthReady.value,
  }))

  const monthZoomStyle = useAnimatedStyle(() => {
    const t = zoomTransform(
      monthFrame.value,
      monthRect.value,
      tileRect.value,
      progress.value
    )
    return {
      opacity:
        Math.max(
          interpolate(progress.value, [0.15, 0.7], [1, 0], 'clamp'),
          1 - yearReady.value
        ) * monthReady.value,
      transform: [
        { translateX: t.translateX },
        { translateY: t.translateY },
        { scale: t.scale },
      ],
    }
  })

  const yearZoomStyle = useAnimatedStyle(() => {
    const t = zoomTransform(
      yearFrame.value,
      tileRect.value,
      monthRect.value,
      1 - progress.value
    )
    return {
      opacity:
        Math.max(
          interpolate(progress.value, [0.3, 0.85], [0, 1], 'clamp'),
          1 - monthReady.value
        ) * yearReady.value,
      transform: [
        { translateX: t.translateX },
        { translateY: t.translateY },
        { scale: t.scale },
      ],
    }
  })

  return {
    setMonthFrame: (frame: Rect) => monthFrame.set(frame),
    setYearFrame: (frame: Rect) => yearFrame.set(frame),
    zoomTo,
    hold,
    release,
    monthChromeStyle,
    monthZoomStyle,
    yearZoomStyle,
  }
}
