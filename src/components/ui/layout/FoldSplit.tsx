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
import { FoldHandled, useFoldHandled } from '@/components/ui/layout/FoldPane'

const FOLD_SPRING = { duration: 450, dampingRatio: 1 }

type Props = {
  leading: ReactNode

  trailing?: ReactNode

  leadingFraction?: number

  leadingWidth?: number

  trailingWidth?: number
  paddingHorizontal?: number
  gap?: number
  minColumnWidth?: number
  style?: StyleProp<ViewStyle>
  leadingStyle?: StyleProp<ViewStyle>
  trailingStyle?: StyleProp<ViewStyle>
  leadingRef?: Ref<View>
}

export default function FoldSplit({
  leading,
  trailing,
  leadingFraction = 0.5,
  leadingWidth,
  trailingWidth,
  paddingHorizontal = 0,
  gap = 20,
  minColumnWidth = 220,
  style,
  leadingStyle,
  trailingStyle,
  leadingRef,
}: Props) {
  const reduceMotion = useReducedMotion()
  const handled = useFoldHandled()
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
                : trailingWidth !== undefined
                  ? { trailingWidth }
                  : { fraction: leadingFraction },
            minColumnWidth,
            divisions,
            rtl: I18nManager.isRTL,
          })
        : null

  const leadingSize = useSharedValue(-1)
  const gapSize = useSharedValue(gap)

  const fill = useSharedValue(single)
  const laidOutWidth = useRef(0)
  const targetLeading = split?.leadingWidth
  const targetGap = split?.gap
  useEffect(() => {
    fill.value = single
    if (targetLeading === undefined || targetGap === undefined) return

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

  const gapAnimatedStyle = useAnimatedStyle(() => ({
    width: fill.value ? 0 : gapSize.value,
  }))

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
              : trailingWidth !== undefined
                ? { flex: 1 }
                : { flex: leadingFraction / (1 - leadingFraction) },
          { minWidth: 0 },
          leadingStyle,
          leadingAnimatedStyle,
        ]}
      >
        {}
        <FoldHandled value={single ? handled : true}>{leading}</FoldHandled>
      </Animated.View>
      <Animated.View style={gapAnimatedStyle} />
      <View
        style={[
          { flex: 1, minWidth: 0, display: single ? 'none' : 'flex' },
          trailingStyle,
        ]}
      >
        <FoldHandled>{trailing}</FoldHandled>
      </View>
    </View>
  )
}
