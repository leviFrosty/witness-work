import { useNavigation } from '@react-navigation/native'
import * as Crypto from 'expo-crypto'
import moment from 'moment'

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
import i18n, { type TranslationKey } from '@/lib/locales'
import { noteUserAction } from '@/lib/userAction'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import { toast } from '@/stores/toasts'
import type { RootStackNavigation } from '@/types/rootStack'

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
    toast.info(i18n.t('copyLastWeekPlans_noneTitle'), {
      message: i18n.t('copyLastWeekPlans_noneMessage'),
    })
    return
  }
  noteUserAction('plan')
  for (const copy of copies) report.addDayPlan(copy)
  analytics.capture('plans_copied_from_last_week', {
    count: copiedPlansBucket(copies.length),
  })
  toast.undo({
    title: i18n.t('copyLastWeekPlans_copied' as TranslationKey, {
      count: copies.length,
    }),
    onUndo: () => {
      const { deleteDayPlan } = useServiceReport.getState()
      for (const copy of copies) deleteDayPlan(copy.id)
    },
  })
}

export default function useDayMenuActions(
  date: Date | undefined
): ContextMenuEntries {
  const navigation = useNavigation<RootStackNavigation>()
  const openRouteBuilder = useOpenRouteBuilder('day_menu')
  const { showsTimeEntry } = usePublisher()
  const startOfWeek = useStartOfWeek()
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
