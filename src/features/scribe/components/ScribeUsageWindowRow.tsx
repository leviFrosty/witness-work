import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { ScribeUsageWindow } from '@/features/scribe/types'
import {
  USAGE_WINDOW_COPY,
  formatResetTime,
} from '@/features/scribe/components/scribeCopy'

/** "Resets in 3 hours", or "Not used yet" before a window starts. */
export const usageResetLine = (window: ScribeUsageWindow, now = Date.now()) =>
  window.resetsAt === null
    ? i18n.t('scribe_usageNotStarted')
    : i18n.t('scribe_usageResets', {
        when: formatResetTime(window.resetsAt, now),
      })

/** One usage window: its name and percent, a bar, and when it resets. */
const ScribeUsageWindowRow = ({ window }: { window: ScribeUsageWindow }) => {
  const theme = useTheme()
  const percent = Math.max(0, Math.min(100, window.percentUsed))
  const color =
    percent >= 100
      ? theme.colors.error
      : percent >= 80
        ? theme.colors.warn
        : theme.colors.accent
  const label = i18n.t(USAGE_WINDOW_COPY[window.id])
  const used = i18n.t('scribe_usagePercent', { percent })
  const resets = usageResetLine(window)
  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${used}, ${resets}`}
      style={{ gap: 8, paddingVertical: 4 }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <Text
          style={{
            fontSize: theme.fontSize('md'),
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
            fontVariant: ['tabular-nums'],
          }}
        >
          {used}
        </Text>
      </View>
      <View
        style={{
          height: 8,
          borderRadius: 4,
          backgroundColor: theme.colors.backgroundLighter,
          borderWidth: 1,
          borderColor: theme.colors.border,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${percent}%`,
            height: '100%',
            borderRadius: 4,
            backgroundColor: color,
          }}
        />
      </View>
      <Text
        style={{ fontSize: theme.fontSize('sm'), color: theme.colors.textAlt }}
      >
        {resets}
      </Text>
    </View>
  )
}

export default ScribeUsageWindowRow
