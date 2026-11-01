import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import SimpleProgressBar from '@/components/ui/SimpleProgressBar'
import useTheme from '@/contexts/theme'
import { progressLabel, progressToward } from '@/features/badges/lib/badgeText'
import { badgeHowTo } from '@/lib/badges/display'
import type { BadgeCollectionId, BadgeLevel } from '@/types/badges'
import { alignText } from '@/lib/direction'

export default function BadgeProgress({
  art,
  count,
  level,
  heading,
  showHow = true,
}: {
  art: BadgeCollectionId

  count: number

  level: BadgeLevel

  heading?: string
  showHow?: boolean
}) {
  const theme = useTheme()
  const { done, total, fraction } = progressToward(art, count, level)
  const label = progressLabel(art, done, total)
  return (
    <View style={{ gap: 6 }}>
      <View
        accessible
        accessibilityRole='progressbar'
        accessibilityLabel={heading}
        accessibilityValue={{ min: 0, max: total, now: done, text: label }}
        style={{ gap: 6 }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',

            justifyContent: heading ? 'space-between' : 'center',
            gap: 8,
          }}
        >
          {heading ? (
            <Text
              style={{
                fontSize: 12,
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.text,
              }}
            >
              {heading}
            </Text>
          ) : null}
          <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
            {label}
          </Text>
        </View>
        <SimpleProgressBar
          percentage={fraction}
          height={6}
          animated={false}
          color={theme.colors.accent}
        />
      </View>
      {showHow ? (
        <Text
          style={{
            fontSize: 12,
            color: theme.colors.textAlt,
            textAlign: heading ? alignText('start') : 'center',
          }}
        >
          {badgeHowTo(art)}
        </Text>
      ) : null}
    </View>
  )
}
