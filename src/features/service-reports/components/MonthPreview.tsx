import { View } from 'react-native'
import moment from 'moment'
import { ArrowForwardIcon } from '@/components/ui/DirectionalIcon'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useMonthlyGoal from '@/hooks/useMonthlyGoal'
import i18n from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import { calendarMonthOf, roleForMonth } from '@/lib/roleHistory'
import {
  adjustedMinutesForSpecificMonth,
  getMonthsReports,
} from '@/lib/serviceReport'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import type { TimeEntry } from '@/types/timeEntry'

const MonthPreview = (props: { entry: TimeEntry }) => {
  const theme = useTheme()
  const { serviceReports } = useServiceReport()
  const {
    role: currentRole,
    roleHistory,
    overrideCreditLimit,
    customCreditLimitHours,
    timeDisplayFormat,
  } = usePreferences()
  const target = calendarMonthOf(props.entry.date)
  const { effectiveGoalHours } = useMonthlyGoal(target)
  const role = roleForMonth(roleHistory, currentRole, target)
  const creditOverride = {
    enabled: overrideCreditLimit,
    customLimitHours: customCreditLimitHours,
  }
  const reports = getMonthsReports(serviceReports, target.month, target.year)
  const monthMinutes = (entries: TimeEntry[]) =>
    adjustedMinutesForSpecificMonth(
      entries,
      target.month,
      target.year,
      role,
      creditOverride
    ).value
  const before = monthMinutes(reports)

  const after = monthMinutes([
    ...reports.filter((report) => report.id !== props.entry.id),
    { ...props.entry, date: normalizeDateForStorage(props.entry.date) },
  ])
  const goal = effectiveGoalHours * 60
  const format = (minutes: number) =>
    formatMinutes(minutes, timeDisplayFormat).formatted
  const changes = after !== before
  const share = (minutes: number): `${number}%` =>
    `${goal ? Math.min(100, Math.max(0, (minutes / goal) * 100)) : 0}%`
  const month = moment(props.entry.date).format('MMMM')

  return (
    <View
      accessible
      accessibilityLabel={
        changes
          ? i18n.t('timeForm_monthChange', {
              month,
              from: format(before),
              to: format(after),
            })
          : `${month}: ${format(before)}`
      }
      accessibilityValue={
        goal ? { text: i18n.t('timeForm_ofGoal', { goal: format(goal) }) } : {}
      }
      style={{ gap: 8 }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 20,
          gap: 6,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontSize: theme.fontSize('sm'),
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {month}
        </Text>
        <Text
          style={
            changes
              ? { fontSize: theme.fontSize('sm'), color: theme.colors.textAlt }
              : {
                  fontSize: theme.fontSize('sm'),
                  fontFamily: theme.fonts.semiBold,
                }
          }
        >
          {format(before)}
        </Text>
        {changes && (
          <>
            <LucideIcon
              icon={ArrowForwardIcon}
              size={14}
              color={theme.colors.textAlt}
            />
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                fontFamily: theme.fonts.bold,
              }}
            >
              {format(after)}
            </Text>
          </>
        )}
      </View>
      {!!goal && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              flex: 1,
              height: 8,
              borderRadius: 4,
              backgroundColor: 'rgba(118,118,128,0.2)',
              overflow: 'hidden',
            }}
          >
            {after > before && (
              <View
                style={{
                  position: 'absolute',
                  start: share(before),
                  top: 0,
                  bottom: 0,
                  width: share(after - before),
                  minWidth: 12,

                  borderStartWidth: 2,
                  borderStartColor: theme.colors.background,

                  backgroundColor: `${theme.colors.accent}99`,
                  borderTopEndRadius: 4,
                  borderBottomEndRadius: 4,
                }}
              />
            )}
            <View
              style={{
                position: 'absolute',
                start: 0,
                top: 0,
                bottom: 0,
                width: share(Math.min(before, after)),
                backgroundColor: theme.colors.accent,
                borderRadius: 4,
              }}
            />
          </View>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('timeForm_ofGoal', { goal: format(goal) })}
          </Text>
        </View>
      )}
    </View>
  )
}

export default MonthPreview
