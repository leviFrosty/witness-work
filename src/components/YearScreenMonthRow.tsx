import moment from 'moment'
import { useMemo } from 'react'
import useTheme from '../contexts/theme'
import XView from './layout/XView'
import Text from './MyText'
import {
  AdjustedMinutes,
  adjustedMinutesForSpecificMonth,
} from '../lib/serviceReport'
import { ServiceReport } from '../types/serviceReport'
import { usePreferences } from '../stores/preferences'
import useServiceReport from '../stores/serviceReport'
import _ from 'lodash'
import i18n from '../lib/locales'
import { View } from 'react-native'
import { useFormattedMinutes } from '../lib/minutes'
import {
  AchievementTier,
  isPersonalBest12mo,
  resolveTier,
} from '../lib/achievementTier'
import {
  faCheck,
  faCrown,
  faStar,
  faTrophy,
  IconDefinition,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { Theme } from '../types/theme'

const tierIcon = (tier: AchievementTier): IconDefinition => {
  switch (tier) {
    case 'reached':
      return faCheck
    case 'exceeded':
      return faStar
    case 'crushed':
      return faTrophy
    case 'record':
      return faCrown
  }
}

const tierColor = (tier: AchievementTier, theme: Theme) =>
  tier === 'crushed' || tier === 'record'
    ? theme.colors.supporter
    : theme.colors.accent

export default function YearScreenMonthRow(props: {
  month: number
  year: number
  monthsReports: ServiceReport[]
}) {
  const { month, year, monthsReports } = props

  const {
    publisher,
    publisherHours,
    overrideCreditLimit,
    customCreditLimitHours,
  } = usePreferences()
  const { serviceReports } = useServiceReport()
  const goalHours = publisherHours[publisher]
  const theme = useTheme()

  const adjustedMinutes: AdjustedMinutes = monthsReports
    ? adjustedMinutesForSpecificMonth(monthsReports, month, year, publisher, {
        enabled: overrideCreditLimit,
        customLimitHours: customCreditLimitHours,
      })
    : { value: 0, credit: 0, standard: 0, creditOverage: 0 }

  const adjustedMinutesWithFormat = useFormattedMinutes(adjustedMinutes.value)

  // Tier indicator (static; no animation/haptic — those only fire on the
  // one-shot crossing moment in MonthSummary). Shown for every row that
  // cleared its goal so a year-at-a-glance view can surface personal bests
  // and crushed months without requiring a drill-in.
  const tier = useMemo<AchievementTier | null>(() => {
    if (goalHours <= 0) return null
    const hoursCompleted = adjustedMinutes.value / 60
    if (hoursCompleted < goalHours) return null
    const percent = (hoursCompleted / goalHours) * 100
    const isBest = isPersonalBest12mo(
      serviceReports,
      month,
      year,
      hoursCompleted,
      publisher,
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
    publisher,
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
            count: _.round(adjustedMinutes.creditOverage / 60, 1),
          })}
        </Text>
      )}
    </View>
  )
}
