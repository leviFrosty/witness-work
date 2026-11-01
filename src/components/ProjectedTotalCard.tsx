import { ChartLine as ChartLineIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { Fragment } from 'react'
import { View } from 'react-native'

import Text from '@/components/ui/MyText'
import Card from '@/components/ui/Card'
import StripedFill from '@/components/ui/StripedFill'
import GoalBar from '@/components/GoalBar'
import useTheme from '@/contexts/theme'

import i18n, { TranslationKey } from '@/lib/locales'
import { type ProjectedTotalScope } from '@/lib/projectedTotal'
import {
  getPeriodTense,
  getStatusCopy,
  segmentBoldMarkup,
} from '@/lib/projectedTotalCopy'
import usePublisher from '@/hooks/usePublisher'
import useProjectedTotal from '@/hooks/useProjectedTotal'
import { formatMinutes } from '@/lib/minutes'
import { usePreferences } from '@/stores/preferences'
import AssistantSection from '@/components/AssistantSection'
import useMonthlyGoal from '@/hooks/useMonthlyGoal'
import { tracking } from '@/lib/tracking'

type Props = {
  scope: ProjectedTotalScope

  showAssistant?: boolean
}

const ProjectedTotalCard = ({ scope, showAssistant = false }: Props) => {
  const theme = useTheme()
  const { annualGoalHours } = usePublisher()
  const timeDisplayFormat = usePreferences((s) => s.timeDisplayFormat)
  const formatHours = (minutes: number) =>
    formatMinutes(minutes, timeDisplayFormat).formatted

  const fallbackToday = new Date()
  const monthTarget =
    scope.kind === 'month'
      ? { month: scope.month, year: scope.year }
      : { month: fallbackToday.getMonth(), year: fallbackToday.getFullYear() }
  const { effectiveGoalHours: monthlyGoalHours } = useMonthlyGoal(monthTarget)
  const goalHours = scope.kind === 'month' ? monthlyGoalHours : annualGoalHours

  const { projection: result, today } = useProjectedTotal(scope, goalHours * 60)

  if (goalHours <= 0) return null

  const tense = getPeriodTense(scope, today)
  const periodLabel =
    scope.kind === 'month'
      ? i18n.t('projectedTotal.period.thisMonth')
      : i18n.t('projectedTotal.period.thisServiceYear')

  const loggedDisplay = formatHours(result.loggedMinutes)
  const plannedDisplay = formatHours(result.plannedMinutes)
  const projectedDisplay = formatHours(result.projectedMinutes)
  const status = getStatusCopy(result, tense, periodLabel, formatHours)
  const segments = status
    ? segmentBoldMarkup(i18n.t(status.key as TranslationKey, status.params))
    : []

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
          {i18n.t(
            scope.kind === 'month'
              ? 'projectedTotal.headerMonth'
              : 'projectedTotal.headerYear'
          )}
        </Text>
      </View>

      <View>
        <Text
          style={{
            fontFamily: theme.fonts.bold,
            fontSize: theme.fontSize('4xl'),
            letterSpacing: tracking(-0.5),
          }}
        >
          {projectedDisplay}
        </Text>
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
        >
          {i18n.t('projectedTotal.heroSuffix')}
        </Text>
      </View>

      {}
      <GoalBar
        loggedMinutes={result.loggedMinutes}
        plannedMinutes={result.plannedMinutes}
        goalMinutes={result.goalMinutes}
        size='md'
      />

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <LegendItem
          color={theme.colors.accent}
          label={i18n.t('projectedTotal.legend.logged', {
            value: loggedDisplay,
          })}
        />
        <LegendItem
          color={theme.colors.accent}
          label={i18n.t('projectedTotal.legend.planned', {
            value: plannedDisplay,
          })}
          striped
        />
      </View>

      {result.state !== 'empty' && status && (
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.text,
            lineHeight: theme.fontSize('sm') * 1.4,
          }}
        >
          {segments.map((s, i) => (
            <Fragment key={i}>
              <Text
                style={
                  s.bold
                    ? {
                        fontFamily: theme.fonts.bold,
                        fontSize: theme.fontSize('sm'),
                      }
                    : { fontSize: theme.fontSize('sm') }
                }
              >
                {s.text}
              </Text>
            </Fragment>
          ))}
        </Text>
      )}

      {showAssistant && scope.kind === 'month' && tense !== 'past' && (
        <AssistantSection
          year={scope.year}
          month={scope.month}
          today={today}
          monthlyGoalHours={monthlyGoalHours}
          projection={result}
        />
      )}
    </Card>
  )
}

const LegendItem = ({
  color,
  label,
  striped,
}: {
  color: string
  label: string
  striped?: boolean
}) => {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 3,
          overflow: 'hidden',
          backgroundColor: striped ? theme.colors.border : color,
        }}
      >
        {striped && <StripedFill color={color} size={4} strokeWidth={1.5} />}
      </View>
      <Text
        style={{
          fontSize: theme.fontSize('xs'),
          color: theme.colors.textAlt,
        }}
      >
        {label}
      </Text>
    </View>
  )
}

export default ProjectedTotalCard
