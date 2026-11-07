import { type ReactNode, useEffect, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import useTheme from '@/contexts/theme'
import type { SettingsSearchItemId } from '@/features/settings/lib/settingsSearch'
import useSettingsSearchTarget, {
  isSettingsSearchTargetFresh,
} from '@/features/settings/stores/settingsSearchTarget'
import { useSettingsScroll } from '@/features/settings/components/shared/SettingsScrollView'

const REVEAL_DELAY_MS = 400

export default function SettingsSearchTarget({
  id,
  borderRadius,
  children,
}: {
  id: SettingsSearchItemId
  borderRadius?: number
  children: ReactNode
}) {
  const theme = useTheme()
  const scroll = useSettingsScroll()
  const reducedMotion = useReducedMotion()
  const rowRef = useRef<View>(null)
  const clear = useSettingsSearchTarget((state) => state.clear)
  const requestedAt = useSettingsSearchTarget((state) =>
    state.target?.id === id && isSettingsSearchTargetFresh(state.target)
      ? state.target.requestedAt
      : null
  )
  const highlight = useSharedValue(0)

  useEffect(() => {
    if (requestedAt === null) return
    const timer = setTimeout(() => {
      clear(requestedAt)
      if (rowRef.current) scroll?.reveal(rowRef.current, !reducedMotion)
      highlight.value = withSequence(
        withTiming(1, { duration: reducedMotion ? 0 : 200 }),
        withDelay(1200, withTiming(0, { duration: reducedMotion ? 0 : 600 }))
      )
    }, REVEAL_DELAY_MS)
    return () => clearTimeout(timer)
  }, [requestedAt, clear, scroll, reducedMotion, highlight])

  const highlightStyle = useAnimatedStyle(() => ({
    opacity: highlight.value,
  }))

  return (
    <View ref={rowRef} collapsable={false}>
      {children}
      <Animated.View
        pointerEvents='none'
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: theme.colors.accentTranslucent, borderRadius },
          highlightStyle,
        ]}
      />
    </View>
  )
}
