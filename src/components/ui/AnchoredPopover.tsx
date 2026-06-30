import { ReactNode, useEffect, useRef, useState } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleProp,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useNavigation } from '@react-navigation/native'
import useTheme from '@/contexts/theme'

type AnchorRect = { x: number; y: number; width: number; height: number }

export type ResolveAnchorPosition = (args: {
  anchor: AnchorRect
  windowWidth: number
  windowHeight: number
  contentWidth: number
}) => {
  top?: number
  bottom?: number
  left: number
  /**
   * Caps the content's height and scrolls any overflow, so a tall popover
   * anchored near a screen edge stays fully on-screen. Omit to size to content
   * (the default — unconstrained, no scroll).
   */
  maxHeight?: number
}

interface Props {
  /**
   * Renders the press target. Attach `anchorRef` to the outermost native View
   * (must have `collapsable={false}` so RN keeps it measurable) and call
   * `onPress` to open the popover.
   */
  renderTrigger: (props: {
    onPress: () => void
    anchorRef: React.RefObject<View | null>
  }) => ReactNode
  /**
   * Width of the popover content. Used by the default positioner to clamp the
   * popover horizontally inside the window.
   */
  contentWidth: number
  /**
   * Customize where the content lands relative to the measured anchor. Defaults
   * to "below the anchor, left-aligned, clamped to a 12pt margin."
   */
  resolvePosition?: ResolveAnchorPosition
  /**
   * Optional override for the content container's visual style (padding, gap,
   * etc.). Width and positioning are managed by the popover.
   */
  contentStyle?: StyleProp<ViewStyle>
  /**
   * Popover content. Pass a function form to receive a `close` helper for
   * in-content dismiss affordances (e.g. selecting an item closes the
   * popover).
   */
  children: ReactNode | ((props: { close: () => void }) => ReactNode)
}

const ANIMATION_MS = 140
/**
 * Hold the Modal mounted past the close animation so any in-flight Reanimated
 * worklet commit lands on a live shadow node. Without this slack, rapid
 * open/close cycles race the Modal teardown — the worklet's next DisplayLink
 * tick clones a shadow node whose `folly::dynamic` props were just freed and
 * the app segfaults during ShadowTree commit (reanimated#9293, #7666; same bug
 * class as the comment in `ColorPickerSheet.tsx`).
 *
 * 250ms = 140ms animation + 110ms slack (>2 frames at 120Hz ProMotion).
 */
const UNMOUNT_DELAY_MS = 250

const defaultResolvePosition: ResolveAnchorPosition = ({
  anchor,
  windowWidth,
  contentWidth,
}) => {
  const margin = 12
  const left = Math.min(
    Math.max(margin, anchor.x),
    windowWidth - contentWidth - margin
  )
  return { top: anchor.y + anchor.height + 8, left }
}

/**
 * Anchored popover that opens above its trigger. Built on RN `Modal` (new
 * UIWindow) rather than tamagui `Popover` so the popover stays visible when the
 * host screen is presented as a native modal / form-sheet — tamagui's Portal
 * mounts behind those presentations and the content is never seen.
 *
 * **Always reach for this component instead of building a fresh
 * Modal+Reanimated popover.** It owns the safe Modal mount lifecycle that keeps
 * Reanimated worklet commits from racing shadow-tree teardown — see
 * `UNMOUNT_DELAY_MS` for the why.
 */
const AnchoredPopover = ({
  renderTrigger,
  contentWidth,
  resolvePosition = defaultResolvePosition,
  contentStyle,
  children,
}: Props) => {
  const theme = useTheme()
  const navigation = useNavigation()
  const dims = useWindowDimensions()
  const anchorRef = useRef<View>(null)
  const [anchor, setAnchor] = useState<AnchorRect | null>(null)
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const progress = useSharedValue(0)

  useEffect(() => {
    if (open) {
      setMounted(true)
      progress.value = withTiming(1, { duration: ANIMATION_MS })
      return
    }
    progress.value = withTiming(0, { duration: ANIMATION_MS })
    const t = setTimeout(() => setMounted(false), UNMOUNT_DELAY_MS)
    return () => clearTimeout(t)
  }, [open, progress])

  // Close when the host screen loses focus. Without this, a Modal opened
  // before navigation (e.g. an in-popover supporter gate that pushes the
  // paywall) leaves its backdrop floating over the screen on return,
  // blocking every tap.
  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => setOpen(false))
    return unsubscribe
  }, [navigation])

  const handlePress = () => {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height })
      setOpen(true)
    })
  }

  const close = () => setOpen(false)

  const positionStyle: {
    top?: number
    bottom?: number
    left: number
    maxHeight?: number
  } = anchor
    ? resolvePosition({
        anchor,
        windowWidth: dims.width,
        windowHeight: dims.height,
        contentWidth,
      })
    : { top: 0, left: 0 }

  // When the resolver caps the height, the content scrolls inside the cap so it
  // never spills off-screen; padding/gap move onto the scroll content so the
  // bar/sections keep their spacing. Otherwise the popover sizes to content.
  const { maxHeight, ...placement } = positionStyle
  const content =
    typeof children === 'function' ? children({ close }) : children

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }))

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.96 + 0.04 * progress.value }],
  }))

  return (
    <>
      {renderTrigger({ onPress: handlePress, anchorRef })}
      <Modal
        visible={mounted}
        transparent
        statusBarTranslucent
        animationType='none'
        onRequestClose={close}
      >
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.2)',
            },
            backdropAnimatedStyle,
          ]}
        >
          <Pressable style={{ flex: 1 }} onPress={close} />
        </Animated.View>
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: contentWidth,
              borderRadius: theme.numbers.borderRadiusMd,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.card,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 12,
              elevation: 8,
            },
            // A capped popover clips its scroll content to the rounded corners;
            // an uncapped one keeps padding on the box and renders children flat.
            maxHeight != null
              ? { overflow: 'hidden' }
              : [{ padding: 12 }, contentStyle],
            placement,
            contentAnimatedStyle,
          ]}
        >
          {maxHeight != null ? (
            <ScrollView
              style={{ maxHeight }}
              contentContainerStyle={[{ padding: 12 }, contentStyle]}
              showsVerticalScrollIndicator
            >
              {content}
            </ScrollView>
          ) : (
            content
          )}
        </Animated.View>
        <StatusBar translucent />
      </Modal>
    </>
  )
}

export default AnchoredPopover
