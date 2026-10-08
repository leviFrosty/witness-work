import { useState } from 'react'
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
  badgeReactionEmoji,
  type BadgeReactionEmoji,
} from '@/features/buddies/lib/badgeReactions'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { sharedBadgeKey } from '@/features/buddies/lib/sharedBadges'
import { useSentBadgeReaction } from '@/features/buddies/stores/buddiesStore'

/**
 * Where the bar sits, which is also `badge_reaction_sent`'s `source`: the badge
 * view (large, under "Encourage <name>") or a bell row (compact).
 */
export type BadgeReactionPlacement = 'badge_view' | 'bell'

const SIZE: Record<BadgeReactionPlacement, number> = {
  badge_view: 44,
  bell: 32,
}

/**
 * Encourage a buddy on one of their badges: the six preset reactions, with the
 * one already sent highlighted. Picking another replaces it. In a bell row, a
 * reaction sent before the row showed folds into "You sent 🎉", which opens the
 * choices again.
 */
export default function BadgeReactionBar({
  inboxId,
  badge,
  name,
  placement = 'badge_view',
}: {
  inboxId: string
  badge: SharedBadge
  /** The buddy's name as this User sees it. */
  name: string
  placement?: BadgeReactionPlacement
}) {
  const theme = useTheme()
  const sent = useSentBadgeReaction(inboxId, sharedBadgeKey(badge))
  const compact = placement === 'bell'
  const [open, setOpen] = useState(!compact || sent === null)

  const send = (emoji: BadgeReactionEmoji) => {
    if (emoji === sent) return
    analytics.capture('badge_reaction_sent', {
      emoji,
      level: badge.l ?? null,
      source: placement,
    })
    // Saved before it's sent, so the highlight moves at once, even offline.
    void buddiesEngine.reactToBadge(inboxId, badge, emoji)
  }

  if (!open && sent) {
    const label = i18n.t('badges_reactionSent', {
      emoji: badgeReactionEmoji(sent),
    })
    return (
      <Button
        noTransform
        onPress={() => setOpen(true)}
        accessibilityRole='button'
        accessibilityLabel={`${label}. ${i18n.t('badges_reactionChange')}`}
        style={{
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingVertical: 4,
        }}
      >
        <Text style={{ color: theme.colors.textAlt }}>{label}</Text>
        <Text
          style={{
            color: theme.colors.accent,
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('badges_reactionChange')}
        </Text>
      </Button>
    )
  }

  const choices = (
    <View style={{ flexDirection: 'row', gap: compact ? 6 : 8 }}>
      {BADGE_REACTION_EMOJI.map(({ id, emoji }) => (
        <ReactionButton
          key={id}
          emoji={emoji}
          size={SIZE[placement]}
          selected={sent === id}
          hint={compact ? i18n.t('badges_encourage', { name }) : undefined}
          onPress={() => send(id)}
        />
      ))}
    </View>
  )
  if (compact) return choices

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
      {choices}
    </View>
  )
}

function ReactionButton({
  emoji,
  size,
  selected,
  hint,
  onPress,
}: {
  emoji: string
  size: number
  selected: boolean
  /** Says what a choice does where no label shows it. */
  hint?: string
  onPress: () => void
}) {
  const theme = useTheme()
  const reduceMotion = useReducedMotion()
  const pop = useSharedValue(1)
  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
  }))
  const fontSize = Math.round(size * 0.48)

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
      accessibilityHint={hint}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
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
        <Text style={{ fontSize, lineHeight: Math.round(fontSize * 1.24) }}>
          {emoji}
        </Text>
      </Animated.View>
    </Button>
  )
}
