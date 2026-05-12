import { Fragment, useMemo } from 'react'
import { View } from 'react-native'
import _ from 'lodash'

import Text from '@/components/ui/MyText'
import Card from '@/components/ui/Card'
import useTheme from '@/contexts/theme'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faChartLine } from '@fortawesome/free-solid-svg-icons'

import i18n, { TranslationKey } from '@/lib/locales'
import {
  computeProjectedTotal,
  type ProjectedTotalScope,
} from '@/lib/projectedTotal'
import {
  getPeriodTense,
  getStatusKey,
  segmentBoldMarkup,
} from '@/lib/projectedTotalCopy'
import usePublisher from '@/hooks/usePublisher'
import useServiceReport from '@/stores/serviceReport'
import {
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
  getServiceYearReports,
  getTotalMinutesForServiceYear,
} from '@/lib/serviceReport'
import AssistantSection from '@/components/AssistantSection'

type Props = {
  scope: ProjectedTotalScope
}

const formatHours = (minutes: number): string => `${_.round(minutes / 60, 1)}h`

const ProjectedTotalCard = ({ scope }: Props) => {
  const theme = useTheme()
  const {
    monthlyGoalHours,
    annualGoalHours,
    creditCapMinutes,
    type: publisher,
  } = usePublisher()
  const { serviceReports, dayPlans, recurringPlans } = useServiceReport()

  const goalHours = scope.kind === 'month' ? monthlyGoalHours : annualGoalHours

  // `today` is captured once per render. Memoizing keeps the downstream
  // useMemos stable across renders that didn't actually cross midnight.
  const today = useMemo(() => new Date(), [])

  const loggedAdjustedMinutes = useMemo(() => {
    if (scope.kind === 'month') {
      const reports = getMonthsReports(serviceReports, scope.month, scope.year)
      return (
        adjustedMinutesForSpecificMonth(
          reports,
          scope.month,
          scope.year,
          publisher
        ).value ?? 0
      )
    }
    const reports = getServiceYearReports(serviceReports, scope.serviceYear)
    return getTotalMinutesForServiceYear(reports, scope.serviceYear)
  }, [scope, serviceReports, publisher])

  const result = useMemo(
    () =>
      computeProjectedTotal({
        scope,
        today,
        goalMinutes: goalHours * 60,
        loggedAdjustedMinutes,
        dayPlans,
        recurringPlans,
        // Service-year planned minutes are summed without per-month cap
        // truncation — passing null avoids re-capping against an annual
        // cap that doesn't exist.
        creditCapMinutes: scope.kind === 'month' ? creditCapMinutes : null,
      }),
    [
      scope,
      today,
      goalHours,
      loggedAdjustedMinutes,
      dayPlans,
      recurringPlans,
      creditCapMinutes,
    ]
  )

  // Hide entirely when there's no goal to project against.
  if (goalHours <= 0) return null

  const tense = getPeriodTense(scope, today)
  const periodLabel =
    scope.kind === 'month'
      ? i18n.t('projectedTotal.period.thisMonth')
      : i18n.t('projectedTotal.period.thisServiceYear')

  const projectedHours = _.round(result.projectedMinutes / 60, 1)
  const loggedDisplay = formatHours(result.loggedMinutes)
  const plannedDisplay = formatHours(result.plannedMinutes)
  const goalDisplay = formatHours(result.goalMinutes)
  const projectedDisplay = `${projectedHours}h`
  const gapDisplay = formatHours(result.gapMinutes)
  const overDisplay = formatHours(result.overMinutes)

  const hasPlanned = result.plannedMinutes > 0
  // Special case from the plan: when there are no future plans, the
  // "planned would put you at…" half is misleading. Swap to the explicit
  // "No plans scheduled yet." line instead.
  const useNoPlansCopy =
    !hasPlanned &&
    (result.state === 'reachable_gap' ||
      result.state === 'unreachable_gap' ||
      result.state === 'projected_over_goal')

  const statusKey = useNoPlansCopy
    ? 'projectedTotal.noPlansYet'
    : (getStatusKey(result.state, tense) as TranslationKey)

  const statusText = i18n.t(statusKey as TranslationKey, {
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
        <FontAwesomeIcon
          icon={faChartLine}
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
          {i18n.t('projectedTotal.header')}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <Text
          style={{
            fontFamily: theme.fonts.bold,
            fontSize: theme.fontSize('4xl'),
            letterSpacing: -0.5,
          }}
        >
          {projectedHours}
        </Text>
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
            flexShrink: 1,
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
              backgroundColor: theme.colors.accentTranslucent,
            }}
          />
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
          color={theme.colors.accentTranslucent}
          label={i18n.t('projectedTotal.legend.planned', {
            value: plannedDisplay,
          })}
          dashed
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

      {scope.kind === 'month' && tense !== 'past' && (
        <AssistantSection
          year={scope.year}
          month={scope.month}
          today={today}
          monthlyGoalHours={monthlyGoalHours}
          loggedAdjustedMinutes={loggedAdjustedMinutes}
          projection={result}
        />
      )}
    </Card>
  )
}

const LegendItem = ({
  color,
  label,
  dashed,
}: {
  color: string
  label: string
  dashed?: boolean
}) => {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 3,
          backgroundColor: color,
          ...(dashed
            ? {
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: theme.colors.accent,
              }
            : {}),
        }}
      />
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
