import { type ReactNode, useEffect, useRef } from 'react'
import { Pressable, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import StreakBadge from '@/components/StreakBadge'
import Popover, { type PopoverControls } from '@/components/ui/Popover'
import PointerTooltip from '@/components/ui/PointerTooltip'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useNow from '@/hooks/useNow'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import {
  shownStreak,
  streakEndsSoon,
  type ServiceStreak,
} from '@/lib/serviceStreak'
import { usePreferences } from '@/stores/preferences'
import StreakDetails from '@/features/profile/components/StreakDetails'
import { useStreakCelebration } from '@/features/profile/stores/streakCelebration'

const MINUTE = 60_000

function timeLeft(at: Date, now: number): string {
  const minutes = Math.max(1, Math.floor((at.getTime() - now) / MINUTE))
  const days = Math.floor(minutes / (24 * 60))
  const hours = Math.floor((minutes % (24 * 60)) / 60)
  if (days > 0) return i18n.t('countdownDaysHours', { days, hours })
  if (hours > 0)
    return i18n.t('countdownHoursMinutes', { hours, minutes: minutes % 60 })
  return i18n.t('countdownMinutes', { minutes })
}

export default function HomeStreakChip({
  streak,
  buddyStreaks,
}: {
  streak: ServiceStreak

  buddyStreaks?: (controls: Pick<PopoverControls, 'closeThen'>) => ReactNode
}) {
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const { now } = useNow()
  const grewAt = useStreakCelebration((state) => state.grewAt)
  const showStreaks = usePreferences((state) => state.showStreaks)
  const flare = useSharedValue(1)
  const mountedAt = useRef(Date.now())

  useEffect(() => {
    if (grewAt <= mountedAt.current) return
    flare.value = withSequence(
      withTiming(1.3, { duration: 160 }),
      withSpring(1, { damping: 7, stiffness: 180 })
    )
  }, [grewAt, flare])
  const flareStyle = useAnimatedStyle(() => ({
    transform: [{ scale: flare.value }],
  }))

  const count = shownStreak(streak)
  if (!showStreaks || count === 0) return null
  const ending = streakEndsSoon(streak, new Date(now)) ? streak.due : null
  const endsIn = ending ? timeLeft(ending.endsAt, now) : undefined

  return (
    <Popover
      contentWidth={Math.min(280, width - insets.left - insets.right - 24)}
      contentStyle={{ padding: 16, gap: 12 }}
      renderTrigger={({ onPress, expanded }) => (
        <PointerTooltip label={i18n.t('streak_title')}>
          <Pressable
            onPress={() => {
              analytics.capture('streak_details_opened', {
                kind: streak.kind,
                ending: ending !== null,
              })
              onPress()
            }}
            accessibilityRole='button'
            accessibilityState={{ expanded }}
            style={({ pressed }) => ({
              minWidth: MIN_TOUCH_TARGET,
              minHeight: MIN_TOUCH_TARGET,
              marginVertical: -10,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Animated.View style={flareStyle}>
              <StreakBadge count={count} endsIn={endsIn} />
            </Animated.View>
          </Pressable>
        </PointerTooltip>
      )}
    >
      {({ closeThen }) => (
        <StreakDetails
          streak={streak}
          count={count}
          ending={ending}
          closeThen={closeThen}
          footer={buddyStreaks?.({ closeThen })}
        />
      )}
    </Popover>
  )
}
