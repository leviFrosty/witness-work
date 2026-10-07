import { useEffect, useRef } from 'react'
import {
  AccessibilityInfo,
  Dimensions,
  Pressable,
  StyleSheet,
  View,
} from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import BadgeMedallion from '@/components/badges/BadgeMedallion'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import FullWindowOverlay from '@/components/ui/FullWindowOverlay'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import BadgeHistoryCluster from '@/features/badges/components/BadgeHistoryCluster'
import BadgeSpotlight from '@/features/badges/components/BadgeSpotlight'
import { parseBadgeKey } from '@/lib/badges/catalog'
import {
  badgeDescription,
  badgeTitle,
  profileBadges,
} from '@/lib/badges/display'
import Haptics from '@/lib/haptics'
import i18n, { TranslationKey } from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import type { BadgeKey } from '@/types/badges'
import { Confetti, type ConfettiHandle } from '@/vendor/ConfettiSkia'

export type BadgeCelebrationContent =
  | { kind: 'live'; keys: BadgeKey[] }
  | { kind: 'history'; count: number }

export type BadgeCelebrationAction = 'done' | 'see_all'

const LEAD_SIZE = 132
const OTHERS_SIZE = 30
const MAX_OTHERS = 4
const CONFETTI_DELAY_MS = 380

/**
 * The moment a badge arrives: a dimmed backdrop, the medallion springing in
 * with a sweep of light, a success haptic, and confetti (a full burst for Gold,
 * Pearl, and moments; a small one otherwise). Several new badges show the most
 * notable large and the rest in a row beneath. The history summary fans out up
 * to five of the badges the User's records already reached. Still and
 * confetti-free under Reduce Motion.
 */
