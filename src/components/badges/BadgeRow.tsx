import { View } from 'react-native'
import BadgeMedallion from '@/components/badges/BadgeMedallion'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { badgeTitle } from '@/lib/badges/display'
import i18n, { TranslationKey } from '@/lib/locales'
import type { BadgeArtId, BadgeLevel } from '@/types/badges'

/**
 * A compact row of badges for a profile card: up to `max` medallions, then
 * "+N". Read aloud as one summary; the row itself isn't interactive.
 */
export default function BadgeRow({
  badges,
  size = 26,
  max = 6,
}: {
  badges: readonly { art: BadgeArtId; level: BadgeLevel | null }[]
  size?: number
  max?: number
}) {
  const theme = useTheme()
  if (badges.length === 0) return null
  const shown = badges.slice(0, max)
  const more = badges.length - shown.length
  return (
    <View
      accessible
      accessibilityLabel={i18n.t('badges_rowLabel' as TranslationKey, {
        count: badges.length,
        names: badges
          .map(({ art, level }) => badgeTitle(art, level))
          .join(', '),
      })}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
    >
      {shown.map(({ art, level }) => (
        <BadgeMedallion
          key={`${art}.${level ?? 0}`}
          art={art}
          level={level}
          size={size}
        />
      ))}
      {more > 0 ? (
        <Text
          style={{
            fontSize: 12,
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.textAlt,
            marginLeft: 2,
          }}
        >
          {i18n.t('badges_moreCount', { count: more })}
        </Text>
      ) : null}
    </View>
  )
}
