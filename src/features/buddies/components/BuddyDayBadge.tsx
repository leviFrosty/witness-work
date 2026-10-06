import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import { AvatarGroupCount } from '@/components/ui/AvatarGroup'
import i18n from '@/lib/locales'
import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'
import type { Buddy } from '@/features/buddies/lib/state'
import {
  type BuddyDayMarker,
  stackedBuddies,
} from '@/features/buddies/lib/calendarMarkers'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'

const AVATAR_SIZE = 16
const RING = 2
/** How far the stack hangs past the cell's right and bottom edges. */
const STACK_RIGHT = -5
const STACK_BOTTOM = -6
/** Each circle up the stack sits this much higher than the one below. */
const STACK_STEP = 13

/** The "buddies going out" mark, also shown in the calendar key. */
export function BuddiesOutDot() {
  const theme = useTheme()
  return (
    <View
      style={{
        width: 5,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: theme.colors.textAlt,
      }}
    />
  )
}

/**
 * A calendar day's buddy mark, drawn over the day's cell. Going out with
 * buddies stacks their avatars up the cell's right edge, first one in front at
 * the corner; past three, the top circle counts the rest. Other buddies going
 * out show a dot under the day. Avatars use no buddy colors so the day's status
 * colors stay readable. VoiceOver reads the labels as part of the day.
 */
export default function BuddyDayBadge({ marker }: { marker: BuddyDayMarker }) {
  const theme = useTheme()
  const names = (buddies: Buddy[]) => buddies.map(buddyDisplayName).join(', ')

  if (marker.withBuddies.length > 0) {
    const { shown, more } = stackedBuddies(marker.withBuddies)
    const circles = [
      ...shown.map((buddy) => (
        <BuddyAvatar
          key={buddy.inboxId}
          avatar={buddy.avatar}
          name={buddyDisplayName(buddy)}
          background={theme.colors.textAlt}
          size={AVATAR_SIZE}
        />
      )),
      ...(more > 0
        ? [<AvatarGroupCount key='more' count={more} size={AVATAR_SIZE} />]
        : []),
    ]
    return (
      <View
        accessible
        accessibilityLabel={i18n.t('buddies_withName', {
          name: names(marker.withBuddies),
        })}
        style={{ flex: 1 }}
      >
        {/* Drawn top-down so the first buddy, at the corner, is in front. */}
        {circles
          .map((circle, index) => (
            // Each circle's ring separates it from the cell and the one below.
            <View
              key={index}
              style={{
                position: 'absolute',
                right: STACK_RIGHT,
                bottom: STACK_BOTTOM + index * STACK_STEP,
                padding: RING,
                borderRadius: AVATAR_SIZE,
                backgroundColor: theme.colors.card,
              }}
            >
              {circle}
            </View>
          ))
          .reverse()}
      </View>
    )
  }

  if (marker.goingOut.length === 0) return null
  return (
    <View
      accessible
      accessibilityLabel={i18n.t('buddies_calendarGoingOut', {
        names: names(marker.goingOut),
      })}
      style={{ flex: 1, alignItems: 'center' }}
    >
      <View style={{ position: 'absolute', bottom: -7 }}>
        <BuddiesOutDot />
      </View>
    </View>
  )
}
