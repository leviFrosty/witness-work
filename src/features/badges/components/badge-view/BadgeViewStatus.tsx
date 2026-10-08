import { Check as CheckIcon } from 'lucide-react-native'
import { View } from 'react-native'
import InfoPopover from '@/components/ui/InfoPopover'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import BadgeViewBar from '@/features/badges/components/badge-view/BadgeViewBar'
import { progressLabel, progressToward } from '@/features/badges/lib/badgeText'
import { badgeHowTo, badgeLevelName, badgeName } from '@/lib/badges/display'
import i18n from '@/lib/locales'
import type { BadgeCollectionId, BadgeLevel } from '@/types/badges'

const BAR_WIDTH = 200

/**
 * Where one of the User's collections stands: "Next: Pearl · 41 of 60 months"
 * over a thin bar, or "All four levels collected". How to grow it waits in an
 * info popover.
 */
export default function BadgeViewStatus({
  art,
  next,
  count,
}: {
  art: BadgeCollectionId
  /** The first level not reached yet; null once Pearl is reached. */
  next: BadgeLevel | null
  /** Counted so far; null until the first evaluation this session. */
  count: number | null
}) {
  const theme = useTheme()
  const help = (
    <InfoPopover inline title={badgeName(art)} description={badgeHowTo(art)} />
  )

  if (!next) {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        <LucideIcon icon={CheckIcon} size={15} color={theme.colors.accent} />
        <Text
          style={{
            fontSize: 14,
            fontFamily: theme.fonts.medium,
            color: theme.colors.text,
          }}
        >
          {i18n.t('badges_allLevels')}
        </Text>
      </View>
    )
  }
  if (count === null) return null

  const { done, total, fraction } = progressToward(art, count, next)
  const label = i18n.t('badges_viewStatus', {
    level: badgeLevelName(next),
    progress: progressLabel(art, done, total),
  })
  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          // Balances the info button's tap target so the text stays centered.
          paddingLeft: 24,
        }}
      >
        <Text
          accessibilityRole='progressbar'
          accessibilityLabel={label}
          accessibilityValue={{ min: 0, max: total, now: done }}
          style={{
            fontSize: 14,
            fontFamily: theme.fonts.medium,
            color: theme.colors.text,
          }}
        >
          {label}
        </Text>
        {help}
      </View>
      <BadgeViewBar fraction={fraction} width={BAR_WIDTH} />
    </View>
  )
}
