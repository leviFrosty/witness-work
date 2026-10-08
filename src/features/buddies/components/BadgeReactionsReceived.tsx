import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'
import { badgeReactionEmoji } from '@/features/buddies/lib/badgeReactions'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { useBadgeReactions } from '@/features/buddies/stores/buddiesStore'

const MAX_SHOWN = 8
const AVATAR = 34
const BUBBLE = 20

/**
 * Buddies' reactions to one of the User's badges: each buddy's avatar wearing
 * the emoji they picked, newest first, up to eight and then "+N". Nothing shows
 * until someone reacts.
 */
export default function BadgeReactionsReceived({
  badgeKey,
}: {
  badgeKey: string
}) {
  const theme = useTheme()
  const reactions = useBadgeReactions(badgeKey)
  if (reactions.length === 0) return null
  const shown = reactions.slice(0, MAX_SHOWN)
  const more = reactions.length - shown.length

  return (
    <View style={{ alignItems: 'center', gap: 10 }}>
      <Text
        style={{
          fontSize: 13,
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textAlt,
        }}
      >
        {i18n.t('badges_reactionsReceived')}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 10,
        }}
      >
        {shown.map(({ inboxId, buddy, e }) => {
          const name = buddyDisplayName(buddy)
          const emoji = badgeReactionEmoji(e)
          return (
            <View
              key={inboxId}
              accessible
              accessibilityLabel={i18n.t('badges_reactionFrom', {
                name,
                emoji,
              })}
              style={{ width: AVATAR + 4, height: AVATAR + 4 }}
            >
              <BuddyAvatar
                avatar={buddy.avatar}
                name={name}
                color={buddy}
                size={AVATAR}
              />
              <View
                style={{
                  position: 'absolute',
                  right: -2,
                  bottom: -2,
                  width: BUBBLE,
                  height: BUBBLE,
                  borderRadius: BUBBLE / 2,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.card,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Text style={{ fontSize: 12, lineHeight: 15 }}>{emoji}</Text>
              </View>
            </View>
          )
        })}
        {more > 0 ? (
          <Text
            style={{
              fontSize: 13,
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('badges_moreCount', { count: more })}
          </Text>
        ) : null}
      </View>
    </View>
  )
}
