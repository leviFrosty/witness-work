import { useEffect } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { faGift } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import useTheme from '../../../contexts/theme'
import { usePreferences } from '../../../stores/preferences'
import { useMilestoneRevealStore } from '../stores/milestoneReveal'
import Haptics from '../../../lib/haptics'

/**
 * Top-right "shaking present" affordance — surfaces only after the user has
 * dismissed The Milestone Update grand reveal without entering the showcase.
 * Tapping it re-requests the reveal so the user can replay the moment they
 * missed.
 *
 * Visibility is purely preference-driven (`dismissedMilestoneRevealOnce` AND
 * NOT `seenMilestoneUpdateReveal`); we don't gate on `lastAppVersion` because
 * that flag is bumped to current the moment the reveal first triggers, and we
 * still want the recovery affordance available afterwards.
 */
const MilestoneRevealRecoveryIcon = () => {
  const theme = useTheme()
  const { dismissedMilestoneRevealOnce, seenMilestoneUpdateReveal, set } =
    usePreferences()
  const requestReveal = useMilestoneRevealStore((s) => s.request)

  const visible = dismissedMilestoneRevealOnce && !seenMilestoneUpdateReveal

  const wobble = useSharedValue(0)
  const halo = useSharedValue(0)

  useEffect(() => {
    if (!visible) return

    // Looped wobble: short shake, long pause. ~10s period feels alive without
    // becoming distracting on a screen the user spends real time on.
    wobble.value = withRepeat(
      withSequence(
        withTiming(-1, { duration: 80, easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: 90 }),
        withTiming(-0.7, { duration: 80 }),
        withTiming(0.7, { duration: 80 }),
        withTiming(0, { duration: 90 }),
        withDelay(8200, withTiming(0, { duration: 0 }))
      ),
      -1,
      false
    )

    halo.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.cubic) }),
      -1,
      true
    )

    return () => {
      cancelAnimation(wobble)
      cancelAnimation(halo)
    }
  }, [visible, wobble, halo])

  const wobbleStyle = useAnimatedStyle(() => ({
    transform: [{ rotateZ: `${wobble.value * 12}deg` }],
  }))

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.15 + halo.value * 0.35,
    transform: [{ scale: 0.85 + halo.value * 0.3 }],
  }))

  if (!visible) return null

  const handlePress = () => {
    // Light tap on the way in — the heavy haptics fire as part of the reveal
    // sequence itself once the overlay re-mounts.
    Haptics.light().catch(() => {})
    // Clear the dismissal flag so a second skip doesn't paint over the reveal
    // logic (the grand reveal can still set it again on its own dismiss path).
    set({ dismissedMilestoneRevealOnce: false })
    requestReveal()
  }

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      style={({ pressed }) => [styles.container, pressed && { opacity: 0.7 }]}
    >
      <Animated.View
        style={[
          styles.halo,
          { backgroundColor: theme.colors.accent },
          haloStyle,
        ]}
      />
      <Animated.View style={wobbleStyle}>
        <View
          style={[
            styles.button,
            {
              backgroundColor: theme.colors.accent,
              shadowColor: theme.colors.accent,
            },
          ]}
        >
          <FontAwesomeIcon
            icon={faGift}
            size={16}
            color={theme.colors.textInverse}
          />
        </View>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  button: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
})

export default MilestoneRevealRecoveryIcon
