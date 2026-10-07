import { View } from 'react-native'
import BadgeButton from '@/components/badges/BadgeButton'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import BadgeProgress from '@/features/badges/components/BadgeProgress'
import { nextLevel } from '@/features/badges/lib/badgeText'
import {
  BadgeShelfEntry,
  badgeDescription,
  badgeHowTo,
  badgeLevelName,
  badgeName,
  isNewBadge,
} from '@/lib/badges/display'
import i18n from '@/lib/locales'
import { BADGE_LEVELS, BadgeLevel } from '@/types/badges'
import type { BadgeViewOrigin } from '@/types/rootStack'

const MEDALLION_SIZE = 56

/**
 * One Badge Collection on the User's shelf: its four levels (earned in metal,
 * the rest as outlines), what the current level stands for, and progress toward
 * the next one.
 */
export default function BadgeCollectionCard({
  entry,
  seenAt,
  showProgress,
  onOpen,
}: {
  entry: Extract<BadgeShelfEntry, { kind: 'collection' }>
  seenAt: number
  /** False until the first evaluation has counted the User's records. */
  showProgress: boolean
  onOpen: (level: BadgeLevel, origin: BadgeViewOrigin | undefined) => void
}) {
  const theme = useTheme()
  const { art, progress } = entry
  const level = progress.level
  const next = nextLevel(level)
  const recordFor = (step: BadgeLevel) =>
    entry.earned.find((earned) => earned.level === step)?.record

  return (
    <Card style={{ paddingVertical: 16, paddingHorizontal: 16, gap: 14 }}>
      <View style={{ gap: 2 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <Text
            accessibilityRole='header'
            style={{
              flex: 1,
              fontSize: 16,
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.text,
            }}
          >
            {badgeName(art)}
          </Text>
          {level > 0 ? (
            <Text
              style={{
                fontSize: 12,
                fontFamily: theme.fonts.medium,
                color: theme.colors.textAlt,
              }}
            >
              {badgeLevelName(level as BadgeLevel)}
            </Text>
          ) : null}
        </View>
        {level > 0 ? (
          <Text style={{ fontSize: 13, color: theme.colors.textAlt }}>
            {badgeDescription(art, level as BadgeLevel)}
          </Text>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {BADGE_LEVELS.map((step) => {
          const earned = step <= level
          const record = recordFor(step)
          return (
            <View
              key={step}
              style={{ alignItems: 'center', gap: 6, minWidth: 64 }}
            >
              <BadgeButton
                art={art}
                level={step}
                size={MEDALLION_SIZE}
                state={earned ? 'earned' : 'locked'}
                isNew={!!record && isNewBadge(record, seenAt)}
                onPress={(origin) => onOpen(step, origin)}
              />
              <Text
                importantForAccessibility='no'
                accessibilityElementsHidden
                style={{
                  fontSize: 11,
                  fontFamily: earned ? theme.fonts.medium : theme.fonts.regular,
                  color: earned ? theme.colors.text : theme.colors.textAlt,
                }}
              >
                {badgeLevelName(step)}
              </Text>
            </View>
          )
        })}
      </View>

      {next && showProgress ? (
        <BadgeProgress
          art={art}
          count={progress.count}
          level={next}
          heading={i18n.t('badges_nextLevel', { level: badgeLevelName(next) })}
        />
      ) : (
        <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
          {next ? badgeHowTo(art) : i18n.t('badges_allLevels')}
        </Text>
      )}
    </Card>
  )
}
