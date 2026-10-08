import {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import type { ScheduleView } from '@/features/plans/components/ScheduleViewToggle'
import { type Rect, zoomTransform } from '@/features/plans/lib/scheduleZoom'

const NO_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 }
const ZOOM_DURATION = 440
const FADE_DURATION = 220
/** Fast out of the gate, a long settle: a camera move, not a page flip. */
const ZOOM_EASING = Easing.bezier(0.2, 0.85, 0.25, 1)

/**
 * The Schedule's Year ⇄ Month zoom. `progress` runs 0 (Month) → 1 (Year) on the
 * UI thread. Zooming out shrinks the focused month's weeks onto its tile while
 * the year grows in around it; zooming in reverses the same path, so the reader
 * always sees where the month sits in its year.
 *
 * Both layers move through one pair of rects in the stage's coordinates: the
 * month's weeks in the Month view and its day grid in the Year view. Without
 * rects (not laid out yet) or with Reduce Motion on, the views cross-fade. A
 * new target starts from wherever the last one left off, so taps mid-zoom
 * reverse smoothly.
 *
 * The zoom starts on the tap, before React swaps what the views show. A view
 * whose content is still changing (the list landing on a new month, a new
 * Service Year) is held back with `hold` and fades in on `release`; until then
 * the other view stays up, so neither flashes stale content.
 */
export default function useScheduleZoom(initial: ScheduleView) {
  const reduceMotion = useReducedMotion()
  // Shared values change through `.set()` here, not `.value =`, so the React
  // Compiler can memoize this hook and what it returns stays stable.
  const progress = useSharedValue(initial === 'year' ? 1 : 0)
  /** The Month view's scaled part (weekday header and weeks). */
  const monthFrame = useSharedValue<Rect>(NO_RECT)
  /** The Year view, which scales whole. */
  const yearFrame = useSharedValue<Rect>(NO_RECT)
  const monthRect = useSharedValue<Rect>(NO_RECT)
  const tileRect = useSharedValue<Rect>(NO_RECT)
  /** 0 while a view's content catches up with the zoom. */
  const monthReady = useSharedValue(1)
  const yearReady = useSharedValue(1)

  const zoomTo = (
    view: ScheduleView,
    rects?: { month: Rect; tile: Rect } | null
  ) => {
    const zooms = !!rects && !reduceMotion
    monthRect.set(zooms ? rects.month : NO_RECT)
    tileRect.set(zooms ? rects.tile : NO_RECT)
    progress.set(
      withTiming(view === 'year' ? 1 : 0, {
        duration: zooms ? ZOOM_DURATION : FADE_DURATION,
        easing: ZOOM_EASING,
      })
    )
  }

  const hold = (view: ScheduleView) => {
    if (view === 'month') monthReady.set(0)
    else yearReady.set(0)
  }

  const release = (view: ScheduleView) => {
    // Always animates: a read of the value on this thread can lag the UI
    // thread's, and skipping the release on a stale 1 would leave the view
    // hidden for good. From 1, the timing is a no-op.
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
