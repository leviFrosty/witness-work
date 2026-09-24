import { View } from 'react-native'
import moment from 'moment'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import { formatStartTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { usePreferences } from '@/stores/preferences'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { buddyColor } from '@/features/buddies/lib/buddyColors'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/**
 * Faded, read-only buddy Plans for one day — they never mix with the User's
 * own.
 */
export default function BuddyPlansForDay({ date }: { date: Date }) {
  const theme = useTheme()
  const enabled = useBuddiesEnabled()
  const { timeDisplayFormat } = usePreferences()
  const buddies = useBuddies((state) => state.buddies)
  const cards = useBuddies((state) => state.cards)
  if (!enabled) return null

  const key = moment(date).format('YYYY-MM-DD')
  const rows = buddies
    .filter((buddy) => buddy.status === 'active' && buddy.showOnCalendar)
    .flatMap((buddy) =>
      (cards[buddy.inboxId]?.days.find((day) => day.d === key)?.p ?? []).map(
        (plan, index) => ({ buddy, plan, key: `${buddy.inboxId}-${index}` })
      )
    )
  if (rows.length === 0) return null

  return (
    <View style={{ gap: 8, opacity: 0.7, paddingTop: 10 }}>
      <Text
        style={{
          color: theme.colors.textAlt,
          textTransform: 'uppercase',
          fontSize: theme.fontSize('sm'),
          fontFamily: theme.fonts.semiBold,
          letterSpacing: 0.5,
        }}
      >
        {i18n.t('buddies_dayTitle')}
      </Text>
      {rows.map(({ buddy, plan, key: rowKey }) => {
        const duration = formatMinutes(plan.m, timeDisplayFormat).formatted
        return (
          <XView key={rowKey} style={{ gap: 10 }}>
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: buddyColor(theme, buddy.colorIndex),
              }}
            />
            <Text style={{ fontFamily: theme.fonts.semiBold }}>
              {buddy.name}
            </Text>
            <Text style={{ color: theme.colors.textAlt, flexShrink: 1 }}>
              {plan.s === undefined
                ? i18n.t('buddies_dayPlanAnyTime', { duration })
                : i18n.t('buddies_dayPlanAtTime', {
                    time: formatStartTime(plan.s),
                    duration,
                  })}
            </Text>
          </XView>
        )
      })}
    </View>
  )
}
