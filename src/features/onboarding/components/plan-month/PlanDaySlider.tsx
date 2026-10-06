import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useSharedValue } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import useTheme from '@/contexts/theme'
import Haptics from '@/lib/haptics'
import {
  PLAN_DAY_STEP_MINUTES,
  planDayMaxMinutes,
} from '@/features/onboarding/lib/planMonth'
import PointerStyleView from '../../../../../modules/pointer-style'

const THUMB_SIZE = 28
const TRACK_HEIGHT = 6

type Props = {
  minutes: number
  onChange: (minutes: number) => void
  accessibilityLabel: string
  /** Read out as the value, e.g. "2 hours" or "Off". */
  accessibilityValueText: string
}

/**
 * Drag or tap to set a day's plan length in half-hour steps, with a tick at
 * every hour. Each step taps a selection haptic. Key it by day: the scale is
 * set from the first value.
 */
const PlanDaySlider = ({
  minutes,
  onChange,
  accessibilityLabel,
  accessibilityValueText,
}: Props) => {
  const theme = useTheme()
  // Fixed when it opens, so the scale doesn't shift under a drag.
  const [maxMinutes] = useState(() => planDayMaxMinutes(minutes))
  const width = useSharedValue(0)
  // The last value sent, so a drag only reports step changes.
  const emitted = useSharedValue(minutes)
  useEffect(() => {
    emitted.value = minutes
  }, [emitted, minutes])

  const step = (next: number) => {
    Haptics.selection()
    onChange(next)
  }

  const moveTo = (x: number) => {
    'worklet'
    const usable = width.value - THUMB_SIZE
    if (usable <= 0) return
    const fraction = Math.min(1, Math.max(0, (x - THUMB_SIZE / 2) / usable))
    const next =
      Math.round((fraction * maxMinutes) / PLAN_DAY_STEP_MINUTES) *
      PLAN_DAY_STEP_MINUTES
    if (next === emitted.value) return
    emitted.value = next
    scheduleOnRN(step, next)
  }

  // Horizontal only, so the screen still scrolls vertically over the slider.
  const pan = Gesture.Pan()
    .activeOffsetX([-4, 4])
    .failOffsetY([-12, 12])
    .onStart(({ x }) => moveTo(x))
    .onUpdate(({ x }) => moveTo(x))
  const tap = Gesture.Tap().onEnd(({ x }) => moveTo(x))

  const fraction = maxMinutes > 0 ? Math.min(1, minutes / maxMinutes) : 0
  const hours = Math.floor(maxMinutes / 60)

  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <View
        accessible
        accessibilityRole='adjustable'
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ text: accessibilityValueText }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={({ nativeEvent: { actionName } }) => {
          const delta =
            actionName === 'increment'
              ? PLAN_DAY_STEP_MINUTES
              : actionName === 'decrement'
                ? -PLAN_DAY_STEP_MINUTES
                : 0
          const next = Math.min(maxMinutes, Math.max(0, minutes + delta))
          if (next !== minutes) step(next)
        }}
        onLayout={(event) => {
          width.value = event.nativeEvent.layout.width
        }}
        style={{ height: 44, justifyContent: 'center' }}
      >
        {/* iPad pointer shows the slider moves sideways. */}
        <PointerStyleView
          accessories={['left', 'right']}
          style={StyleSheet.absoluteFill}
        />
        <View
          pointerEvents='none'
          style={{
            marginHorizontal: THUMB_SIZE / 2,
            height: TRACK_HEIGHT,
            borderRadius: TRACK_HEIGHT / 2,
            backgroundColor: theme.colors.backgroundLighter,
          }}
        >
          <View
            style={{
              width: `${fraction * 100}%`,
              height: '100%',
              borderRadius: TRACK_HEIGHT / 2,
              backgroundColor: theme.colors.accent,
            }}
          />
          {Array.from({ length: Math.max(0, hours - 1) }, (_, i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: `${(((i + 1) * 60) / maxMinutes) * 100}%`,
                top: TRACK_HEIGHT / 2 - 1.5,
                width: 3,
                height: 3,
                marginLeft: -1.5,
                borderRadius: 1.5,
                backgroundColor: theme.colors.textAlt,
                opacity: 0.5,
              }}
            />
          ))}
          <View
            style={{
              position: 'absolute',
              left: `${fraction * 100}%`,
              top: TRACK_HEIGHT / 2 - THUMB_SIZE / 2,
              marginLeft: -THUMB_SIZE / 2,
              width: THUMB_SIZE,
              height: THUMB_SIZE,
              borderRadius: THUMB_SIZE / 2,
              backgroundColor: theme.colors.accent,
              borderWidth: 3,
              borderColor: theme.colors.card,
              shadowColor: theme.colors.shadow,
              shadowOpacity: 0.25,
              shadowRadius: 3,
              shadowOffset: { width: 0, height: 1 },
              elevation: 2,
            }}
          />
        </View>
      </View>
    </GestureDetector>
  )
}

export default PlanDaySlider
