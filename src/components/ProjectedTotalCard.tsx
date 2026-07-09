import { ChartLine as ChartLineIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { Fragment } from 'react'
import { View } from 'react-native'

import Text from '@/components/ui/MyText'
import Card from '@/components/ui/Card'
import StripedFill from '@/components/ui/StripedFill'
import useTheme from '@/contexts/theme'

import i18n, { TranslationKey } from '@/lib/locales'
import { type ProjectedTotalScope } from '@/lib/projectedTotal'
import {
  getPeriodTense,
  getStatusKey,
  segmentBoldMarkup,
} from '@/lib/projectedTotalCopy'
import usePublisher from '@/hooks/usePublisher'
import useProjectedTotal from '@/hooks/useProjectedTotal'
import { formatMinutes } from '@/lib/minutes'
import { usePreferences } from '@/stores/preferences'
import AssistantSection from '@/components/AssistantSection'
import useMonthlyGoal from '@/hooks/useMonthlyGoal'

type Props = {
  scope: ProjectedTotalScope
  /**
   * When true, the planning Assistant is rendered inside the card. The Schedule
   * screen opts in; Progress leaves it off so the card stays purely
   * retrospective there.
   */
  showAssistant?: boolean
}

const ProjectedTotalCard = ({ scope, showAssistant = false }: Props) => {
  const theme = useTheme()
  const { annualGoalHours } = usePublisher()
  const { timeDisplayFormat } = usePreferences()
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

  // Hide entirely when there's no goal to project against.
  if (goalHours <= 0) return null

  const tense = getPeriodTense(scope, today)
  const periodLabel =
    scope.kind === 'month'
      ? i18n.t('projectedTotal.period.thisMonth')
      : i18n.t('projectedTotal.period.thisServiceYear')

  const loggedDisplay = formatHours(result.loggedMinutes)
  const plannedDisplay = formatHours(result.plannedMinutes)
  const goalDisplay = formatHours(result.goalMinutes)
  const projectedDisplay = formatHours(result.projectedMinutes)
  const gapDisplay = formatHours(result.gapMinutes)
  const overDisplay = formatHours(result.overMinutes)

  const hasPlanned = result.plannedMinutes > 0
  // When there are no future plans, the default status copy ("plans would
  // put you at…") is misleading — drop it. The legend already shows 0h
  // planned, so the user isn't missing information.
  const hideStatus =
    !hasPlanned &&
    (result.state === 'reachable_gap' ||
      result.state === 'unreachable_gap' ||
      result.state === 'projected_over_goal')

  const statusKey = getStatusKey(result.state, tense) as TranslationKey

  const statusText = i18n.t(statusKey, {
    period: periodLabel,
    projected: projectedDisplay,
    gap: gapDisplay,
    over: overDisplay,
  })
  const segments = segmentBoldMarkup(statusText)

  // Bar geometry: logged (solid) then planned (hatched/translucent),
  // capped at the goal. Any over-amount lives in the status text only.
  const goalMin = result.goalMinutes
  const loggedPct =
    goalMin > 0 ? Math.min(100, (result.loggedMinutes / goalMin) * 100) : 0
  const plannedPct =
    goalMin > 0
      ? Math.min(100 - loggedPct, (result.plannedMinutes / goalMin) * 100)
      : 0

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
            letterSpacing: 0.5,
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
            letterSpacing: -0.5,
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

      {/* Stacked bar: logged (solid) + planned (translucent), capped at goal. */}
      <View
        style={{
          height: 10,
          width: '100%',
          backgroundColor: theme.colors.border,
          borderRadius: 999,
          overflow: 'hidden',
          flexDirection: 'row',
        }}
      >
        {loggedPct > 0 && (
          <View
            style={{
              width: `${loggedPct}%`,
              backgroundColor: theme.colors.accent,
            }}
          />
        )}
        {plannedPct > 0 && (
          <View
            style={{
              width: `${plannedPct}%`,
              height: '100%',
            }}
          >
            <StripedFill color={theme.colors.accent} />
          </View>
        )}
      </View>

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
        <Text
          style={{
            fontSize: theme.fontSize('xs'),
            color: theme.colors.textAlt,
          }}
          adjustsFontSizeToFit
          numberOfLines={1}
        >
          {i18n.t('projectedTotal.legend.goal', { value: goalDisplay })}
        </Text>
      </View>

      {result.state !== 'empty' && !hideStatus && (
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
