import { View } from 'react-native'

import Text from '@/components/ui/MyText'
import { MilestoneProgressBarPreview } from '@/components/MilestoneProgressBar'
import useTheme from '@/contexts/theme'
import usePublisher from '@/hooks/usePublisher'
import useRoleForMonth from '@/hooks/useRoleForMonth'
import i18n from '@/lib/locales'
import { formatPlainNumber } from '@/lib/numbers'
import { getEffectiveMilestones, getMilestoneHitState } from '@/lib/milestones'
import { useFormattedMinutes } from '@/lib/minutes'
import { serviceYearFocusMonth } from '@/lib/roleHistory'
import { getTotalMinutesForServiceYear } from '@/lib/serviceReport'
import { getServiceYearReports } from '@/lib/serviceYear'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import { tracking } from '@/lib/tracking'

const YearSummaryPreview = ({ endYear }: { endYear: number }) => {
  const theme = useTheme()
  const serviceYear = endYear - 1
  const {
    type: publisher,
    hasAnnualGoal,
    annualGoalHours,
  } = usePublisher(serviceYearFocusMonth(serviceYear))
  const roleFor = useRoleForMonth()
  const { milestoneOverrides, overrideCreditLimit, customCreditLimitHours } =
    usePreferences()
  const serviceReports = useServiceReport((s) => s.serviceReports)

  const totalMinutes = getTotalMinutesForServiceYear(
    getServiceYearReports(serviceReports, serviceYear),
    serviceYear,
    roleFor,
    { enabled: overrideCreditLimit, customLimitHours: customCreditLimitHours }
  )
  const total = useFormattedMinutes(totalMinutes)
  const showsGoal = hasAnnualGoal && annualGoalHours > 0
  const milestones = showsGoal
    ? getEffectiveMilestones(publisher, milestoneOverrides, annualGoalHours)
    : []
  const hitState = getMilestoneHitState(milestones, totalMinutes)

  return (
    <View
      style={{
        width: 300,
        padding: 18,
        gap: 12,
        borderRadius: theme.numbers.borderRadiusMd,
        borderCurve: 'continuous',
        backgroundColor: theme.colors.card,
      }}
    >
      <Text
        style={{
          fontSize: theme.fontSize('sm'),
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textAlt,
          letterSpacing: tracking(0.5),
        }}
      >
        {i18n.t('scheduleCalendar.serviceYearSpan', {
          start: formatPlainNumber(serviceYear),
          end: formatPlainNumber(serviceYear + 1),
        })}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Text
          style={{
            fontSize: theme.fontSize('3xl'),
            fontFamily: theme.fonts.bold,
            color: theme.colors.text,
          }}
        >
          {total.formatted}
        </Text>
        {showsGoal ? (
          <Text
            style={{
              fontSize: theme.fontSize('md'),
              color: theme.colors.textAlt,
            }}
          >
            {}
            {i18n.t('goalHoursSuffix', { count: annualGoalHours })}
          </Text>
        ) : null}
      </View>
      {showsGoal && milestones.length > 0 ? (
        <>
          <MilestoneProgressBarPreview
            milestones={milestones}
            minutesCompleted={totalMinutes}
            annualGoalHours={annualGoalHours}
          />
          {hitState.total > 0 ? (
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.textAlt,
              }}
            >
              {i18n.t('milestonesHitChip', {
                hit: hitState.totalHit,
                total: hitState.total,
              })}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  )
}

export default YearSummaryPreview
