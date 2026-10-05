import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'
import type { Buddy } from '@/features/buddies/lib/state'
import type { BuddyDayMarker } from '@/features/buddies/lib/calendarMarkers'

const AVATAR_SIZE = 16
const RING = 2

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
 * buddies shows the first one's avatar on the corner (a second peeks out behind
 * it for more people); other buddies going out show a dot under the day.
 * Avatars use no buddy colors so the day's status colors stay readable.
 * VoiceOver reads the labels as part of the day.
 */
export default function BuddyDayBadge({ marker }: { marker: BuddyDayMarker }) {
  const theme = useTheme()
  const names = (buddies: Buddy[]) =>
    buddies.map((buddy) => buddy.name).join(', ')

  if (marker.withBuddies.length > 0) {
    const [first, second] = marker.withBuddies
    // Kept clear of the day's text; the ring separates it from the cell.
    const avatar = (buddy: Buddy, right: number) => (
      <View
        style={{
          position: 'absolute',
          right,
          bottom: -10,
          padding: RING,
          borderRadius: AVATAR_SIZE,
          backgroundColor: theme.colors.card,
        }}
      >
        <BuddyAvatar
          avatar={buddy.avatar}
          name={buddy.name}
          background={theme.colors.textAlt}
          size={AVATAR_SIZE}
        />
      </View>
    )
    return (
      <View
        accessible
        accessibilityLabel={i18n.t('buddies_withName', {
          name: names(marker.withBuddies),
        })}
        style={{ flex: 1 }}
      >
        {second ? avatar(second, -14) : null}
        {avatar(first, -9)}
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
