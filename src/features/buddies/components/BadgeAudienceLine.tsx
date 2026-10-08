import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import type { BadgeKey } from '@/types/badges'
import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

const AVATAR = 22
const MAX_AVATARS = 3

/**
 * Under the User's own new badge: who will see it, "Ben and Grace will see it"
 * beside their stacked avatars ("Your buddies will see it" for three or more).
 * Only while badges are shared with active buddies, and nothing otherwise:
 * never a nudge to add buddies. First Bible Study stays home in data protection
 * mode, so it names no one then.
 */
export default function BadgeAudienceLine({ badge }: { badge: BadgeKey }) {
  const theme = useTheme()
  const enabled = useBuddiesEnabled()
  const started = useBuddies((s) => s.registeredInboxId !== null)
  const sharing = useBuddies((s) => s.sharing.badges)
  const buddies = useBuddies((s) => s.buddies)
  const staysHome = usePreferences(
    (s) => s.dataProtectionMode && badge === 'firstBibleStudy'
  )
  const audience = buddies.filter((b) => b.status === 'active')
  if (!enabled || !started || !sharing || staysHome || audience.length === 0)
    return null

  const names = audience.map(buddyDisplayName)
  const label =
    names.length === 1
      ? i18n.t('badges_audienceOne', { name: names[0] })
      : names.length === 2
        ? i18n.t('badges_audienceTwo', { first: names[0], second: names[1] })
        : i18n.t('badges_audienceMany')

  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
    >
      <View style={{ flexDirection: 'row' }}>
        {audience.slice(0, MAX_AVATARS).map((buddy, index) => (
          <View
            key={buddy.inboxId}
            style={{
              marginLeft: index === 0 ? 0 : -7,
              borderRadius: AVATAR / 2 + 1.5,
              borderWidth: 1.5,
              borderColor: theme.colors.card,
            }}
          >
            <BuddyAvatar
              avatar={buddy.avatar}
              name={buddyDisplayName(buddy)}
              color={buddy}
              size={AVATAR}
            />
          </View>
        ))}
      </View>
      <Text
        style={{
          flexShrink: 1,
          fontSize: 13,
          fontFamily: theme.fonts.medium,
          color: theme.colors.textAlt,
        }}
      >
        {label}
      </Text>
    </View>
  )
}
