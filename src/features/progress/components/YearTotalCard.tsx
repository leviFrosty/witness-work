import { useMemo, type ReactNode } from 'react'
import { View } from 'react-native'
import moment from 'moment'

import useTheme from '@/contexts/theme'
import usePublisher from '@/hooks/usePublisher'
import useServiceReport from '@/stores/serviceReport'
import { usePreferences } from '@/stores/preferences'
import { getTotalMinutesForServiceYear } from '@/lib/serviceReport'
import { getServiceYearReports } from '@/lib/serviceYear'
import { useFormattedMinutes } from '@/lib/minutes'
import i18n from '@/lib/locales'

import Card from '@/components/ui/Card'
import InfoPopover from '@/components/ui/InfoPopover'
import Text from '@/components/ui/MyText'

interface YearTotalCardProps {
  /** End year of the service year (Sep 1 of `year - 1` → Aug 31 of `year`). */
  year: number
  /** Optional category details row beneath the annual total. */
  categoriesSlot?: ReactNode
}

/**
 * Year-tab hero for roles with no Annual Goal (Regular Publisher, Regular
 * Auxiliary, Special Pioneer, …). Mirrors `YearMilestoneCard`'s header and hero
 * number but shows only the credit-capped service-year total — no goal
 * denominator, milestones, or projection. An info popover explains why.
 */
const YearTotalCard = ({ year, categoriesSlot }: YearTotalCardProps) => {
  const theme = useTheme()
  const { type: publisher } = usePublisher()
  const { timeDisplayFormat, overrideCreditLimit, customCreditLimitHours } =
    usePreferences()
  const serviceReports = useServiceReport((s) => s.serviceReports)

  const serviceYear = year - 1

  const totalMinutes = useMemo(
    () =>
      getTotalMinutesForServiceYear(
        getServiceYearReports(serviceReports, serviceYear),
        serviceYear,
        publisher,
        {
          enabled: overrideCreditLimit,
          customLimitHours: customCreditLimitHours,
        }
      ),
    [
      serviceReports,
      serviceYear,
      publisher,
      overrideCreditLimit,
      customCreditLimitHours,
    ]
  )
  const totalDisplay = useFormattedMinutes(totalMinutes)
  const isDecimal = timeDisplayFormat === 'decimal'

  const serviceYearStart = moment().month(8).year(serviceYear).startOf('month')
  const serviceYearEnd = moment()
    .month(7)
    .year(serviceYear + 1)
    .endOf('month')
  const now = moment()
  const isCurrentServiceYear = now.isBetween(
    serviceYearStart,
    serviceYearEnd,
    'day',
    '[]'
  )
  const daysRemaining = isCurrentServiceYear
    ? Math.max(0, serviceYearEnd.diff(now, 'days'))
    : 0

  return (
    <Card style={{ flexGrow: 1 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
              letterSpacing: 0.5,
            }}
          >
            {`${serviceYear}–${serviceYear + 1}`}
          </Text>
          <InfoPopover
            inline
            title={i18n.t('yearTotal_info_title')}
            description={i18n.t('yearTotal_info_description')}
          />
        </View>
        {isCurrentServiceYear ? (
          <Text
            style={{
              fontSize: theme.fontSize('xs'),
              color: theme.colors.textAlt,
            }}
          >
            {daysRemaining} {i18n.t('daysLeft')}
          </Text>
        ) : null}
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <Text
          style={{
            fontSize: isDecimal ? 64 : 40,
            lineHeight: isDecimal ? 68 : 44,
            fontFamily: theme.fonts.bold,
            color: theme.colors.text,
          }}
        >
          {isDecimal ? totalDisplay.decimalHours : totalDisplay.formatted}
        </Text>
        {isDecimal ? (
          <Text
            style={{
              fontSize: theme.fontSize('xl'),
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('hours_lowercase')}
          </Text>
        ) : null}
      </View>

      {categoriesSlot}
    </Card>
  )
}

export default YearTotalCard
