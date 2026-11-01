import { useNavigation } from '@react-navigation/native'
import moment from 'moment'

import type { ContextMenuEntries } from '@/components/ui/ContextMenu'
import useOpenRouteBuilder from '@/hooks/useOpenRouteBuilder'
import usePublisher from '@/hooks/usePublisher'
import i18n from '@/lib/locales'
import type { RootStackNavigation } from '@/types/rootStack'

export default function useDayMenuActions(
  date: Date | undefined
): ContextMenuEntries {
  const navigation = useNavigation<RootStackNavigation>()
  const openRouteBuilder = useOpenRouteBuilder('day_menu')
  const { showsTimeEntry } = usePublisher()
  if (!date) return []

  const routeDate = date.toISOString()
  return [
    showsTimeEntry && {
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
    !moment(date).isBefore(moment(), 'day') && {
      id: 'plan_route',
      title: i18n.t('routePlan_homeAction'),
      systemImage: 'point.topleft.down.to.point.bottomright.curvepath',
      onPress: () => openRouteBuilder(date),
    },
  ]
}
