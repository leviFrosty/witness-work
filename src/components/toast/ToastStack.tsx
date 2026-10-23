import { useEffect, useState } from 'react'
import { View } from 'react-native'
import PointerHover from '@/components/ui/PointerHover'
import ToastView, {
  TOAST_GAP,
  TOAST_PEEK,
  VISIBLE_BEHIND,
  type ToastLeave,
} from '@/components/toast/ToastView'
import {
  toast as toasts,
  type Toast,
  type ToastPlacement,
} from '@/stores/toasts'

/** A spread-out stack folds back up this long after the last touch. */
const COLLAPSE_AFTER_MS = 4000

/**
 * The toasts of one edge, newest in front (Sonner's stack). Their time pauses
 * while the User touches the stack, hovers it with a pointer, or has it spread
 * out.
 */
export default function ToastStack({
  placement,
  items,
  hidden,
  inset,
  reduceMotion,
  screenReader,
}: {
  placement: ToastPlacement
  /** This edge's toasts, oldest first. */
  items: Toast[]
  /** Off screen for now, e.g. while a takeover shows. */
  hidden: boolean
  /** Distance from the edge. */
  inset: number
  reduceMotion: boolean
  screenReader: boolean
}) {
  const [heights, setHeights] = useState<Record<number, number>>({})
  const [leaving, setLeaving] = useState<Record<number, ToastLeave>>({})
  const [expanded, setExpanded] = useState(false)
  const [touching, setTouching] = useState(false)
  const [hovering, setHovering] = useState(false)

  const ordered = [...items].reverse()
  const present = ordered.filter((item) => !leaving[item.id])
  const frontHeight = present[0] ? (heights[present[0].id] ?? 0) : 0

  // One toast left has nothing to spread out.
  if (expanded && present.length < 2) setExpanded(false)

  // Forgets toasts closed from elsewhere (replaced, or the app went away).
  const ids = items.map((item) => item.id).join(' ')
  useEffect(() => {
    const live = new Set(ids.split(' ').map(Number))
    const prune = <T,>(map: Record<number, T>) => {
      const kept = Object.fromEntries(
        Object.entries(map).filter(([id]) => live.has(Number(id)))
      ) as Record<number, T>
      return Object.keys(kept).length === Object.keys(map).length ? map : kept
    }
    setHeights(prune)
    setLeaving(prune)
  }, [ids])

  useEffect(() => {
    if (!expanded || touching || hovering) return
    const timer = setTimeout(() => setExpanded(false), COLLAPSE_AFTER_MS)
    return () => clearTimeout(timer)
  }, [expanded, touching, hovering])

  const onMeasure = (id: number, height: number) =>
    setHeights((current) =>
      current[id] === height ? current : { ...current, [id]: height }
    )
  const onLeave = (id: number, leave: ToastLeave) =>
    setLeaving((current) =>
      current[id] ? current : { ...current, [id]: leave }
    )
  const onExited = (id: number, reason: ToastLeave['reason']) => {
    toasts.dismiss(id, reason)
    setLeaving(({ [id]: _gone, ...rest }) => rest)
    setHeights(({ [id]: _gone, ...rest }) => rest)
  }

  let offset = 0
  const offsets = present.map((item) => {
    const start = offset
    offset += (heights[item.id] ?? 0) + TOAST_GAP
    return start
  })
  // Covers every toast, so Android delivers their touches.
  const span = expanded
    ? Math.max(0, offset - TOAST_GAP)
    : frontHeight + TOAST_PEEK * Math.min(present.length - 1, VISIBLE_BEHIND)

  return (
    <View
      pointerEvents='box-none'
      style={{
        position: 'absolute',
        start: 0,
        end: 0,
        [placement]: inset,
        alignItems: 'center',
        paddingHorizontal: 12,
        opacity: hidden ? 0 : 1,
      }}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
    >
      <PointerHover
        onHoverChange={(hovered) => {
          setHovering(hovered)
          if (hovered && present.length > 1) setExpanded(true)
        }}
      >
        <View
          pointerEvents={hidden ? 'none' : 'box-none'}
          style={{ width: '100%', maxWidth: 480, height: Math.max(0, span) }}
        >
          {ordered.map((item) => {
            const index = leaving[item.id] ? null : present.indexOf(item)
            return (
              <ToastView
                key={item.id}
                toast={item}
                placement={placement}
                index={index}
                expanded={expanded}
                frontHeight={frontHeight}
                offset={index === null ? 0 : offsets[index]}
                height={heights[item.id]}
                hidden={hidden}
                paused={expanded || touching || hovering}
                reduceMotion={reduceMotion}
                screenReader={screenReader}
                leaving={leaving[item.id] ?? null}
                onMeasure={onMeasure}
                onLeave={onLeave}
                onExited={onExited}
                onTouch={setTouching}
                onExpand={() => setExpanded(true)}
              />
            )
          })}
        </View>
      </PointerHover>
    </View>
  )
}
