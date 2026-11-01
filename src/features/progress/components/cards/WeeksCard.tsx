import { ChartColumn as ChartIcon } from 'lucide-react-native'
import moment from 'moment'
import { View } from 'react-native'
import Card from '@/components/ui/Card'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useStartOfWeek from '@/hooks/useStartOfWeek'
import i18n from '@/lib/locales'
import { formatMinutes, formatMinutesCompact } from '@/lib/minutes'
import { formatDisplay } from '@/lib/dates'
import { tracking } from '@/lib/tracking'
import { usePreferences } from '@/stores/preferences'
import { monthWeeks } from '@/features/progress/lib/progressCardStats'
import useMonthProgress from '@/features/progress/hooks/useMonthProgress'
import type { ProgressCardProps } from '@/features/progress/components/cards/types'

export default function WeeksCard({ month, year, size }: ProgressCardProps) {
  const theme = useTheme()
  const startOfWeek = useStartOfWeek()
  const timeDisplayFormat = usePreferences((s) => s.timeDisplayFormat)
  const { reports, today, tense } = useMonthProgress(month, year)
  const weeks = monthWeeks({ reports, month, year, startOfWeek, today })
  const wide = size !== 'small'
  const max = Math.max(1, ...weeks.map((w) => w.minutes))
  const current = weeks.find((w) => w.isCurrent)
  const best = weeks.reduce<(typeof weeks)[number] | null>(
    (top, w) => (w.minutes > (top?.minutes ?? 0) ? w : top),
    null
  )
  const headline = tense === 'current' ? current : best

  const nothingYet = tense !== 'current' && !best
  const barHeight = wide ? 64 : 36
  const dayLabel = (key: string) =>
    formatDisplay(moment(key, 'YYYY-MM-DD'), 'D')

  return (
    <Card
      style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 14, gap: 8 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <LucideIcon icon={ChartIcon} size={13} color={theme.colors.accent} />
        <Text
          numberOfLines={1}
          style={{
            flexShrink: 1,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('xs'),
            color: theme.colors.textAlt,
            textTransform: 'uppercase',
            letterSpacing: tracking(0.5),
          }}
        >
          {i18n.t('progressCards.weeks.title')}
        </Text>
      </View>
      {nothingYet ? (
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
        >
          {i18n.t('progressCards.serviceDays.none')}
        </Text>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{
              flexShrink: 1,
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize(wide ? '3xl' : '2xl'),
              color: headline?.minutes
                ? theme.colors.text
                : theme.colors.textAlt,
            }}
          >
            {formatMinutes(headline?.minutes ?? 0, timeDisplayFormat).formatted}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {tense === 'current'
              ? i18n.t('progressCards.weeks.thisWeek')
              : i18n.t('progressCards.weeks.bestWeek')}
          </Text>
        </View>
      )}
      <View
        accessible
        accessibilityLabel={weeks
          .map((w) =>
            i18n.t('progressCards.weeks.a11yWeek', {
              start: formatDisplay(moment(w.start, 'YYYY-MM-DD'), 'MMM D'),
              value: formatMinutes(w.minutes, timeDisplayFormat).formatted,
            })
          )
          .join(', ')}
        style={{
          marginTop: 'auto',
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: wide ? 10 : 5,
        }}
      >
        {weeks.map((w) => {
          const fill =
            w.minutes > 0 ? Math.max(3, (w.minutes / max) * barHeight) : 3
          const highlighted = w.isCurrent || (tense !== 'current' && w === best)
          return (
            <View
              key={w.start}
              style={{ flex: 1, alignItems: 'center', gap: 4 }}
            >
              {wide ? (
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: theme.fontSize('xs'),
                    color: w.minutes ? theme.colors.text : theme.colors.textAlt,
                    fontFamily: highlighted ? theme.fonts.semiBold : undefined,
                  }}
                >
                  {formatMinutesCompact(w.minutes) || '–'}
                </Text>
              ) : null}
              <View
                style={{
                  width: '100%',
                  height: barHeight,
                  justifyContent: 'flex-end',
                }}
              >
                <View
                  style={{
                    height: fill,
                    borderRadius: 4,

                    backgroundColor:
                      w.isFuture || w.minutes === 0
                        ? theme.colors.border
                        : highlighted
                          ? theme.colors.accent
                          : theme.colors.accentAlt,
                  }}
                />
              </View>
              {wide ? (
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: theme.fontSize('xs'),
                    color: theme.colors.textAlt,
                  }}
                >
                  {w.start === w.end
                    ? dayLabel(w.start)
                    : `${dayLabel(w.start)}–${dayLabel(w.end)}`}
                </Text>
              ) : null}
            </View>
          )
        })}
      </View>
    </Card>
  )
}
