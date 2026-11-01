import { useNavigation } from '@react-navigation/native'
import moment from 'moment'

import type { ContextMenuEntries } from '@/components/ui/ContextMenu'
import type { PlanListItem } from '@/types/timeEntry'
import { planLocationText } from '@/components/PlanLocationLink'
import { useLinkActions } from '@/components/RichLinkCard'
import useOpenRouteBuilder from '@/hooks/useOpenRouteBuilder'
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
import {
  atMinutesOfDay,
  DEFAULT_START_TIME_IN_MINUTES,
} from '@/lib/normalizeDate'
import { appleMapsUrl } from '@/lib/placeSearch'
import { richTextLinks } from '@/lib/richText/inspect'
import { getNoteDoc, getNoteText } from '@/lib/richText/notes'
import {
  getEffectiveMinutesForRecurringPlan,
  getEffectiveNoteForRecurringPlan,
  getEffectiveStartTimeInMinutesForRecurringPlan,
  isRecurringPlanAnytimeOnDate,
} from '@/lib/recurrence'
import type { RootStackNavigation, RootStackParamList } from '@/types/rootStack'

export const planDetailsParams = (
  item: PlanListItem
): RootStackParamList['Plan Details'] =>
  item.type === 'day'
    ? { dayPlanId: item.plan.id }
    : { recurringPlanId: item.plan.id, date: item.date.toISOString() }

export const planEditParams = (
  item: PlanListItem
): RootStackParamList['PlanDay'] =>
  item.type === 'day'
    ? { date: item.date.toISOString(), existingDayPlanId: item.plan.id }
    : {
        date: item.date.toISOString(),
        existingRecurringPlanId: item.plan.id,
        recurringPlanDate: item.date.toISOString(),
      }

const effectiveValues = (item: PlanListItem) =>
  item.type === 'recurring'
    ? {
        minutes: getEffectiveMinutesForRecurringPlan(item.plan, item.date),
        note: getEffectiveNoteForRecurringPlan(item.plan, item.date),
        startTimeInMinutes: getEffectiveStartTimeInMinutesForRecurringPlan(
          item.plan,
          item.date
        ),
        anytime: isRecurringPlanAnytimeOnDate(item.plan, item.date),
      }
    : {
        minutes: item.plan.minutes,
        note: { note: item.plan.note, noteDoc: item.plan.noteDoc },
        startTimeInMinutes:
          item.plan.startTimeInMinutes ?? DEFAULT_START_TIME_IN_MINUTES,
        anytime: !!item.plan.anytime,
      }

export type LogTimePrefill = {
  date: Date
  hours: number
  minutes: number
  categoryId?: string
}

export default function usePlanMenuActions(
  item: PlanListItem,
  options: {
    go?: (navigate: () => void) => void

    logTime?: (prefill: LogTimePrefill) => void

    open?: (target: RootStackParamList['Plan Details']) => void

    edit?: (params: RootStackParamList['PlanDay']) => void

    withoutEdit?: boolean

    onDeleted?: () => void
  } = {}
) {
  const navigation = useNavigation<RootStackNavigation>()
  const openRouteBuilder = useOpenRouteBuilder('plan_menu')
  const { showsTimeEntry } = usePublisher()
  const { copyText, openLinksItem } = useLinkActions()
  const { plan, date } = item
  const isRecurring = item.type === 'recurring'
  const effective = effectiveValues(item)
  const dateMoment = moment(date)
  const noteLinks = richTextLinks(getNoteDoc(effective.note))
  const noteText = getNoteText(effective.note)
  const mapsUrl = plan.location ? appleMapsUrl(plan.location) : undefined

  const go = (navigate: () => void) =>
    options.go ? options.go(navigate) : navigate()

  const open = () =>
    options.open
      ? options.open(planDetailsParams(item))
      : go(() => navigation.navigate('Plan Details', planDetailsParams(item)))

  const edit = () =>
    options.edit
      ? options.edit(planEditParams(item))
      : go(() => navigation.navigate('PlanDay', planEditParams(item)))

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

  const requestDelete = () =>
    confirmDeletePlan({ recurring: isRecurring, onDelete: removePlan })

  const logAsTime = () => {
    const prefill = {
      date,
      hours: Math.floor(effective.minutes / 60),
      minutes: effective.minutes % 60,
      categoryId: plan.categoryId,
    }
    if (options.logTime) return options.logTime(prefill)
    go(() =>
      navigation.navigate('Add Time', {
        ...prefill,
        date: date.toISOString(),
      })
    )
  }

  const duplicateDay =
    item.type === 'day' ? dateMoment.clone().add(1, 'week') : dateMoment

  const duplicate = () =>
    go(() =>
      navigation.navigate('PlanDay', {
        date: duplicateDay.toISOString(),
        prefill: {
          startTime: effective.anytime
            ? undefined
            : atMinutesOfDay(
                duplicateDay,
                effective.startTimeInMinutes
              ).toISOString(),
          ...(effective.anytime ? { anytime: true } : {}),
          minutes: effective.minutes,
          note: effective.note.note,
          noteDoc: effective.note.noteDoc,
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

      showsTimeEntry && {
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
      !dateMoment.isBefore(moment(), 'day') && {
        id: 'plan_route',
        title: i18n.t('routePlan_homeAction'),
        systemImage: 'point.topleft.down.to.point.bottomright.curvepath',
        onPress: () => go(() => openRouteBuilder(date, plan.id)),
      },
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
      openLinksItem(noteLinks),
      noteText
        ? {
            id: 'copy_note',
            title: i18n.t('copyNote'),
            systemImage: 'doc.on.doc',
            onPress: () => void copyText(noteText),
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
