import { useEffect } from 'react'
import { ScrollView, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '@/contexts/theme'
import BadgeCollectionCard from '@/features/badges/components/BadgeCollectionCard'
import BadgeMomentsSection from '@/features/badges/components/BadgeMomentsSection'
import { analytics } from '@/lib/analytics'
import { badgeKey } from '@/lib/badges/catalog'
import { buddyBadgeShelf } from '@/lib/badges/display'
import type { BadgeArtId, BadgeLevel, SharedBadge } from '@/types/badges'
import type { BadgeViewOrigin, RootStackNavigation } from '@/types/rootStack'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'

/**
 * A buddy's whole collection, opened from See all on their page: every
 * collection with the levels they've reached in metal and the rest as outlines,
 * then their One-time Badges. Only what they share: no progress, counts, or
 * dates. A coin opens that badge full screen; an outline opens it as "Not
 * yet".
 */
export default function BuddyBadgesScreen({
  inboxId,
  badges,
}: {
  inboxId: string
  badges: readonly SharedBadge[] | undefined
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<RootStackNavigation>()

  useEffect(() => {
    analytics.capture('buddy_badges_opened')
  }, [])

  const shelf = buddyBadgeShelf(badges)
  const open = (
    art: BadgeArtId,
    level: BadgeLevel | null,
    origin: BadgeViewOrigin | undefined,
    locked = false
  ) =>
    navigation.navigate('BadgeView', {
      badgeKey: badgeKey(art, level),
      owner: { inboxId },
      origin,
      locked,
    })

  const foldColumn = useFoldColumn(720)
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={[
        {
          padding: 16,
          paddingBottom: insets.bottom + 32,
          gap: 16,
          width: '100%',
          maxWidth: 720,
          alignSelf: 'center',
        },
        foldColumn,
      ]}
    >
      <View style={{ gap: 12 }}>
        {shelf.collections.map(({ art, level }) => (
          <BadgeCollectionCard
            key={art}
            art={art}
            level={level}
            onOpen={(step, origin) => open(art, step, origin, step > level)}
          />
        ))}
      </View>
      <BadgeMomentsSection
        entries={shelf.oneTime}
        onOpen={(art, origin) => open(art, null, origin)}
      />
    </ScrollView>
  )
}
