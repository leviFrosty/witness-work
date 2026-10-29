import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import StreakBadge from '@/components/StreakBadge'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import type { PopoverControls } from '@/components/ui/Popover'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import useToday from '@/hooks/useToday'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import type { RootStackNavigation } from '@/types/rootStack'
import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import {
  buddyDisplayName,
  buddyStreakCount,
} from '@/features/buddies/lib/buddyProfile'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/** Rows in the popover; the rest are in the Buddies list. */
const MAX_ROWS = 5
const AVATAR_SIZE = 24

/**
 * Buddies' streaks under the User's own in the Home streak popover, longest
 * first. Each opens that buddy. Nothing shows until a buddy shares one.
 */
export default function BuddyStreaks({
  closeThen,
}: Pick<PopoverControls, 'closeThen'>) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const enabled = useBuddiesEnabled()
  const showStreaks = usePreferences((state) => state.showStreaks)
  const buddies = useBuddies((state) => state.buddies)
  const today = useToday()

  if (!enabled || !showStreaks) return null
  const rows = buddies
    .filter((buddy) => buddy.status === 'active')
    .map((buddy) => ({ buddy, count: buddyStreakCount(buddy.streak, today) }))
    .filter(({ count }) => count > 0)
    .sort(
      (a, b) =>
        b.count - a.count ||
        buddyDisplayName(a.buddy).localeCompare(buddyDisplayName(b.buddy))
    )
    .slice(0, MAX_ROWS)
  if (rows.length === 0) return null

  return (
    <View
      style={{
        paddingTop: 8,
        borderTopWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <Text
        style={{
          fontSize: theme.fontSize('xs'),
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textAlt,
          paddingTop: 4,
          paddingBottom: 2,
        }}
      >
        {i18n.t('buddies_title')}
      </Text>
      {rows.map(({ buddy, count }) => {
        const name = buddyDisplayName(buddy)
        return (
          <Button
            key={buddy.inboxId}
            onPress={() =>
              closeThen(() =>
                navigation.navigate('Buddy', { inboxId: buddy.inboxId })
              )
            }
            accessibilityLabel={`${name}, ${i18n.t('streakAccessibilityLabel', { count })}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              minHeight: MIN_TOUCH_TARGET,
            }}
          >
            <BuddyAvatar
              avatar={buddy.avatar}
              name={name}
              color={buddy}
              size={AVATAR_SIZE}
            />
            <Text
              numberOfLines={1}
              style={{ flex: 1, fontFamily: theme.fonts.semiBold }}
            >
              {name}
            </Text>
            <StreakBadge count={count} size='sm' />
          </Button>
        )
      })}
    </View>
  )
}
