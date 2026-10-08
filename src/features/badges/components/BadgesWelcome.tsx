import { useEffect, useRef } from 'react'
import {
  AccessibilityInfo,
  Dimensions,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import FullWindowOverlay from '@/components/ui/FullWindowOverlay'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import BadgeHistoryCluster from '@/features/badges/components/BadgeHistoryCluster'
import useBadgeSurface from '@/features/badges/hooks/useBadgeSurface'
import { badgeKey, compareBadgeKeysForAnnouncement } from '@/lib/badges/catalog'
import { earnedBadgeCount, highestEarned } from '@/lib/badges/display'
import Haptics from '@/lib/haptics'
import i18n, { TranslationKey } from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import { Confetti, type ConfettiHandle } from '@/vendor/ConfettiSkia'

export type BadgesWelcomeAction = 'look' | 'later'

const CONFETTI_DELAY_MS = 520

/**
 * Once per device, for someone whose records already reached badges before they
 * ever saw one: their best medallions fanned out, how many they have, and that
 * badges count months. "Take a look" leads to their profile, where badges sit
 * at the top. Still and confetti-free under Reduce Motion.
 */
export default function BadgesWelcome({
  onClose,
}: {
  /** The screen has faded out. */
  onClose: (action: BadgesWelcomeAction) => void
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const { surface } = useBadgeSurface()
  const reduceMotion = useReducedMotion()
  const confetti = useRef<ConfettiHandle>(null)
  const closing = useRef(false)
  const appear = useSharedValue(reduceMotion ? 1 : 0)
  const earned = usePreferences((s) => s.earnedBadges)
  const count = earnedBadgeCount(earned)
  // The rarest first, so the hand leads with what took longest.
  const best = highestEarned(earned).sort((a, b) =>
    compareBadgeKeysForAnnouncement(
      badgeKey(a.art, a.level),
      badgeKey(b.art, b.level)
    )
  )
  const title = i18n.t('badges_welcomeTitle')
  const countLine = i18n.t('badges_welcomeCount' as TranslationKey, { count })
  const announcement = `${title}. ${countLine}`
  // Five fanned coins span 272pt at scale 1; keep a margin on narrow screens.
  const scale = Math.min(height < 700 ? 1.2 : 1.45, (width - 48) / 272)

  // Plays once: every dependency is a primitive fixed for this screen.
  useEffect(() => {
    Haptics.success().catch(() => {})
    AccessibilityInfo.announceForAccessibility(announcement)
    if (reduceMotion) return
    appear.value = withTiming(1, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
    })
    const timer = setTimeout(() => {
      const window = Dimensions.get('window')
      confetti.current?.trigger({
        position: { x: window.width / 2, y: window.height * 0.28 },
        count: 36,
        velocity: 210,
        fade: true,
      })
    }, CONFETTI_DELAY_MS)
    return () => clearTimeout(timer)
  }, [announcement, appear, reduceMotion])

  const close = (action: BadgesWelcomeAction) => {
    if (closing.current) return
    closing.current = true
    if (reduceMotion) {
      onClose(action)
      return
    }
    appear.value = withTiming(
      0,
      { duration: 200, easing: Easing.in(Easing.quad) },
      // Closes even when the fade is interrupted, so it can't get stuck.
      () => scheduleOnRN(onClose, action)
    )
  }

  const backdropStyle = useAnimatedStyle(() => ({ opacity: appear.value }))
  const contentStyle = useAnimatedStyle(() => ({
    opacity: appear.value,
    transform: [{ translateY: (1 - appear.value) * 16 }],
  }))

  return (
    <FullWindowOverlay open onClose={() => close('later')}>
      <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: surface },
            backdropStyle,
          ]}
        />
        <Animated.View
          style={[
            {
              flex: 1,
              paddingTop: insets.top + 24,
              paddingBottom: insets.bottom + 16,
              paddingHorizontal: 28,
            },
            contentStyle,
          ]}
        >
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 32,
            }}
          >
            <BadgeHistoryCluster badges={best} scale={scale} />
            <View style={{ alignItems: 'center', gap: 10, maxWidth: 360 }}>
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.accent,
                  textTransform: 'uppercase',
                  letterSpacing: 1.2,
                }}
              >
                {i18n.t('badges_title')}
              </Text>
              <Text
                accessibilityRole='header'
                style={{
                  fontSize: 30,
                  lineHeight: 36,
                  fontFamily: theme.fonts.bold,
                  color: theme.colors.text,
                  textAlign: 'center',
                }}
              >
                {title}
              </Text>
              <Text
                style={{
                  fontSize: 18,
                  lineHeight: 24,
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.text,
                  textAlign: 'center',
                }}
              >
                {countLine}
              </Text>
            </View>
          </View>
          <View
            style={{
              alignSelf: 'center',
              width: '100%',
              maxWidth: 400,
              gap: 4,
            }}
          >
            <ActionButton
              noTransform
              accessibilityRole='button'
              onPress={() => close('look')}
            >
              {i18n.t('badges_welcomeLook')}
            </ActionButton>
            <Button
              noTransform
              accessibilityRole='button'
              onPress={() => close('later')}
              style={{ alignItems: 'center', paddingVertical: 12 }}
            >
              <Text
                style={{
                  fontSize: 15,
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.textAlt,
                }}
              >
                {i18n.t('badges_welcomeLater')}
              </Text>
            </Button>
          </View>
        </Animated.View>
        <Confetti ref={confetti} />
      </View>
    </FullWindowOverlay>
  )
}
