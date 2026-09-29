import { useNavigation } from '@react-navigation/native'
import moment from 'moment'

import type { ContextMenuEntries } from '@/components/ui/ContextMenu'
import usePublisher from '@/hooks/usePublisher'
import i18n from '@/lib/locales'
import type { RootStackNavigation } from '@/types/rootStack'

/**
 * The context menu for a calendar day, wherever a day appears (month calendar,
 * Home week strip, the Month tab's day list): Add Time and Plan This Day, the
 * same two actions the day's detail sheet offers.
 */
export default function useDayMenuActions(
  /** Local day. Undefined (or an unavailable cell) yields no menu. */
  date: Date | undefined
): ContextMenuEntries {
  const navigation = useNavigation<RootStackNavigation>()
  const { showsTimeEntry } = usePublisher()
  if (!date) return []

  const routeDate = date.toISOString()
  return [
    // No logging time for days that haven't happened yet; Regular Publishers
    // who don't log hours never see Add Time.
    showsTimeEntry &&
      !moment(date).isAfter(moment(), 'day') && {
        id: 'add_time',
        title: i18n.t('addTime'),
        systemImage: 'clock',
        onPress: () => navigation.navigate('Add Time', { date: routeDate }),
      },
    {
      id: 'plan_day',
      title: i18n.t('planThisDay'),
      systemImage: 'calendar.badge.plus',
      onPress: () => navigation.navigate('PlanDay', { date: routeDate }),
    },
  ]
}
