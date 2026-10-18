import { StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { type SharedValue, useSharedValue } from 'react-native-reanimated'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import PointerStyleView from '../../../../modules/pointer-style'

/** How far a screen reader's swipe up or down resizes the map. */
const STEP = 80

/**
 * The grabber between the map and the timeline on narrow screens: drag it to
 * give the map or the timeline more room. Resizes on the UI thread.
 */
export default function RouteSplitHandle({
  height,
  min,
  max,
}: {
  /** The map's height. */
  height: SharedValue<number>
  min: number
  max: number
}) {
  const theme = useTheme()
  const start = useSharedValue(0)
  const clamp = (value: number) => {
    'worklet'
    return Math.max(min, Math.min(max, value))
  }

  const pan = Gesture.Pan()
    .minDistance(2)
    .onBegin(() => {
      start.value = height.value
    })
    .onUpdate((e) => {
      height.value = clamp(start.value + e.translationY)
    })

  return (
    <GestureDetector gesture={pan}>
      <View
        accessible
        accessibilityRole='adjustable'
        accessibilityLabel={i18n.t('routeBuilder_mapSize')}
        accessibilityHint={i18n.t('routeBuilder_mapSizeHint')}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          const by = e.nativeEvent.actionName === 'increment' ? STEP : -STEP
          height.value = clamp(height.value + by)
        }}
        hitSlop={{ top: 8, bottom: 8 }}
        style={{
          height: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.background,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.colors.border,
        }}
      >
        {/* The iPad pointer shows the divider moves up and down. */}
        <PointerStyleView
          accessories={['up', 'down']}
          style={StyleSheet.absoluteFill}
        />
        <View
          pointerEvents='none'
          style={{
            width: 36,
            height: 5,
            borderRadius: 3,
            backgroundColor: theme.colors.textAlt,
            opacity: 0.5,
          }}
        />
      </View>
    </GestureDetector>
  )
}
