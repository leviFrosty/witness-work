import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { MIN_INSIGHT_VISITS } from '@/features/territories/lib/visitTally'

export default function InsightsProgress({ total }: { total: number }) {
  const theme = useTheme()
  const done = Math.min(total, MIN_INSIGHT_VISITS)
  return (
    <View
      accessible
      accessibilityRole='progressbar'
      accessibilityLabel={i18n.t('territories.insights.progress_a11y', {
        done,
        total: MIN_INSIGHT_VISITS,
      })}
      accessibilityValue={{ min: 0, max: MIN_INSIGHT_VISITS, now: done }}
      style={{
        height: 8,
        borderRadius: 4,
        overflow: 'hidden',
        backgroundColor: theme.colors.border,
      }}
    >
      <View
        style={{
          width: `${(done / MIN_INSIGHT_VISITS) * 100}%`,
          height: '100%',
          borderRadius: 4,
          backgroundColor: theme.colors.accent,
        }}
      />
    </View>
  )
}
