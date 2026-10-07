import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import BadgeButton from '@/components/badges/BadgeButton'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { badgeKey } from '@/lib/badges/catalog'
import {
  badgeLevelName,
  badgeName,
  knownSharedBadges,
} from '@/lib/badges/display'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import type { RootStackNavigation } from '@/types/rootStack'
import type { Buddy } from '@/features/buddies/lib/state'

const MEDALLION_SIZE = 60
const COLUMN_WIDTH = 92

/**
 * Every badge a buddy shares, as a grid under their profile card: each
 * collection at its highest level and their One-time Badges. Earned only; never
 * progress, counts, or a comparison with this User's. A coin opens that badge
 * full screen, where the User can react to it.
 */
export default function BuddyBadgesSection({ buddy }: { buddy: Buddy }) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const showBadges = usePreferences((state) => state.showBadges)
  const badges = knownSharedBadges(buddy.badges)
  if (!showBadges || badges.length === 0) return null

  return (
    <View style={{ gap: 8 }}>
      <Text
        accessibilityRole='header'
        style={{
          color: theme.colors.textAlt,
          fontSize: theme.fontSize('sm'),
          fontFamily: theme.fonts.semiBold,
          textTransform: 'uppercase',
          paddingHorizontal: 15,
        }}
      >
        {i18n.t('badges_title')}
      </Text>
      <Card
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          rowGap: 18,
          columnGap: 4,
          paddingVertical: 18,
          paddingHorizontal: 8,
        }}
      >
        {badges.map(({ c: art, l }) => {
          const level = l ?? null
          return (
            <View
              key={art}
              style={{ width: COLUMN_WIDTH, alignItems: 'center', gap: 8 }}
            >
              <BadgeButton
                art={art}
                level={level}
                size={MEDALLION_SIZE}
                onPress={(origin) =>
                  navigation.navigate('BadgeView', {
                    badgeKey: badgeKey(art, level),
                    owner: { inboxId: buddy.inboxId },
                    origin,
                  })
                }
              />
              <View
                accessibilityElementsHidden
                importantForAccessibility='no-hide-descendants'
                style={{ alignItems: 'center', gap: 1 }}
              >
                <Text
                  numberOfLines={2}
                  style={{
                    fontSize: 12,
                    fontFamily: theme.fonts.medium,
                    color: theme.colors.text,
                    textAlign: 'center',
                  }}
                >
                  {badgeName(art)}
                </Text>
                {level ? (
                  <Text style={{ fontSize: 11, color: theme.colors.textAlt }}>
                    {badgeLevelName(level)}
                  </Text>
                ) : null}
              </View>
            </View>
          )
        })}
      </Card>
    </View>
  )
}
