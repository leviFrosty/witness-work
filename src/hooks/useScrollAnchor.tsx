import {
  type RefObject,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react'
import { I18nManager, View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { readingAnchor, type Rect } from '@/lib/scrollAnchor'

type Scrollable = {
  scrollToPosition?: (x: number, y: number, animated?: boolean) => void
  scrollTo?: (options: { x?: number; y?: number; animated?: boolean }) => void
}

/** The line people read along, as a share of the scroll view's height. */
const READING_LINE = 0.2
/**
 * Layout settles over a few frames (columns measure, then split), and later
 * while the display itself is still changing (Android applies a new window size
 * slower). Until then, the anchor is put back each tenth of a second; it stays
 * put once it's there.
 */
const RESTORE_AT_MS = Array.from({ length: 21 }, (_, step) => step * 100)

const nextFrames = (count = 2) =>
  new Promise<void>((resolve) => {
    const step = (left: number) =>
      left <= 0 ? resolve() : requestAnimationFrame(() => step(left - 1))
    step(count)
  })

const measure = (view: View | null | undefined) =>
  new Promise<Rect | null>((resolve) => {
    if (!view) return resolve(null)
    // A view that went away mid-layout never answers.
    const timeout = setTimeout(() => resolve(null), 250)
    // The origin has no size, so only a view not laid out yet gives none.
    view.measureInWindow((x, y, width, height) => {
      clearTimeout(timeout)
      resolve(Number.isFinite(y) ? { x, y, width, height } : null)
    })
  })

/**
 * Keeps what someone was reading in view when a screen changes layout under
 * them, e.g. from one column on iPhone Duo's outer display to two on the inner
 * one: the anchor at the reading line before goes back to that line after, in
 * whichever scroll view now holds it.
 *
 * For each scroll view, pass `scroll(key, scrollRef, frameRef)`'s handlers and
 * render its `origin` as a child. Mark the content with `anchorRef(id, key)`,
 * where `key` is the scroll view it's in, and render its `room` last: when the
 * content ends too soon to bring the anchor up to the reading line (a short
 * column), it adds that much space below, which goes away again as the user
 * scrolls back up past it.
 */
export default function useScrollAnchor(layout: unknown) {
  const scrolls = useRef(
    new Map<
      string,
      {
        view: RefObject<Scrollable | null> | null
        frame: RefObject<View | null> | null
        origin: View | null
      }
    >()
  )
  const anchors = useRef(new Map<string, { view: View; scroll: string }>())
  /** What sat on the reading line when scrolling last came to rest. */
  const reading = useRef<{ id: string; into: number } | null>(null)
  const settling = useRef(0)
  /** A finger moved the content; a scroll of our own doesn't count. */
  const dragged = useRef(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const mounted = useRef(false)
  /** Space added below each scroll view's content; see `room`. */
  const [room, setRoomState] = useState<Record<string, number>>({})
  const roomRef = useRef<Record<string, number>>({})
  const roomViews = useRef(new Map<string, View | null>())
  /** Where each scroll view's content ends, room included. */
  const ends = useRef(new Map<string, View | null>())
  const setRoom = (key: string, height: number) => {
    const next = Math.max(0, Math.round(height))
    if ((roomRef.current[key] ?? 0) === next) return
    roomRef.current = { ...roomRef.current, [key]: next }
    setRoomState(roomRef.current)
  }

  const scrollState = (key: string) => {
    let state = scrolls.current.get(key)
    if (!state) {
      state = { view: null, frame: null, origin: null }
      scrolls.current.set(key, state)
    }
    return state
  }

  const cancelRestore = () => {
    for (const timer of timers.current) clearTimeout(timer)
    timers.current = []
  }

  const settled = async (key: string) => {
    if (!dragged.current) return
    const run = ++settling.current
    const state = scrolls.current.get(key)
    const [frame, origin] = await Promise.all([
      measure(state?.frame?.current),
      measure(state?.origin),
    ])
    if (!frame || !origin || run !== settling.current) return
    // Added space scrolled back below the screen goes away, unseen.
    if (roomRef.current[key]) {
      const spacer = await measure(roomViews.current.get(key))
      const bottom = frame.y + frame.height
      if (spacer && run === settling.current)
        setRoom(key, Math.min(roomRef.current[key], bottom - spacer.y))
    }
    // Even at its top: a column's top can be partway down the page that
    // holds it in one column.
    const line = frame.y + frame.height * READING_LINE
    const candidates = await Promise.all(
      [...anchors.current]
        .filter(([, anchor]) => anchor.scroll === key)
        .map(async ([id, anchor]) => ({ id, rect: await measure(anchor.view) }))
    )
    if (run !== settling.current) return
    const best = readingAnchor(candidates, line, I18nManager.isRTL)
    reading.current = best
  }

  /** One restore at a time, so two don't both make room. */
  const restoring = useRef(false)
  const restore = async () => {
    if (restoring.current) return
    restoring.current = true
    try {
      await restoreNow()
    } finally {
      restoring.current = false
    }
  }
  const restoreNow = async () => {
    const target = reading.current
    if (!target) return
    const anchor = anchors.current.get(target.id)
    const state = anchor && scrolls.current.get(anchor.scroll)
    if (!anchor || !state) return
    const [frame, origin, rect] = await Promise.all([
      measure(state.frame?.current),
      measure(state.origin),
      measure(anchor.view),
    ])
    if (!frame || !origin || !rect) return
    const offset = frame.y - origin.y
    const line = frame.y + frame.height * READING_LINE
    const into = Math.min(target.into, Math.max(0, rect.height - 1))
    // Not above the top, which an inset (a header over the content) can put
    // below zero.
    const y = Math.max(Math.min(0, offset), offset + rect.y + into - line)
    if (Math.abs(y - offset) < 1) return
    const scrollTo = () => {
      const view = state.view?.current
      if (view?.scrollToPosition) view.scrollToPosition(0, y, false)
      else view?.scrollTo?.({ y, animated: false })
    }
    // A short column can't scroll that far: make room below, then go again.
    for (let attempt = 0; attempt < 3; attempt++) {
      scrollTo()
      await nextFrames()
      const [now, end] = await Promise.all([
        measure(state.origin),
        measure(ends.current.get(anchor.scroll)),
      ])
      if (!now || !end || dragged.current) return
      const short = y - (frame.y - now.y)
      // Only the content's end, on screen, stops it: not an inset at the top.
      const atEnd = end.y <= frame.y + frame.height + 1
      if (short < 1 || !atEnd) return
      setRoom(anchor.scroll, (roomRef.current[anchor.scroll] ?? 0) + short)
      await nextFrames()
    }
  }

  // A screen out of sight (another tab) puts its anchor back once it's seen
  // again: until then it can't be measured, and the work would only slow the
  // screen that is.
  const isFocused = useIsFocused()
  const pending = useRef(false)
  const restoreSoon = useEffectEvent(() => {
    cancelRestore()
    if (!isFocused) {
      pending.current = true
      return
    }
    pending.current = false
    dragged.current = false
    // Space made for the last layout; this one makes its own.
    if (Object.keys(roomRef.current).length) {
      roomRef.current = {}
      setRoomState({})
    }
    timers.current = RESTORE_AT_MS.map((ms) => setTimeout(restore, ms))
  })
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    restoreSoon()
  }, [layout])
  useEffect(() => {
    if (isFocused && pending.current) restoreSoon()
  }, [isFocused])
  useEffect(() => cancelRestore, [])

  return {
    /**
     * `scrollRef` is the scroll view's ref, to scroll it, and `frameRef` a
     * view's with the scroll view's frame.
     */
    scroll: (
      key: string,
      scrollRef: RefObject<Scrollable | null>,
      frameRef: RefObject<View | null>
    ) => {
      const state = scrollState(key)
      state.view = scrollRef
      state.frame = frameRef
      return {
        /** Where the content starts and ends, to read the offset from. */
        origin: (
          <>
            <View
              ref={(view) => {
                state.origin = view
              }}
              collapsable={false}
              pointerEvents='none'
              style={{ position: 'absolute', top: 0, width: 0, height: 0 }}
            />
            <View
              ref={(view) => {
                ends.current.set(key, view)
              }}
              collapsable={false}
              pointerEvents='none'
              style={{ position: 'absolute', bottom: 0, width: 0, height: 0 }}
            />
          </>
        ),
        /** Space below the content, while a short column needs it. */
        room: room[key] ? (
          <View
            ref={(view) => {
              roomViews.current.set(key, view)
            }}
            collapsable={false}
            pointerEvents='none'
            style={{ height: room[key] }}
          />
        ) : null,
        onScrollBeginDrag: () => {
          // A finger on the content wins over a pending restore.
          cancelRestore()
          settling.current++
          dragged.current = true
        },
        // Again after any glide; a restore that scrolls later isn't the user's.
        onScrollEndDrag: () => settled(key),
        onMomentumScrollEnd: () => {
          settled(key)
          dragged.current = false
        },
      }
    },
    /** Back at the top (a status bar tap, the tab tapped again). */
    reset: () => {
      settling.current++
      dragged.current = false
      reading.current = null
      roomRef.current = {}
      setRoomState({})
    },
    anchorRef: (id: string, scroll: string) => (view: View | null) => {
      if (view) anchors.current.set(id, { view, scroll })
      else if (anchors.current.get(id)?.scroll === scroll)
        anchors.current.delete(id)
    },
  }
}
