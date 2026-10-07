import { View } from 'react-native'
import BadgeSpotlight from '@/features/badges/components/BadgeSpotlight'
import type { BadgeArtId, BadgeLevel } from '@/types/badges'

const CENTER_SIZE = 88
const SIDE_SIZE = 70
const STEP = 46
const TILT_DEG = 10

/**
 * Up to five medallions fanned like a hand of keepsakes, the first in the
 * middle and on top. Decorative: the summary text says what they are. `scale`
 * grows the whole hand, e.g. for a full-screen moment.
 */
export default function BadgeHistoryCluster({
  badges,
  scale = 1,
}: {
  badges: readonly { art: BadgeArtId; level: BadgeLevel | null }[]
  scale?: number
}) {
  const centerSize = Math.round(CENTER_SIZE * scale)
  const sideSize = Math.round(SIDE_SIZE * scale)
  const step = STEP * scale
  const shown = badges.slice(0, 5)
  // Fan out from the middle: first badge centered, then right, left, right…
  const slots = shown.map((badge, index) => {
    const side = index === 0 ? 0 : index % 2 === 1 ? 1 : -1
    const distance = Math.ceil(index / 2)
    return { badge, offset: side * distance, distance, index }
  })
  const spread = Math.max(0, ...slots.map((slot) => slot.distance))
  const width = centerSize + spread * step * 2
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility='no-hide-descendants'
      style={{ width, height: centerSize + 12 * scale }}
    >
      {[...slots]
        .sort((a, b) => b.distance - a.distance)
        .map(({ badge, offset, distance, index }) => {
          const size = distance === 0 ? centerSize : sideSize
          return (
            <View
              key={`${badge.art}.${badge.level ?? 0}`}
              style={{
                position: 'absolute',
                left: width / 2 - size / 2 + offset * step,
                top: (centerSize - size) / 2 + distance * 6 * scale,
                transform: [{ rotate: `${offset * TILT_DEG}deg` }],
              }}
            >
              <BadgeSpotlight
                art={badge.art}
                level={badge.level}
                size={size}
                entrance='spring'
                delay={120 + index * 90}
              />
            </View>
          )
        })}
    </View>
  )
}
