import { useNavigation } from '@react-navigation/native'
import * as Crypto from 'expo-crypto'
import moment from 'moment'
import { Alert } from 'react-native'

import type { ContextMenuEntries } from '@/components/ui/ContextMenu'
import useOpenRouteBuilder from '@/hooks/useOpenRouteBuilder'
import usePublisher from '@/hooks/usePublisher'
import useStartOfWeek from '@/hooks/useStartOfWeek'
import { analytics } from '@/lib/analytics'
import {
  copiedPlansBucket,
  lastWeekPlanCopies,
  weekHasDaysAhead,
} from '@/lib/copyLastWeekPlans'
import i18n from '@/lib/locales'
import { noteUserAction } from '@/lib/userAction'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import { showUndoToast } from '@/stores/undoToast'
import type { RootStackNavigation } from '@/types/rootStack'

/**
 * Copies last week's one-time Plans onto the week holding `date` (see
 * `lastWeekPlanCopies`), with an Undo toast that removes exactly the copies.
 */
export function copyLastWeekPlansInto(date: Date, startOfWeek: number) {
  const report = useServiceReport.getState()
  const copies = lastWeekPlanCopies({
    dayPlans: report.dayPlans,
    recurringPlans: report.recurringPlans,
    day: date,
    startOfWeek,
    offDays: usePreferences.getState().offDays,
    today: new Date(),
    newId: Crypto.randomUUID,
  })
  if (copies.length === 0) {
    Alert.alert(
      i18n.t('copyLastWeekPlans_noneTitle'),
      i18n.t('copyLastWeekPlans_noneMessage')
    )
    return
  }
  noteUserAction('plan')
  for (const copy of copies) report.addDayPlan(copy)
  analytics.capture('plans_copied_from_last_week', {
    count: copiedPlansBucket(copies.length),
  })
  showUndoToast({
    // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
    message: i18n.t('copyLastWeekPlans_copied', { count: copies.length }),
    onUndo: () => {
      const { deleteDayPlan } = useServiceReport.getState()
      for (const copy of copies) deleteDayPlan(copy.id)
    },
  })
}

/**
 * The context menu for a calendar day, wherever a day appears (month calendar,
 * Home week strip, the Month tab's day list): Add Time and Plan This Day, the
 * same two actions the day's detail sheet offers, and Plan Route from today on.
 * Its week, while it has days ahead, can copy last week's Plans.
 */
export default function useDayMenuActions(
  /** Local day. Undefined (or an unavailable cell) yields no menu. */
  date: Date | undefined
): ContextMenuEntries {
  const navigation = useNavigation<RootStackNavigation>()
  const openRouteBuilder = useOpenRouteBuilder('day_menu')
  const { showsTimeEntry } = usePublisher()
  const startOfWeek = useStartOfWeek()
  if (!date) return []

  const routeDate = date.toISOString()
  return [
    // Regular Publishers who don't log hours never see Add Time.
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
    // For the whole week, so it sits apart from the day's actions.
    [
      weekHasDaysAhead(date, startOfWeek, new Date()) && {
        id: 'copy_last_week',
        title: i18n.t('copyLastWeekPlans'),
        systemImage: 'doc.on.doc',
        onPress: () => copyLastWeekPlansInto(date, startOfWeek),
      },
    ],
  ]
}
