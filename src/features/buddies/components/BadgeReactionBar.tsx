import { View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import type { SharedBadge } from '@/types/badges'
import {
  BADGE_REACTION_EMOJI,
  type BadgeReactionEmoji,
} from '@/features/buddies/lib/badgeReactions'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { sharedBadgeKey } from '@/features/buddies/lib/sharedBadges'
import { useSentBadgeReaction } from '@/features/buddies/stores/buddiesStore'

const SIZE = 44

/**
 * Encourage a buddy on one of their badges: the six preset reactions, with the
 * one already sent highlighted. Picking another replaces it.
 */
export default function BadgeReactionBar({
  inboxId,
  badge,
  name,
}: {
  inboxId: string
  badge: SharedBadge
  /** The buddy's name as this User sees it. */
  name: string
}) {
  const theme = useTheme()
  const sent = useSentBadgeReaction(inboxId, sharedBadgeKey(badge))

  const send = (emoji: BadgeReactionEmoji) => {
    if (emoji === sent) return
    analytics.capture('badge_reaction_sent', { emoji, level: badge.l ?? null })
    // Saved before it's sent, so the highlight moves at once, even offline.
    void buddiesEngine.reactToBadge(inboxId, badge, emoji)
  }

  return (
    <View style={{ alignItems: 'center', gap: 10 }}>
      <Text
        style={{
          fontSize: 13,
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textAlt,
        }}
      >
        {i18n.t('badges_encourage', { name })}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {BADGE_REACTION_EMOJI.map(({ id, emoji }) => (
          <ReactionButton
            key={id}
            emoji={emoji}
            selected={sent === id}
            onPress={() => send(id)}
          />
        ))}
      </View>
    </View>
  )
}

function ReactionButton({
  emoji,
  selected,
  onPress,
}: {
  emoji: string
  selected: boolean
  onPress: () => void
}) {
  const theme = useTheme()
  const reduceMotion = useReducedMotion()
  const pop = useSharedValue(1)
  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
  }))

  return (
    <Button
      onPress={() => {
        if (!reduceMotion)
          pop.value = withSequence(
            withTiming(1.3, { duration: 110 }),
            withSpring(1, { damping: 9, stiffness: 260 })
          )
        onPress()
      }}
      accessibilityRole='button'
      accessibilityState={{ selected }}
      style={{
        width: SIZE,
        height: SIZE,
        borderRadius: SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: selected
          ? theme.colors.accentTranslucent
          : theme.colors.card,
        borderWidth: 1.5,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
      }}
    >
      <Animated.View style={popStyle}>
        <Text style={{ fontSize: 21, lineHeight: 26 }}>{emoji}</Text>
      </Animated.View>
    </Button>
  )
}
