import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '@/contexts/theme'
import BadgeCollectionCard from '@/features/badges/components/BadgeCollectionCard'
import BadgeCollectionNext from '@/features/badges/components/BadgeCollectionNext'
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
import { useFoldColumn } from '@/components/ui/layout/FoldPane'

export default function BadgeCollectionView({
  buddiesAvailable,
}: {
  buddiesAvailable: boolean
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<RootStackNavigation>()
  const earned = usePreferences((s) => s.earnedBadges)

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
              art={entry.art}
              level={entry.progress.level}
              isNew={(level) => {
                const record = entry.earned.find(
                  (earned) => earned.level === level
                )?.record
                return !!record && isNewBadge(record, seenAt)
              }}
              footer={
                <BadgeCollectionNext
                  art={entry.art}
                  level={entry.progress.level}
                  count={evaluation ? entry.progress.count : null}
                />
              }
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
