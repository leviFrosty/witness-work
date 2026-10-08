import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import BadgeViewBar from '@/features/badges/components/badge-view/BadgeViewBar'
import {
  earnedLabel,
  progressLabel,
  progressToward,
} from '@/features/badges/lib/badgeText'
import { isCollectionId } from '@/lib/badges/catalog'
import {
  badgeDescription,
  badgeHowTo,
  badgeLevelName,
  badgeName,
  badgeTitle,
} from '@/lib/badges/display'
import i18n from '@/lib/locales'
import type {
  BadgeArtId,
  BadgeCollectionId,
  BadgeLevel,
  EarnedBadge,
} from '@/types/badges'

/**
 * What a badge stands for, under its coin: the level, the name, what it counts,
 * and when it was earned. A level the User hasn't reached says "Not yet", how
 * far along they are, and how to grow it. A buddy's badge carries no date.
 */
export default function BadgeViewDetails({
  art,
  level,
  locked,
  record,
  count,
}: {
  art: BadgeArtId
  level: BadgeLevel | null
  locked: boolean
  /** The User's own record; null for a buddy's badge or a locked one. */
  record: EarnedBadge | null
  /** The collection's count so far, for a locked level's progress. */
  count: number | null
}) {
  const theme = useTheme()
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingHorizontal: 28 }}>
      <View
        accessible
        accessibilityRole='header'
        accessibilityLabel={badgeTitle(art, level)}
        style={{ alignItems: 'center', gap: 4 }}
      >
        {level ? (
          <Text
            style={{
              fontSize: 13,
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
              textTransform: 'uppercase',
              letterSpacing: 1.4,
            }}
          >
            {badgeLevelName(level)}
          </Text>
        ) : null}
        <Text
          style={{
            fontSize: 28,
            lineHeight: 34,
            fontFamily: theme.fonts.bold,
            color: theme.colors.text,
            textAlign: 'center',
          }}
        >
          {badgeName(art)}
        </Text>
      </View>
      <Text
        style={{
          fontSize: 16,
          lineHeight: 22,
          color: theme.colors.text,
          textAlign: 'center',
          maxWidth: 340,
        }}
      >
        {badgeDescription(art, level)}
      </Text>
      {locked ? (
        <View style={{ alignItems: 'center', gap: 12, marginTop: 4 }}>
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 4,
              borderRadius: 12,
              backgroundColor: theme.colors.backgroundLighter,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.textAlt,
              }}
            >
              {i18n.t('badges_notYet')}
            </Text>
          </View>
          {level && isCollectionId(art) && count !== null ? (
            <LockedProgress art={art} level={level} count={count} />
          ) : null}
          <Text
            style={{
              fontSize: 14,
              color: theme.colors.textAlt,
              textAlign: 'center',
              maxWidth: 320,
            }}
          >
            {badgeHowTo(art)}
          </Text>
        </View>
      ) : record ? (
        <Text
          style={{
            fontSize: 14,
            fontFamily: theme.fonts.medium,
            color: theme.colors.textAlt,
          }}
        >
          {earnedLabel(record)}
        </Text>
      ) : null}
    </View>
  )
}

/**
 * How far the User is toward a level they haven't reached: "1 of 10 service
 * years".
 */
function LockedProgress({
  art,
  level,
  count,
}: {
  art: BadgeCollectionId
  level: BadgeLevel
  count: number
}) {
  const theme = useTheme()
  const { done, total, fraction } = progressToward(art, count, level)
  const label = progressLabel(art, done, total)
  return (
    <View
      accessible
      accessibilityRole='progressbar'
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: total, now: done }}
      style={{ alignItems: 'center', gap: 8 }}
    >
      <Text
        style={{
          fontSize: 14,
          fontFamily: theme.fonts.medium,
          color: theme.colors.text,
        }}
      >
        {label}
      </Text>
      <BadgeViewBar fraction={fraction} width={200} />
    </View>
  )
}
