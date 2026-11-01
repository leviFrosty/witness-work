import { useState } from 'react'
import { View } from 'react-native'
import { ChartLine as ChartLineIcon } from 'lucide-react-native'
import useTheme from '@/contexts/theme'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import LucideIcon from '@/components/ui/LucideIcon'
import InfoPopover from '@/components/ui/InfoPopover'
import i18n, { type TranslationKey } from '@/lib/locales'

import { formatMinutes } from '@/lib/minutes'
import { getStatusCopy, segmentBoldMarkup } from '@/lib/projectedTotalCopy'
import { usePreferences } from '@/stores/preferences'
import ServiceYearPaceChart from '@/features/progress/components/ServiceYearPaceChart'
import type { PacePoint } from '@/features/progress/lib/serviceYearPace'
import type { ServiceYearPaceData } from '@/features/progress/hooks/useServiceYearPace'
import { tracking } from '@/lib/tracking'
import { formatDisplay } from '@/lib/dates'

const EVEN_MINUTES = 30

type Props = {
  data: ServiceYearPaceData

  milestones: number[]
}

const ServiceYearPaceCard = ({ data, milestones }: Props) => {
  const theme = useTheme()
  const { timeDisplayFormat } = usePreferences()
  const [scrubbed, setScrubbed] = useState<PacePoint | null>(null)
  const { pace, projection } = data
  const format = (minutes: number) =>
    formatMinutes(Math.abs(minutes), timeDisplayFormat).formatted

  const handleScrub = (point: PacePoint | null) => {
    setScrubbed(point)
  }

  const paceDelta = pace.loggedMinutes - pace.goalToDateMinutes
  const headline =
    pace.tense !== 'present'
      ? null
      : Math.abs(paceDelta) < EVEN_MINUTES
        ? i18n.t('onPace')
        : i18n.t(
            paceDelta > 0
              ? 'serviceYearPace.aheadOfPace'
              : 'serviceYearPace.behindPace',
            { value: format(paceDelta) }
          )

  const lastYearDelta =
    pace.lastYearToDateMinutes === null
      ? null
      : pace.loggedMinutes - pace.lastYearToDateMinutes
  const lastYearLine =
    lastYearDelta === null || pace.tense === 'future'
      ? null
      : Math.abs(lastYearDelta) < EVEN_MINUTES
        ? i18n.t('serviceYearPace.evenWithLastYear')
        : i18n.t(
            lastYearDelta > 0
              ? 'serviceYearPace.aheadOfLastYear'
              : 'serviceYearPace.behindLastYear',
            { value: format(lastYearDelta) }
          )

  const hasPlanned = pace.points.some((p) => p.planned !== null)
  const status = getStatusCopy(
    projection,
    pace.tense,
    i18n.t('projectedTotal.period.thisServiceYear'),
    format
  )
  const statusSegments = status
    ? segmentBoldMarkup(i18n.t(status.key as TranslationKey, status.params))
    : []

  const summary = i18n.t('serviceYearPace.summary', {
    logged: format(pace.loggedMinutes),
    goal: format(pace.goalMinutes),
  })
  const summaryDetails = [headline, lastYearLine].filter(Boolean).join(', ')
  const chartSummary = summaryDetails
    ? i18n.t('serviceYearPace.summaryWithDetails', {
        summary,
        details: summaryDetails,
      })
    : summary

  const scrubbedMonth = scrubbed ? pace.months[scrubbed.monthIndex] : null
  const scrubbedTitle =
    scrubbed?.kind === 'today'
      ? i18n.t('today')
      : scrubbedMonth
        ? formatDisplay(
            { year: scrubbedMonth.year, month: scrubbedMonth.month },
            'MMMM YYYY'
          )
        : null

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <LucideIcon
          icon={ChartLineIcon}
          size={14}
          style={{ color: theme.colors.textAlt }}
        />
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
            textTransform: 'uppercase',
            letterSpacing: tracking(0.5),
          }}
        >
          {i18n.t('serviceYearPace.title')}
        </Text>
        <InfoPopover
          title={i18n.t('serviceYearPace.title')}
          description={i18n.t('serviceYearPace.info')}
          inline
        />
      </View>

      {scrubbed ? (
        <View style={{ gap: 6, minHeight: 48 }}>
          <Text
            style={{
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize('xl'),
            }}
          >
            {scrubbedTitle}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {scrubbed.logged !== null ? (
              <ReadoutItem
                label={i18n.t('projectedTotal.legend.logged', {
                  value: format(scrubbed.logged),
                })}
              />
            ) : scrubbed.planned !== null ? (
              <ReadoutItem
                label={i18n.t('projectedTotal.legend.planned', {
                  value: format(scrubbed.planned),
                })}
              />
            ) : null}
            <ReadoutItem
              label={i18n.t('projectedTotal.legend.goal', {
                value: format(scrubbed.goal),
              })}
            />
            {scrubbed.lastYear !== null && (
              <ReadoutItem
                label={i18n.t('serviceYearPace.lastYearValue', {
                  value: format(scrubbed.lastYear),
                })}
              />
            )}
          </View>
        </View>
      ) : headline || lastYearLine ? (
        <View style={{ gap: 6, minHeight: 48 }}>
          {headline && (
            <Text
              style={{
                fontFamily: theme.fonts.bold,
                fontSize: theme.fontSize('xl'),
                color:
                  paceDelta >= EVEN_MINUTES
                    ? theme.colors.accent
                    : theme.colors.text,
              }}
            >
              {headline}
            </Text>
          )}
          {lastYearLine && (
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
              }}
            >
              {lastYearLine}
            </Text>
          )}
        </View>
      ) : null}

      <ServiceYearPaceChart
        pace={pace}
        gridHours={milestones}
        onScrub={handleScrub}
        accessibilityLabel={chartSummary}
      />

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <LegendItem
          color={theme.colors.accent}
          label={i18n.t('serviceYearPace.legend.logged')}
        />
        {hasPlanned && (
          <LegendItem
            color={theme.colors.accent}
            dashed
            label={i18n.t('serviceYearPace.legend.planned')}
          />
        )}
        <LegendItem
          color={theme.colors.textAlt}
          dashed
          label={i18n.t('serviceYearPace.legend.goal')}
        />
        {pace.hasLastYear && (
          <LegendItem
            color={theme.colors.textAlt}
            faint
            label={i18n.t('serviceYearPace.legend.lastYear')}
          />
        )}
      </View>

      {projection.state !== 'empty' && status && (
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            lineHeight: theme.fontSize('sm') * 1.4,
          }}
        >
          {statusSegments.map((segment, i) => (
            <Text
              key={i}
              style={{
                fontSize: theme.fontSize('sm'),
                fontFamily: segment.bold ? theme.fonts.bold : undefined,
              }}
            >
              {segment.text}
            </Text>
          ))}
        </Text>
      )}
    </Card>
  )
}

const ReadoutItem = ({ label }: { label: string }) => {
  const theme = useTheme()
  return (
    <Text
      style={{ fontSize: theme.fontSize('sm'), color: theme.colors.textAlt }}
    >
      {label}
    </Text>
  )
}

const LegendItem = ({
  color,
  label,
  dashed,
  faint,
}: {
  color: string
  label: string
  dashed?: boolean
  faint?: boolean
}) => {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View
        style={{
          width: 14,
          flexDirection: 'row',
          gap: 2,
          opacity: faint ? 0.55 : 1,
        }}
      >
        {dashed ? (
          [0, 1, 2].map((i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 2,
                borderRadius: 1,
                backgroundColor: color,
              }}
            />
          ))
        ) : (
          <View
            style={{
              flex: 1,
              height: faint ? 2 : 3,
              borderRadius: 2,
              backgroundColor: color,
            }}
          />
        )}
      </View>
      <Text
        style={{ fontSize: theme.fontSize('xs'), color: theme.colors.textAlt }}
      >
        {label}
      </Text>
    </View>
  )
}

export default ServiceYearPaceCard
