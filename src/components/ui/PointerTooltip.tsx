import { type ReactElement, useEffect, useRef, useState } from 'react'
import {
  Platform,
  type StyleProp,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native'
import { create } from 'zustand'
import useTheme from '@/contexts/theme'
import FullWindowOverlay from '@/components/ui/FullWindowOverlay'
import PointerHover, { type PointerEffect } from '@/components/ui/PointerHover'
import Text from '@/components/ui/MyText'

type Placement = 'right' | 'left' | 'top' | 'bottom'
type Rect = { x: number; y: number; width: number; height: number }
type Tip = { id: number; label: string; anchor: Rect; placement: Placement }

const useTooltip = create<{ tip: Tip | null }>(() => ({ tip: null }))

const SHOW_DELAY_MS = 500
// Moving straight to a neighbouring control shows its label at once.
const WARM_MS = 600
const GAP = 8
const EDGE = 8

let nextId = 0
let lastHiddenAt = 0

type Props = {
  /** Visible name of the control; screen readers keep its own label. */
  label: string
  children: ReactElement
  placement?: Placement
  /** E.g. only while a sidebar shows icons without labels. */
  enabled?: boolean
  effect?: PointerEffect
  /**
   * Style for the measured wrapper: pass layout the child relied on (e.g.
   * `flex: 1`) and its `borderRadius`, which shapes the pointer effect.
   */
  style?: StyleProp<ViewStyle>
}

/**
 * Names an icon-only control when a pointer rests on it. Skip it where the
 * label is already visible, and never put instructions in it.
 */
export default function PointerTooltip({
  label,
  children,
  placement = 'bottom',
  enabled = true,
  effect = 'highlight',
  style,
}: Props) {
  const anchorRef = useRef<View>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const shownId = useRef<number>(undefined)

  const hide = () => {
    clearTimeout(timer.current)
    if (shownId.current === undefined) return
    if (useTooltip.getState().tip?.id === shownId.current) {
      useTooltip.setState({ tip: null })
      lastHiddenAt = Date.now()
    }
    shownId.current = undefined
  }

  const show = () => {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      if (!width && !height) return
      const id = ++nextId
      shownId.current = id
      useTooltip.setState({
        tip: { id, label, anchor: { x, y, width, height }, placement },
      })
    })
  }

  useEffect(() => hide, [])
  useEffect(() => {
    if (!enabled) hide()
  }, [enabled])

  return (
    <PointerHover
      effect={effect}
      onHoverChange={
        enabled
          ? (hovered) => {
              if (!hovered) return hide()
              const warm = Date.now() - lastHiddenAt < WARM_MS
              timer.current = setTimeout(show, warm ? 0 : SHOW_DELAY_MS)
            }
          : undefined
      }
    >
      {/* A click means the label did its job; get out of the way. */}
      <View
        ref={anchorRef}
        collapsable={false}
        onTouchStart={hide}
        style={style}
      >
        {children}
      </View>
    </PointerHover>
  )
}

/** Mount once near the app root; draws whichever tooltip is showing. */
export function PointerTooltipLayer() {
  const tip = useTooltip((s) => s.tip)
  if (!tip) return null
  // Mounted only while visible: an idle window-level overlay can interfere
  // with native sheets (see AnimationViewProvider).
  return (
    <FullWindowOverlay>
      <PlacedTooltip key={tip.id} tip={tip} />
    </FullWindowOverlay>
  )
}

function PlacedTooltip({ tip }: { tip: Tip }) {
  const window = useWindowDimensions()
  const [size, setSize] = useState<Size>()
  const { anchor, placement } = tip

  const position = (() => {
    if (!size) return undefined
    const centeredLeft = anchor.x + anchor.width / 2 - size.width / 2
    const centeredTop = anchor.y + anchor.height / 2 - size.height / 2
    const raw = {
      right: { left: anchor.x + anchor.width + GAP, top: centeredTop },
      left: { left: anchor.x - GAP - size.width, top: centeredTop },
      top: { left: centeredLeft, top: anchor.y - GAP - size.height },
      bottom: { left: centeredLeft, top: anchor.y + anchor.height + GAP },
    }[placement]
    return {
      left: clamp(raw.left, EDGE, window.width - size.width - EDGE),
      top: clamp(raw.top, EDGE, window.height - size.height - EDGE),
    }
  })()

  return (
    // Repeats the control's own accessibility label, so screen readers skip it.
    <View
      pointerEvents='none'
      accessibilityElementsHidden
      importantForAccessibility='no-hide-descendants'
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <TooltipBubble label={tip.label} position={position} onSize={setSize} />
    </View>
  )
}

type Size = { width: number; height: number }

/**
 * The tooltip's look, for labels placed by their own rules (e.g. map pins).
 * Stays invisible until `position` arrives, which callers derive from the size
 * reported by `onSize`.
 */
export function TooltipBubble({
  label,
  position,
  onSize,
  maxWidth = 280,
}: {
  label: string
  position: { left: number; top: number } | undefined
  onSize: (size: Size) => void
  maxWidth?: number
}) {
  const theme = useTheme()
  return (
    <View
      onLayout={({ nativeEvent: { layout } }) =>
        onSize({ width: layout.width, height: layout.height })
      }
      style={{
        position: 'absolute',
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        opacity: position ? 1 : 0,
        maxWidth,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: theme.numbers.borderRadiusMd,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.card,
        shadowColor: theme.colors.shadow,
        shadowOpacity: 0.12,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: Platform.OS === 'android' ? 4 : undefined,
      }}
    >
      <Text
        numberOfLines={2}
        style={{
          fontSize: theme.fontSize('sm'),
          fontFamily: theme.fonts.semiBold,
        }}
      >
        {label}
      </Text>
    </View>
  )
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max))
