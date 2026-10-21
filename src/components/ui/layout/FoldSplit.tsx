import { ReactNode, Ref, useEffect, useRef, useState } from 'react'
import {
  I18nManager,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import DisplayRegionsView, {
  type DisplayDivision,
} from '../../../../modules/display-regions'
import { getFoldSplit } from '@/lib/foldSplit'

// Close to UIKit's default spring for layout changes, without overshoot.
const FOLD_SPRING = { duration: 450, dampingRatio: 1 }

type Props = {
  leading: ReactNode
  /**
   * Without one, the leading column fills the row. It stays the same view
   * either way, so a column can come and go without remounting it.
   */
  trailing?: ReactNode
  /** The leading column's share of the width while the display is flat. */
  leadingFraction?: number
  /** Or its fixed width while flat. */
  leadingWidth?: number
  paddingHorizontal?: number
  gap?: number
  minColumnWidth?: number
  style?: StyleProp<ViewStyle>
  leadingStyle?: StyleProp<ViewStyle>
  trailingStyle?: StyleProp<ViewStyle>
  leadingRef?: Ref<View>
}

/**
 * Two columns side by side that meet at iPhone Duo's fold while it's partly
 * folded like a book, as system split views do, and move there with a spring.
 * Elsewhere it's a plain row with its usual proportions.
 */
export default function FoldSplit({
  leading,
  trailing,
  leadingFraction = 0.5,
  leadingWidth,
  paddingHorizontal = 0,
  gap = 20,
  minColumnWidth = 220,
  style,
  leadingStyle,
  trailingStyle,
  leadingRef,
}: Props) {
  const reduceMotion = useReducedMotion()
  const [width, setWidth] = useState(0)
  const [divisions, setDivisions] = useState<DisplayDivision[]>([])
  const single =
    trailing === undefined || trailing === null || trailing === false
  const split =
    width > 0 && single
      ? {
          leadingWidth: Math.max(0, width - paddingHorizontal * 2),
          gap: 0,
        }
      : width > 0
        ? getFoldSplit({
            width,
            paddingHorizontal,
            gap,
            leading:
              leadingWidth !== undefined
                ? { width: leadingWidth }
                : { fraction: leadingFraction },
            minColumnWidth,
            divisions,
            rtl: I18nManager.isRTL,
          })
        : null

  const leadingSize = useSharedValue(-1)
  const gapSize = useSharedValue(gap)
  // One column just fills the row: no width to chase while the window
  // resizes, which a list inside would lay its rows out at.
  const fill = useSharedValue(single)
  const laidOutWidth = useRef(0)
  const targetLeading = split?.leadingWidth
  const targetGap = split?.gap
  useEffect(() => {
    fill.value = single
    if (targetLeading === undefined || targetGap === undefined) return
    // The first layout and resizes jump; only folding and unfolding animate.
    const animate =
      !reduceMotion && leadingSize.value >= 0 && laidOutWidth.current === width
    laidOutWidth.current = width
    leadingSize.value = animate
      ? withSpring(targetLeading, FOLD_SPRING)
      : targetLeading
    gapSize.value = animate ? withSpring(targetGap, FOLD_SPRING) : targetGap
  }, [
    single,
    targetLeading,
    targetGap,
    width,
    reduceMotion,
    leadingSize,
    gapSize,
    fill,
  ])

  const leadingAnimatedStyle = useAnimatedStyle(() =>
    leadingSize.value < 0
      ? {}
      : fill.value
        ? { width: '100%', flex: 0 }
        : { width: leadingSize.value, flex: 0 }
  )
  const gapAnimatedStyle = useAnimatedStyle(() => ({ width: gapSize.value }))

  return (
    <View
      style={[{ flexDirection: 'row', paddingHorizontal }, style]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <DisplayRegionsView
        style={StyleSheet.absoluteFill}
        onRegionsChange={(regions) => setDivisions(regions.divisions)}
      />
      <Animated.View
        ref={leadingRef}
        collapsable={false}
        style={[
          single
            ? { flex: 1 }
            : leadingWidth !== undefined
              ? { width: leadingWidth }
              : // Against the trailing column's flex 1, until the first layout.
                { flex: leadingFraction / (1 - leadingFraction) },
          { minWidth: 0 },
          leadingStyle,
          leadingAnimatedStyle,
        ]}
      >
        {leading}
      </Animated.View>
      <Animated.View style={gapAnimatedStyle} />
      <View
        style={[
          { flex: 1, minWidth: 0, display: single ? 'none' : 'flex' },
          trailingStyle,
        ]}
      >
        {trailing}
      </View>
    </View>
  )
}
