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

const STACK_RIGHT = -5
const STACK_BOTTOM = -6

const STACK_STEP = 13

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

const names = (buddies: Buddy[]) => buddies.map(buddyDisplayName).join(', ')

export function buddyDayMarkerLabel(
  marker: BuddyDayMarker
): string | undefined {
  if (marker.withBuddies.length > 0) {
    return i18n.t('buddies_withName', { name: names(marker.withBuddies) })
  }
  if (marker.goingOut.length === 0) return undefined
  return i18n.t('buddies_calendarGoingOut', { names: names(marker.goingOut) })
}

export default function BuddyDayBadge({ marker }: { marker: BuddyDayMarker }) {
  const theme = useTheme()

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
      <View style={{ flex: 1 }}>
        {}
        {circles
          .map((circle, index) => (
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
    <View style={{ flex: 1, alignItems: 'center' }}>
      <View style={{ position: 'absolute', bottom: -7 }}>
        <BuddiesOutDot />
      </View>
    </View>
  )
}
