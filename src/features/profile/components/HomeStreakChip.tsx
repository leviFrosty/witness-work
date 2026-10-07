import { useEffect, useRef } from 'react'
import { Pressable, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import moment from 'moment'
import { ChevronRight as ChevronRightIcon } from 'lucide-react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import StreakBadge from '@/components/StreakBadge'
import AnchoredPopover from '@/components/ui/AnchoredPopover'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PointerTooltip from '@/components/ui/PointerTooltip'
import useTheme from '@/contexts/theme'
import useNow from '@/hooks/useNow'
import useServiceStreak from '@/hooks/useServiceStreak'
import { formatWeekdayMonthDayCompact } from '@/lib/dates'
import i18n from '@/lib/locales'
import { shownStreak, streakEndsSoon } from '@/lib/serviceStreak'
import { logPlannedDayParams } from '@/lib/unloggedDayReminders'
import useServiceReport from '@/stores/serviceReport'
import type { RootStackNavigation } from '@/types/rootStack'
import { useStreakCelebration } from '@/features/profile/stores/streakCelebration'

const MINUTE = 60_000

/** "5h 12m", "3d 4h", or "8m" until `at`. */
function timeLeft(at: Date, now: number): string {
  const minutes = Math.max(1, Math.floor((at.getTime() - now) / MINUTE))
  const days = Math.floor(minutes / (24 * 60))
  const hours = Math.floor((minutes % (24 * 60)) / 60)
  if (days > 0) return i18n.t('countdownDaysHours', { days, hours })
  if (hours > 0)
    return i18n.t('countdownHoursMinutes', { hours, minutes: minutes % 60 })
  return i18n.t('countdownMinutes', { minutes })
}

/**
 * The Service Streak in Home's header, once it's long enough to show. When it's
 * about to end, a countdown shows how long is left to keep it. Tapping it
 * offers to log the day or month that's due, and links to the streak FAQ.
 */
export default function HomeStreakChip() {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const focusRef = useRef<View>(null)
  const streak = useServiceStreak()
  const { now } = useNow()
  const grewAt = useStreakCelebration((state) => state.grewAt)
  const flare = useSharedValue(1)
  const mountedAt = useRef(Date.now())

  // Flares when the streak grows short of a milestone.
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
  if (count === 0) return null
  const ending = streakEndsSoon(streak, new Date(now)) ? streak.due : null
  const endsIn = ending ? timeLeft(ending.endsAt, now) : undefined
  const period = ending ? moment(ending.period, 'YYYY-MM-DD') : null

  const keepIt = () => {
    if (!ending) return
    if (streak.kind === 'months') {
      navigation.navigate('ServiceHistory', { source: 'streak' })
      return
    }
    const { dayPlans, recurringPlans, serviceReports } =
      useServiceReport.getState()
    navigation.navigate(
      'Add Time',
      logPlannedDayParams(ending.period, {
        dayPlans,
        recurringPlans,
        timeEntries: serviceReports,
      })
    )
  }

  const openFaq = () =>
    navigation.navigate('FAQ', { scrollToCategory: 'streaks' })

  const helper =
    ending && period
      ? streak.kind === 'months'
        ? i18n.t('streak_endingMonths', { month: period.format('MMMM') })
        : i18n.t('streak_endingPlans', {
            date: formatWeekdayMonthDayCompact(period),
          })
      : null

  return (
    <AnchoredPopover
      contentWidth={Math.min(
        helper ? 280 : 200,
        width - insets.left - insets.right - 24
      )}
      accessibilityFocusRef={focusRef}
      contentStyle={{ gap: 12 }}
      renderTrigger={({ onPress, anchorRef, expanded }) => (
        <PointerTooltip label={i18n.t('streak_title')}>
          <Pressable
            ref={anchorRef}
            collapsable={false}
            onPress={onPress}
            hitSlop={10}
            accessibilityRole='button'
            accessibilityState={{ expanded }}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Animated.View style={flareStyle}>
              <StreakBadge count={count} endsIn={endsIn} />
            </Animated.View>
          </Pressable>
        </PointerTooltip>
      )}
    >
      {({ closeThen }) => (
        <>
          {helper && (
            <View ref={focusRef} accessible>
              <Text
                style={{
                  fontSize: theme.fontSize('sm'),
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {helper}
              </Text>
            </View>
          )}
          <View
            ref={helper ? undefined : focusRef}
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            {helper && (
              <Button
                onPress={() => closeThen(keepIt)}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: theme.numbers.borderRadiusSm,
                  backgroundColor: theme.colors.accent,
                }}
              >
                <Text
                  style={{
                    fontFamily: theme.fonts.semiBold,
                    color: theme.colors.textInverse,
                  }}
                >
                  {i18n.t(
                    streak.kind === 'months' ? 'streak_recordMonth' : 'addTime'
                  )}
                </Text>
              </Button>
            )}
            <Button
              onPress={() => closeThen(openFaq)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingVertical: 4,
              }}
            >
              <Text
                style={{
                  fontSize: theme.fontSize('sm'),
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.accent,
                }}
              >
                {i18n.t('streak_howItWorks')}
              </Text>
              <LucideIcon
                icon={ChevronRightIcon}
                size={12}
                color={theme.colors.accent}
              />
            </Button>
          </View>
        </>
      )}
    </AnchoredPopover>
  )
}
