import moment from 'moment'
import { useMemo } from 'react'
import useTheme from '@/contexts/theme'
import XView from '@/components/ui/layout/XView'
import Text from '@/components/ui/MyText'
import {
  AdjustedMinutes,
  adjustedMinutesForSpecificMonth,
} from '@/lib/serviceReport'
import { TimeEntry } from '@/types/timeEntry'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import i18n from '@/lib/locales'
import { View } from 'react-native'
import { useFormattedMinutes } from '@/lib/minutes'
import {
  AchievementTier,
  isPersonalBest12mo,
  resolveTier,
  tierColor,
  tierIcon,
} from '@/lib/achievementTier'
import { goalProgress } from '@/lib/goalProgress'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'

export default function YearScreenMonthRow(props: {
  month: number
  year: number
  monthsReports: TimeEntry[]
}) {
  const { month, year, monthsReports } = props

  const { role, publisherHours, overrideCreditLimit, customCreditLimitHours } =
    usePreferences()
  const { serviceReports } = useServiceReport()
  const goalHours = publisherHours[role]
  const theme = useTheme()

  const adjustedMinutes: AdjustedMinutes = monthsReports
    ? adjustedMinutesForSpecificMonth(monthsReports, month, year, role, {
        enabled: overrideCreditLimit,
        customLimitHours: customCreditLimitHours,
      })
    : { value: 0, credit: 0, standard: 0, creditOverage: 0 }

  const adjustedMinutesWithFormat = useFormattedMinutes(adjustedMinutes.value)
  const creditOverageDisplay = useFormattedMinutes(
    adjustedMinutes.creditOverage
  )

  // Tier indicator (static; no animation/haptic — those only fire on the
  // one-shot crossing moment in MonthSummary). Shown for every row that
  // cleared its goal so a year-at-a-glance view can surface personal bests
  // and crushed months without requiring a drill-in.
  const tier = useMemo<AchievementTier | null>(() => {
    if (goalHours <= 0) return null
    const hoursCompleted = adjustedMinutes.value / 60
    if (hoursCompleted < goalHours) return null
    const { percent } = goalProgress({
      minutes: adjustedMinutes.value,
      goalMinutes: goalHours * 60,
    })
    const isBest = isPersonalBest12mo(
      serviceReports,
      month,
      year,
      hoursCompleted,
      role,
      {
        enabled: overrideCreditLimit,
        customLimitHours: customCreditLimitHours,
      }
    )
    return resolveTier(percent, isBest)
  }, [
    adjustedMinutes.value,
    goalHours,
    serviceReports,
    month,
    year,
    role,
    overrideCreditLimit,
    customCreditLimitHours,
  ])

  return (
    <View
      style={{
        borderRadius: theme.numbers.borderRadiusSm,
        backgroundColor: theme.colors.card,
        paddingHorizontal: 15,
        paddingVertical: 12,
        gap: 5,
      }}
    >
      <XView
        style={{
          justifyContent: 'space-between',
        }}
      >
        <XView style={{ gap: 8 }}>
          {tier && (
            <FontAwesomeIcon
              icon={tierIcon(tier)}
              color={tierColor(tier, theme)}
              size={14}
            />
          )}
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              color: tier ? tierColor(tier, theme) : theme.colors.text,
            }}
          >
            {moment().month(month).format('MMMM')}
          </Text>
        </XView>
        <Text style={{ fontFamily: theme.fonts.semiBold, letterSpacing: -0.5 }}>
          {`${adjustedMinutesWithFormat.formatted} ${i18n.t(
            'of'
          )} ${goalHours} ${i18n.t('hoursToGoal')}`}
        </Text>
      </XView>
      {!!adjustedMinutes.creditOverage && (
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.warn,
            textAlign: 'right',
          }}
        >
          {i18n.t('youHaveCreditOverage', {
            value: creditOverageDisplay.formatted,
          })}
        </Text>
      )}
    </View>
  )
}
