import { useNavigation } from '@react-navigation/native'
import moment from 'moment'

import type { ContextMenuEntries } from '@/components/ui/ContextMenu'
import type { PlanListItem } from '@/types/timeEntry'
import { planLocationText } from '@/components/PlanLocationLink'
import { useLinkActions } from '@/components/RichLinkCard'
import usePublisher from '@/hooks/usePublisher'
import confirmDeletePlan, {
  confirmDeletePlanScope,
  deletePlan,
  RECURRING_DELETE_SCOPES,
  recurringDeleteScopeLabel,
  type RecurringDeleteScope,
} from '@/lib/confirmDeletePlan'
import { openURL } from '@/lib/links'
import i18n from '@/lib/locales'
import { DEFAULT_START_TIME_IN_MINUTES } from '@/lib/normalizeDate'
import { appleMapsUrl } from '@/lib/placeSearch'
import {
  getEffectiveMinutesForRecurringPlan,
  getEffectiveNoteForRecurringPlan,
  getEffectiveStartTimeInMinutesForRecurringPlan,
} from '@/lib/recurrence'
import type { RootStackNavigation, RootStackParamList } from '@/types/rootStack'

/** Plan Details for a row's Plan (a Recurring Plan's date). */
const planDetailsParams = (
  item: PlanListItem
): RootStackParamList['Plan Details'] =>
  item.type === 'day'
    ? { dayPlanId: item.plan.id }
    : { recurringPlanId: item.plan.id, date: item.date.toISOString() }

/** The Plan form editing a row's Plan (a Recurring Plan's date). */
const planEditParams = (item: PlanListItem): RootStackParamList['PlanDay'] =>
  item.type === 'day'
    ? { date: item.date.toISOString(), existingDayPlanId: item.plan.id }
    : {
        date: item.date.toISOString(),
        existingRecurringPlanId: item.plan.id,
        recurringPlanDate: item.date.toISOString(),
      }

/** A Plan's minutes, note, and start time on its date, overrides applied. */
const effectiveValues = (item: PlanListItem) =>
  item.type === 'recurring'
    ? {
        minutes: getEffectiveMinutesForRecurringPlan(item.plan, item.date),
        note: getEffectiveNoteForRecurringPlan(item.plan, item.date),
        startTimeInMinutes: getEffectiveStartTimeInMinutesForRecurringPlan(
          item.plan,
          item.date
        ),
      }
    : {
        minutes: item.plan.minutes,
        note: item.plan.note,
        startTimeInMinutes:
          item.plan.startTimeInMinutes ?? DEFAULT_START_TIME_IN_MINUTES,
      }

/**
 * Opening a Plan, plus Edit, Log as Time, Duplicate, maps, copy, and Delete,
 * wherever it shows: a row (tap and long-press menu) and Plan Details' More
 * menu. Also returns the Plan's effective values on its date.
 */
export default function usePlanMenuActions(
  item: PlanListItem,
  options: {
    /** Runs a navigation; a host sheet passes one that closes it first. */
    go?: (navigate: () => void) => void
    /** Leaves Edit out, for hosts with their own Edit button. */
    withoutEdit?: boolean
    /** A delete was confirmed and done. */
    onDeleted?: () => void
  } = {}
) {
  const navigation = useNavigation<RootStackNavigation>()
  const { showsTimeEntry } = usePublisher()
  const { copyText, openLinksItem } = useLinkActions()
  const { plan, date } = item
  const isRecurring = item.type === 'recurring'
  const effective = effectiveValues(item)
  const dateMoment = moment(date)
  const mapsUrl = plan.location ? appleMapsUrl(plan.location) : undefined

  const go = (navigate: () => void) =>
    options.go ? options.go(navigate) : navigate()

  const open = () =>
    go(() => navigation.navigate('Plan Details', planDetailsParams(item)))

  const edit = () =>
    go(() => navigation.navigate('PlanDay', planEditParams(item)))

  const removePlan = (scope?: RecurringDeleteScope) => {
    if (item.type === 'day') {
      deletePlan({ kind: 'day', planId: item.plan.id })
    } else {
      deletePlan(
        { kind: 'recurring', planId: item.plan.id, date: item.date },
        scope
      )
    }
    options.onDeleted?.()
  }

  /**
   * The one delete flow for a row's swipe and a Day Plan's menu item, so the
   * confirmation copy and the recurring-scope choices stay identical.
   */
  const requestDelete = () =>
    confirmDeletePlan({ recurring: isRecurring, onDelete: removePlan })

  const logAsTime = () =>
    go(() =>
      navigation.navigate('Add Time', {
        date: date.toISOString(),
        hours: Math.floor(effective.minutes / 60),
        minutes: effective.minutes % 60,
        categoryId: plan.categoryId,
      })
    )

  const duplicate = () =>
    go(() =>
      navigation.navigate('PlanDay', {
        date: date.toISOString(),
        prefill: {
          startTime: dateMoment
            .clone()
            .startOf('day')
            .add(effective.startTimeInMinutes, 'minutes')
            .toISOString(),
          minutes: effective.minutes,
          note: effective.note || undefined,
          title: plan.title,
          location: plan.location,
          categoryId: plan.categoryId,
        },
      })
    )

  const menu: ContextMenuEntries = [
    [
      !options.withoutEdit && {
        id: 'edit',
        title: i18n.t('edit'),
        systemImage: 'pencil',
        onPress: edit,
      },
      // Logging time for a day that hasn't happened yet makes no sense, and
      // publishers who don't log hours never see Add Time.
      showsTimeEntry &&
        !dateMoment.isAfter(moment(), 'day') && {
          id: 'log_as_time',
          title: i18n.t('logAsTime'),
          systemImage: 'clock',
          onPress: logAsTime,
        },
      {
        id: 'duplicate',
        title: i18n.t('duplicateEllipsis'),
        systemImage: 'plus.square.on.square',
        onPress: duplicate,
      },
    ],
    [
      mapsUrl
        ? {
            id: 'open_in_maps',
            title: i18n.t('openInMaps'),
            systemImage: 'map',
            onPress: () => void openURL(mapsUrl),
          }
        : null,
      plan.location && {
        id: 'copy_address',
        title: i18n.t('copyAddress'),
        systemImage: 'doc.on.doc',
        onPress: () => void copyText(planLocationText(plan.location!)),
      },
      openLinksItem(effective.note),
      effective.note
        ? {
            id: 'copy_note',
            title: i18n.t('copyNote'),
            systemImage: 'doc.on.doc',
            onPress: () => void copyText(effective.note!),
          }
        : null,
    ],
    [
      isRecurring
        ? {
            id: 'delete',
            title: i18n.t('delete'),
            systemImage: 'trash',
            actions: RECURRING_DELETE_SCOPES.map((scope) => ({
              id: scope,
              title: recurringDeleteScopeLabel(scope),
              destructive: true,
              onPress: () =>
                confirmDeletePlanScope({ scope, onDelete: removePlan }),
            })),
          }
        : {
            id: 'delete',
            title: i18n.t('delete'),
            systemImage: 'trash',
            destructive: true,
            onPress: requestDelete,
          },
    ],
  ]

  return { open, edit, requestDelete, menu, effective }
}