export default function BadgeCelebration({
  content,
  onClose,
}: {
  content: BadgeCelebrationContent
  /** The overlay has faded out. */
  onClose: (action: BadgeCelebrationAction) => void
}) {
  const theme = useTheme()
  const reduceMotion = useReducedMotion()
  const confetti = useRef<ConfettiHandle>(null)
  const earned = usePreferences((s) => s.earnedBadges)
  const appear = useSharedValue(reduceMotion ? 1 : 0)
  const closing = useRef(false)

  const live =
    content.kind === 'live'
      ? content.keys.flatMap((key) => {
          const parsed = parseBadgeKey(key)
          return parsed ? [parsed] : []
        })
      : []
  const lead = live[0]
  const others = live.slice(1)
  const title =
    content.kind === 'live'
      ? i18n.t('badges_newBadge')
      : i18n.t('badges_historyTitle' as TranslationKey, {
          count: content.count,
        })
  const big = !lead || lead.level === null || lead.level >= 3
  const announcement = lead
    ? `${title}. ${badgeTitle(lead.art, lead.level)}. ${i18n.t('badges_addedToCollection')}`
    : title

  // Plays once: every dependency is a primitive fixed for this content.
  useEffect(() => {
    Haptics.success().catch(() => {})
    AccessibilityInfo.announceForAccessibility(announcement)
    if (reduceMotion) return
    appear.value = withTiming(1, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
    })
    const timer = setTimeout(() => {
      const { width, height } = Dimensions.get('window')
      const spots = big
        ? [
            { x: 0.24, y: 0.3, count: 30 },
            { x: 0.76, y: 0.3, count: 30 },
            { x: 0.5, y: 0.2, count: 24 },
          ]
        : [{ x: 0.5, y: 0.26, count: 16 }]
      spots.forEach((spot) =>
        confetti.current?.trigger({
          position: { x: width * spot.x, y: height * spot.y },
          count: spot.count,
          velocity: big ? 230 : 170,
          fade: true,
        })
      )
    }, CONFETTI_DELAY_MS)
    return () => clearTimeout(timer)
  }, [announcement, appear, big, reduceMotion])

  const close = (action: BadgeCelebrationAction) => {
    if (closing.current) return
    closing.current = true
    if (reduceMotion) {
      onClose(action)
      return
    }
    appear.value = withTiming(
      0,
      { duration: 180, easing: Easing.in(Easing.quad) },
      // Closes even when the fade is interrupted, so the card can't get stuck.
      () => scheduleOnRN(onClose, action)
    )
  }

  const backdropStyle = useAnimatedStyle(() => ({ opacity: appear.value }))
  const cardStyle = useAnimatedStyle(() => ({
    opacity: appear.value,
    transform: [
      { translateY: (1 - appear.value) * 18 },
      { scale: 0.96 + 0.04 * appear.value },
    ],
  }))

  const primary =
    content.kind === 'live'
      ? { label: i18n.t('done'), action: 'done' as const }
      : { label: i18n.t('badges_seeBadges'), action: 'see_all' as const }
  const secondary =
    content.kind === 'live'
      ? { label: i18n.t('badges_seeAllBadges'), action: 'see_all' as const }
      : { label: i18n.t('done'), action: 'done' as const }

  return (
    <FullWindowOverlay open onClose={() => close('done')}>
      <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: 'rgba(0, 0, 0, 0.6)' },
            backdropStyle,
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => close('done')}
            accessible={false}
            importantForAccessibility='no'
          />
        </Animated.View>
        <View
          pointerEvents='box-none'
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <Animated.View
            style={[
              {
                width: '100%',
                maxWidth: 360,
                alignItems: 'center',
                gap: 14,
                paddingTop: 28,
                paddingHorizontal: 24,
                paddingBottom: 20,
                borderRadius: 28,
                borderCurve: 'continuous',
                backgroundColor: theme.colors.card,
                shadowColor: '#000',
                shadowOpacity: 0.25,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 10 },
                elevation: 12,
              },
              cardStyle,
            ]}
          >
            {lead ? (
              <BadgeSpotlight
                art={lead.art}
                level={lead.level}
                size={LEAD_SIZE}
                entrance='spring'
                delay={120}
              />
            ) : (
              <BadgeHistoryCluster badges={profileBadges(earned)} />
            )}
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.accent,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                {lead ? title : i18n.t('badges_title')}
              </Text>
              <Text
                accessibilityRole='header'
                style={{
                  fontSize: 21,
                  lineHeight: 27,
                  fontFamily: theme.fonts.bold,
                  color: theme.colors.text,
                  textAlign: 'center',
                }}
              >
                {lead ? badgeTitle(lead.art, lead.level) : title}
              </Text>
              {lead ? (
                <Text
                  style={{
                    fontSize: 14,
                    color: theme.colors.textAlt,
                    textAlign: 'center',
                  }}
                >
                  {badgeDescription(lead.art, lead.level)}
                </Text>
              ) : null}
            </View>
            {others.length > 0 ? (
              <View
                accessible
                accessibilityLabel={i18n.t('badges_andMore' as TranslationKey, {
                  count: others.length,
                })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                {others.slice(0, MAX_OTHERS).map((badge) => (
                  <BadgeMedallion
                    key={`${badge.art}.${badge.level ?? 0}`}
                    art={badge.art}
                    level={badge.level}
                    size={OTHERS_SIZE}
                  />
                ))}
                <Text
                  style={{
                    marginLeft: 2,
                    fontSize: 13,
                    fontFamily: theme.fonts.medium,
                    color: theme.colors.textAlt,
                  }}
                >
                  {i18n.t('badges_andMore' as TranslationKey, {
                    count: others.length,
                  })}
                </Text>
              </View>
            ) : null}
            <View style={{ alignSelf: 'stretch', gap: 4, marginTop: 6 }}>
              <ActionButton noTransform onPress={() => close(primary.action)}>
                {primary.label}
              </ActionButton>
              <Button
                noTransform
                onPress={() => close(secondary.action)}
                style={{ alignItems: 'center', paddingVertical: 12 }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontFamily: theme.fonts.semiBold,
                    color: theme.colors.textAlt,
                  }}
                >
                  {secondary.label}
                </Text>
              </Button>
            </View>
          </Animated.View>
        </View>
        <Confetti ref={confetti} />
      </View>
    </FullWindowOverlay>
  )
}
