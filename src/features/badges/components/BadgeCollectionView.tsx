import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '@/contexts/theme'
import BadgeCollectionCard from '@/features/badges/components/BadgeCollectionCard'
import BadgeMomentsSection from '@/features/badges/components/BadgeMomentsSection'
import BadgesHero from '@/features/badges/components/BadgesHero'
import { badgeKey } from '@/lib/badges/catalog'
import {
  badgeShelf,
  earnedBadgeCount,
  isNewBadge,
  profileBadges,
} from '@/lib/badges/display'
import { useBadgeSession } from '@/stores/badgeSession'
import { usePreferences } from '@/stores/preferences'
import type { BadgeArtId, BadgeLevel } from '@/types/badges'
import type { BadgeViewOrigin, RootStackNavigation } from '@/types/rootStack'

/**
 * The User's own collection: the newest badge, every collection with its
 * progress, and earned moments. Badges stay "new" for this whole visit and
 * count as seen once the User leaves.
 */
export default function BadgeCollectionView({
  buddiesAvailable,
}: {
  buddiesAvailable: boolean
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<RootStackNavigation>()
  const earned = usePreferences((s) => s.earnedBadges)
  // Fixed for the visit, so badges stay marked new until the User leaves.
  const [seenAt] = useState(() => usePreferences.getState().badgesSeenAt)
  const evaluation = useBadgeSession((s) => s.evaluation)

  useEffect(() => () => usePreferences.getState().markBadgesSeen(), [])

  const shelf = badgeShelf({ evaluation, earned, buddiesAvailable })
  const newest = profileBadges(earned).at(0)
  const open = (
    art: BadgeArtId,
    level: BadgeLevel | null,
    origin: BadgeViewOrigin | undefined
  ) =>
    navigation.navigate('BadgeView', {
      badgeKey: badgeKey(art, level),
      owner: 'me',
      origin,
    })

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{
        padding: 16,
        paddingBottom: insets.bottom + 32,
        gap: 16,
        width: '100%',
        maxWidth: 720,
        alignSelf: 'center',
      }}
    >
      <BadgesHero
        newest={newest}
        count={earnedBadgeCount(earned)}
        newestIsNew={!!newest && isNewBadge(newest, seenAt)}
        onOpenNewest={(origin) =>
          newest && open(newest.art, newest.level, origin)
        }
      />
      <View style={{ gap: 12 }}>
        {shelf.map((entry) =>
          entry.kind === 'collection' ? (
            <BadgeCollectionCard
              key={entry.art}
              entry={entry}
              seenAt={seenAt}
              showProgress={evaluation !== null}
              onOpen={(level, origin) => open(entry.art, level, origin)}
            />
          ) : null
        )}
      </View>
      <BadgeMomentsSection
        entries={shelf.filter((entry) => entry.kind === 'oneTime')}
        seenAt={seenAt}
        onOpen={(art, origin) => open(art, null, origin)}
      />
    </ScrollView>
  )
}
