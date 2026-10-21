import { useMemo, type ReactNode } from 'react'
import { View } from 'react-native'
import moment from 'moment'

import useTheme from '@/contexts/theme'
import useAccessibilityTextSize, {
  FIT_ONE_LINE,
} from '@/hooks/useAccessibilityTextSize'
import useRoleForMonth from '@/hooks/useRoleForMonth'
import useServiceReport from '@/stores/serviceReport'
import { usePreferences } from '@/stores/preferences'
import { getTotalMinutesForServiceYear } from '@/lib/serviceReport'
import {
  getServiceYearReports,
  isInServiceYear,
  serviceYearBounds,
} from '@/lib/serviceYear'
import { useFormattedMinutes } from '@/lib/minutes'
import i18n from '@/lib/locales'
import { formatPlainNumber } from '@/lib/numbers'

import Card from '@/components/ui/Card'
import InfoPopover from '@/components/ui/InfoPopover'
import Text from '@/components/ui/MyText'
import { tracking } from '@/lib/tracking'

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
  const largeText = useAccessibilityTextSize()
  const roleFor = useRoleForMonth()
  const { timeDisplayFormat, overrideCreditLimit, customCreditLimitHours } =
    usePreferences()
  const serviceReports = useServiceReport((s) => s.serviceReports)

  const serviceYear = year - 1

  const totalMinutes = useMemo(
    () =>
      getTotalMinutesForServiceYear(
        getServiceYearReports(serviceReports, serviceYear),
        serviceYear,
        roleFor,
        {
          enabled: overrideCreditLimit,
          customLimitHours: customCreditLimitHours,
        }
      ),
    [
      serviceReports,
      serviceYear,
      roleFor,
      overrideCreditLimit,
      customCreditLimitHours,
    ]
  )
  const totalDisplay = useFormattedMinutes(totalMinutes)
  const isDecimal = timeDisplayFormat === 'decimal'

  const { end: serviceYearEnd } = serviceYearBounds(serviceYear)
  const now = moment()
  const isCurrentServiceYear = isInServiceYear(now, serviceYear)
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
              letterSpacing: tracking(0.5),
            }}
          >
            {i18n.t('scheduleCalendar.serviceYearSpan', {
              start: formatPlainNumber(serviceYear),
              end: formatPlainNumber(serviceYear + 1),
            })}
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
            {
              // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
              i18n.t('daysLeftCount', { count: daysRemaining })
            }
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
          // At accessibility sizes the figure shrinks onto one line rather
          // than breaking between its digits.
          {...(largeText && isDecimal ? FIT_ONE_LINE : {})}
          style={{
            fontSize: isDecimal ? 64 : 40,
            // A fixed line height would keep the full-size line around a
            // shrunk figure.
            lineHeight:
              largeText && isDecimal ? undefined : isDecimal ? 68 : 44,
            fontFamily: theme.fonts.bold,
            color: theme.colors.text,
          }}
        >
          {isDecimal
            ? formatPlainNumber(totalDisplay.decimalHours)
            : totalDisplay.formatted}
        </Text>
        {isDecimal ? (
          <Text
            style={{
              fontSize: theme.fontSize('xl'),
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
            }}
          >
            {/* @ts-expect-error TranslationKey doesn't handle keys that contain objects. */}
            {i18n.t('hoursUnitLabel', { count: totalDisplay.decimalHours })}
          </Text>
        ) : null}
      </View>

      {categoriesSlot}
    </Card>
  )
}

export default YearTotalCard
