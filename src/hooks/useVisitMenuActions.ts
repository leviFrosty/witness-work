import { useNavigation } from '@react-navigation/native'
import { useToastController } from '@tamagui/toast'

import type { ContextMenuEntries } from '@/components/ui/ContextMenu'
import { useLinkActions } from '@/components/RichLinkCard'
import { useCopyAction } from '@/components/ui/Copyeable'
import useDismissFollowUp from '@/hooks/useDismissFollowUp'
import confirmDestructive from '@/lib/confirmDestructive'
import { isAppointment } from '@/lib/conversations'
import i18n from '@/lib/locales'
import useConversations from '@/stores/conversationStore'
import type { RootStackNavigation } from '@/types/rootStack'
import type { Visit } from '@/types/visit'

/**
 * Opening a Visit, plus Edit, Reschedule Follow-Up, Open Link, copy, Dismiss
 * Follow-Up, and Delete, wherever it shows: a timeline card (tap, swipe, and
 * long-press menu) and Visit Details' More menu.
 */
export default function useVisitMenuActions(
  visit: Visit,
  options: {
    /** Leaves Edit out, for hosts with their own Edit button. */
    withoutEdit?: boolean
    /** The host is a sheet (Visit Details); forms open over it. */
    overSheet?: boolean
    /** A delete was confirmed and done. */
    onDeleted?: () => void
  } = {}
) {
  const navigation = useNavigation<RootStackNavigation>()
  const toast = useToastController()
  const deleteConversation = useConversations((s) => s.deleteConversation)
  const dismissFollowUp = useDismissFollowUp()
  const copyAction = useCopyAction()
  const { openLinksItem } = useLinkActions()
  const note = visit.note?.trim()
  const topic = visit.followUp?.topic?.trim()
  const appointment = isAppointment(visit)

  const open = () => navigation.navigate('Visit Details', { visitId: visit.id })

  const edit = () =>
    navigation.navigate('Visit Form', {
      contactId: visit.contact.id,
      visitToEditId: visit.id,
      notAtHome: visit.notAtHome,
      overSheet: options.overSheet,
    })

  const reschedule = () =>
    navigation.navigate('RescheduleVisit', {
      contactId: visit.contact.id,
      visitId: visit.id,
    })

  const requestDelete = () =>
    confirmDestructive({
      title: i18n.t('deleteConversation'),
      description: i18n.t('deleteConversation_description'),
      onConfirm: () => {
        deleteConversation(visit.id)
        toast.show(i18n.t('success'), {
          message: i18n.t('deleted'),
          native: true,
        })
        options.onDeleted?.()
      },
    })

  const menu: ContextMenuEntries = [
    [
      !options.withoutEdit && {
        id: 'edit',
        title: i18n.t('edit'),
        systemImage: 'pencil',
        onPress: edit,
      },
      appointment && {
        id: 'reschedule_follow_up',
        title: i18n.t('rescheduleFollowUp'),
        systemImage: 'calendar.badge.clock',
        onPress: reschedule,
      },
      openLinksItem(note),
      !!note &&
        copyAction(note, { id: 'copy_note', title: i18n.t('copyNote') }),
      !!topic &&
        copyAction(topic, { id: 'copy_topic', title: i18n.t('copyTopic') }),
    ],
    [
      appointment && {
        id: 'dismiss_follow_up',
        title: i18n.t('dismissFollowUpAction'),
        systemImage: 'bell.slash',
        onPress: () => dismissFollowUp(visit),
      },
      {
        id: 'delete',
        title: i18n.t('delete'),
        systemImage: 'trash',
        destructive: true,
        onPress: requestDelete,
      },
    ],
  ]

  return { open, edit, reschedule, requestDelete, menu }
}
