import { ScrollView, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import BadgeButton from '@/components/badges/BadgeButton'
import BadgeMedallion from '@/components/badges/BadgeMedallion'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { badgeKey } from '@/lib/badges/catalog'
import {
  earnedBadgeCount,
  isNewBadge,
  profileBadges,
} from '@/lib/badges/display'
import i18n, { TranslationKey } from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import type { BadgeArtId, BadgeLevel } from '@/types/badges'
import type { BadgeViewOrigin, RootStackNavigation } from '@/types/rootStack'

const MEDALLION_SIZE = 44
/** The overlay's content padding; the row scrolls edge to edge through it. */
const BLEED = 24
/** Outlines hinting at what's ahead before anything is earned. */
const PREVIEW: readonly BadgeArtId[] = [
  'monthsShared',
  'reportSent',
  'conversations',
]

/**
 * The profile overlay's Badges section: the User's earned medallions (highest
 * level per collection, newest first) and a way into the full collection. Lives
 * in the pre-mounted overlay, so it stays static: no mount animations. A
 * medallion opens its badge full screen, flipping out of where it sits.
 */
export default function ProfileBadgesSection({
  onBeforeNavigate,
  onBeforeOpenBadge,
}: {
  /** Closes the overlay first so the destination isn't covered. */
  onBeforeNavigate: () => void
  /** Fades the overlay away so the medallion seems to lift out of it. */
  onBeforeOpenBadge: () => void
}) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const earned = usePreferences((s) => s.earnedBadges)
  const showBadges = usePreferences((s) => s.showBadges)
  const seenAt = usePreferences((s) => s.badgesSeenAt)
  if (!showBadges) return null

  const badges = profileBadges(earned)
  const count = earnedBadgeCount(earned)

  const openAll = () => {
    onBeforeNavigate()
    navigation.navigate('Badges', { source: 'profile_overlay' })
  }
  const openBadge = (
    art: BadgeArtId,
    level: BadgeLevel | null,
    origin: BadgeViewOrigin | undefined
  ) => {
    onBeforeOpenBadge()
    navigation.navigate('BadgeView', {
      badgeKey: badgeKey(art, level),
      owner: 'me',
      // The overlay is gone by the time the view closes.
      origin: origin && { ...origin, returns: false },
    })
  }

  return (
    <View style={{ gap: 10 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <Text
          accessibilityRole='header'
          style={{
            fontSize: 13,
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.text,
          }}
        >
          {count > 0
            ? i18n.t('badges_count' as TranslationKey, { count })
            : i18n.t('badges_title')}
        </Text>
        <Button
          onPress={openAll}
          style={{ paddingVertical: 4, paddingHorizontal: 6, marginRight: -6 }}
        >
          <Text
            style={{
              fontSize: 13,
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t(count > 0 ? 'badges_seeAll' : 'badges_seeBadges')}
          </Text>
        </Button>
      </View>
      {badges.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -BLEED }}
          contentContainerStyle={{
            gap: 12,
            paddingHorizontal: BLEED,
            paddingVertical: 4,
          }}
        >
          {badges.map((badge) => (
            <BadgeButton
              key={badge.art}
              art={badge.art}
              level={badge.level}
              size={MEDALLION_SIZE}
              isNew={isNewBadge(badge, seenAt)}
              tooltip
              onPress={(origin) => openBadge(badge.art, badge.level, origin)}
            />
          ))}
        </ScrollView>
      ) : (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            padding: 14,
            borderRadius: theme.numbers.borderRadiusMd,
            backgroundColor: theme.colors.backgroundLighter,
          }}
        >
          <View
            accessibilityElementsHidden
            importantForAccessibility='no-hide-descendants'
            style={{ flexDirection: 'row', gap: 6 }}
          >
            {PREVIEW.map((art) => (
              <BadgeMedallion
                key={art}
                art={art}
                level={1}
                size={30}
                state='locked'
              />
            ))}
          </View>
          <Text style={{ flex: 1, fontSize: 13, color: theme.colors.textAlt }}>
            {i18n.t('badges_emptyInvite')}
          </Text>
        </View>
      )}
    </View>
  )
}
