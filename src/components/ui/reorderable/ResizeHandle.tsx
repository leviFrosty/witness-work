import { useEffect, useRef } from 'react'
import { Platform, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Svg, { Defs, Path, RadialGradient, Stop } from 'react-native-svg'
import PointerTooltip from '@/components/ui/PointerTooltip'
import useTheme from '@/contexts/theme'
import { isRtlLayout } from '@/lib/direction'
import PointerStyleView, {
  type PointerAccessory,
} from '../../../../modules/pointer-style'

/**
 * Measured from the iOS Home Screen's widget handle: a glass "bean" 12pt thick,
 * one quarter circle centered on the widget's edges, its round ends about 25pt
 * from the corner along each edge.
 */
const THICKNESS = 12
/** The radius of the bean's centerline, whatever the item's own corner. */
const ARC = 19
/** Room around the bean for its rim and shadow. */
const PAD = 3
/** The touch target, square, centered on the corner. */
const TARGET = 44
/** Movement under this is a tap, which steps to the next size. */
const TAP_SLOP = 6
/** A hold longer than this without moving isn't a tap. */
const TAP_MAX_MS = 500

/**
 * The curved bracket at a resizable item's bottom trailing corner while a
 * screen is being edited, as on a Home Screen widget. Dragging it reports the
 * movement so the item can snap to the nearest size; tapping it steps to the
 * next size, for anyone who'd rather not drag.
 */
export default function ResizeHandle({
  label,
  onBegin,
  onDrag,
  onEnd,
  accessories,
}: {
  /** E.g. "Resize Daily Pace". */
  label: string
  onBegin: () => void
  /**
   * How far the corner has been dragged, in points, toward the trailing edge
   * and down.
   */
  onDrag: (forward: number, down: number) => void
  /** `tapped` when it was a tap rather than a drag. */
  onEnd: (tapped: boolean) => void
  /** Arrows beside the iPad pointer: the ways the item can still resize. */
  accessories: PointerAccessory[]
}) {
  const theme = useTheme()
  const rtl = isRtlLayout()
  const moved = useRef(false)
  const heldSince = useRef<number | null>(null)
  const latestOnEnd = useRef(onEnd)
  useEffect(() => {
    latestOnEnd.current = onEnd
  })
  // Gone mid-drag (Done, Back, or the item removed): end the resize, or the
  // screen would stay locked for it.
  useEffect(
    () => () => {
      if (heldSince.current !== null) latestOnEnd.current(false)
    },
    []
  )

  const dark = theme.colors.background === '#121212'
  const half = THICKNESS / 2
  // The item's corner, in the drawing's coordinates.
  const corner = ARC + half + PAD
  const box = corner + half + PAD
  // The arc's center: shading runs from its inner edge out.
  const center = corner - ARC
  const path = `M ${corner} ${center} A ${ARC} ${ARC} 0 0 1 ${center} ${corner}`
  const outside = half + PAD

  const pan = Gesture.Pan()
    .minDistance(0)
    // Reaches in over the item only: past the corner, in the gap, sits the
    // next card's remove badge.
    .hitSlop(rtl ? { top: 8, right: 8 } : { top: 8, left: 8 })
    .runOnJS(true)
    .onBegin(() => {
      moved.current = false
      heldSince.current = Date.now()
      onBegin()
    })
    .onUpdate((e) => {
      if (Math.hypot(e.translationX, e.translationY) > TAP_SLOP) {
        moved.current = true
      }
      if (moved.current) {
        onDrag(rtl ? -e.translationX : e.translationX, e.translationY)
      }
    })
    .onFinalize(() => {
      const since = heldSince.current
      heldSince.current = null
      // A press that stays put and lets go soon is a tap: the next size.
      onEnd(!moved.current && since !== null && Date.now() - since < TAP_MAX_MS)
    })

  return (
    <View
      style={{
        position: 'absolute',
        bottom: -outside,
        end: -outside,
        width: box,
        height: box,
        zIndex: 2,
      }}
    >
      <GestureDetector gesture={pan}>
        <PointerStyleView
          accessories={accessories}
          accessible
          accessibilityRole='button'
          accessibilityLabel={label}
          accessibilityActions={[{ name: 'activate' }]}
          onAccessibilityAction={() => {
            onBegin()
            onEnd(true)
          }}
          style={{
            position: 'absolute',
            // The target is centered on the item's corner.
            bottom: outside - TARGET / 2,
            end: outside - TARGET / 2,
            width: TARGET,
            height: TARGET,
          }}
        >
          <PointerTooltip label={label} style={{ flex: 1 }}>
            <View style={{ flex: 1 }} />
          </PointerTooltip>
        </PointerStyleView>
      </GestureDetector>
      <Svg
        pointerEvents='none'
        width={box}
        height={box}
        style={{
          position: 'absolute',
          top: 0,
          start: 0,
          transform: [{ scaleX: rtl ? -1 : 1 }],
          // iOS shades by what's drawn; Android gets a soft stroke below.
          shadowColor: '#000000',
          shadowOpacity: dark ? 0.4 : 0.16,
          shadowRadius: 3,
          shadowOffset: { width: 0, height: 1 },
        }}
      >
        <Defs>
          {/* Lit along its inner edge and shaded toward the outer one, like
              the system's glass. */}
          <RadialGradient
            id='resizeHandleGlass'
            gradientUnits='userSpaceOnUse'
            cx={center}
            cy={center}
            r={ARC + half}
          >
            <Stop
              offset={(ARC - half) / (ARC + half)}
              stopColor={dark ? '#8E8E93' : '#FFFFFF'}
            />
            <Stop offset='1' stopColor={dark ? '#48484A' : '#DCDCE0'} />
          </RadialGradient>
        </Defs>
        {Platform.OS === 'android' ? (
          <Path
            d={path}
            stroke='#000000'
            strokeOpacity={dark ? 0.3 : 0.08}
            strokeWidth={THICKNESS + 3}
            strokeLinecap='round'
            fill='none'
            translateY={1}
          />
        ) : null}
        {/* The rim: a hairline around the bean. */}
        <Path
          d={path}
          stroke={dark ? '#FFFFFF' : '#000000'}
          strokeOpacity={dark ? 0.2 : 0.14}
          strokeWidth={THICKNESS + 1}
          strokeLinecap='round'
          fill='none'
        />
        <Path
          d={path}
          stroke='url(#resizeHandleGlass)'
          strokeOpacity={0.96}
          strokeWidth={THICKNESS}
          strokeLinecap='round'
          fill='none'
        />
      </Svg>
    </View>
  )
}
