import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import BadgeProgress from '@/features/badges/components/BadgeProgress'
import { nextLevel } from '@/features/badges/lib/badgeText'
import { badgeHowTo, badgeLevelName } from '@/lib/badges/display'
import i18n from '@/lib/locales'
import type { BadgeCollectionId, BadgeLevel } from '@/types/badges'

export default function BadgeCollectionNext({
  art,
  level,
  count,
}: {
  art: BadgeCollectionId
  level: BadgeLevel | 0

  count: number | null
}) {
  const theme = useTheme()
  const next = nextLevel(level)
  if (next && count !== null) {
    return (
      <BadgeProgress
        art={art}
        count={count}
        level={next}
        heading={i18n.t('badges_nextLevel', { level: badgeLevelName(next) })}
      />
    )
  }
  return (
    <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
      {next ? badgeHowTo(art) : i18n.t('badges_allLevels')}
    </Text>
  )
}
