import { Trash2 } from 'lucide-react-native'
import { ToolList, ToolRow, ToolSection } from '@/app/navigation/tools/ToolsUI'
import { resetBadgeState } from '@/app/dev-harness/badges'
import { clearScribeLocalData } from '@/app/dev-harness/scribe'
import BuddiesDeleteDataButton from '@/features/buddies/components/BuddiesDeleteDataButton'
import { useSavedPlaces } from '@/features/route-planning/stores/savedPlaces'
import { useSavedRoutes } from '@/features/route-planning/stores/savedRoutes'
import { setScribeMemoryText } from '@/features/scribe/stores/memory'
import { useNotificationsTray } from '@/features/notifications/stores/notificationsTray'
import { clearDevNotifications } from '@/app/notifications/devNotifications'
import confirmDestructive from '@/lib/confirmDestructive'
import i18n from '@/lib/locales'
import useCategories from '@/stores/categories'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { deleteAllMileageData } from '@/stores/mileageWrites'
import usePet from '@/stores/pet'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import { toast } from '@/stores/toasts'

/** Targeted data resets; account-key deletion keeps its existing recovery flow. */
export default function DangerZoneTools() {
  const rows = [
    {
      label: i18n.t('forceDeleteContacts'),
      clear: () => useContacts.getState()._WARNING_forceDeleteContacts(),
    },
    {
      label: i18n.t('clearArchivedContacts'),
      clear: () => useContacts.getState()._WARNING_clearDeleted(),
    },
    {
      label: i18n.t('deleteAllConversations'),
      clear: () =>
        useConversations.getState()._WARNING_forceDeleteConversations(),
    },
    {
      label: i18n.t('deleteReports'),
      clear: () =>
        useServiceReport.getState()._WARNING_forceDeleteServiceReports(),
    },
    {
      label: i18n.t('deleteDayPlans'),
      clear: () => useServiceReport.getState().set({ dayPlans: [] }),
    },
    {
      label: i18n.t('deleteRecurringPlans'),
      clear: () => useServiceReport.getState().set({ recurringPlans: [] }),
    },
    {
      label: i18n.t('toolsDangerZone_categories'),
      description: i18n.t('toolsDangerZone_categoriesBody'),
      clear: () => {
        const store = useCategories.getState()
        for (const category of store.categories)
          store.deleteCategory(category.id)
      },
    },
    {
      label: i18n.t('toolsDangerZone_contactFields'),
      description: i18n.t('toolsDangerZone_contactFieldsBody'),
      clear: () => {
        const store = useContacts.getState()
        for (const field of store.customFieldDefs) {
          store.archiveCustomFieldDef(field.id)
          store.purgeCustomFieldDef(field.id)
        }
      },
    },
    {
      label: i18n.t('toolsDangerZone_visitFields'),
      description: i18n.t('toolsDangerZone_visitFieldsBody'),
      clear: () => {
        const store = useConversations.getState()
        for (const field of store.conversationFieldDefs) {
          store.archiveConversationFieldDef(field.id)
          store.purgeConversationFieldDef(field.id)
        }
      },
    },
    {
      label: i18n.t('toolsDangerZone_contactViews'),
      description: i18n.t('toolsDangerZone_localBody'),
      clear: () =>
        usePreferences.getState().set({
          savedContactViews: {},
          activeSavedContactView: null,
        }),
    },
    {
      label: i18n.t('toolsDangerZone_mileage'),
      description: i18n.t('toolsDangerZone_mileageBody'),
      clear: deleteAllMileageData,
    },
    {
      label: i18n.t('toolsDangerZone_pet'),
      description: i18n.t('toolsDangerZone_petBody'),
      clear: () => usePet.getState().releaseCompanion(),
    },
    {
      label: i18n.t('toolsDangerZone_badges'),
      description: i18n.t('toolsDangerZone_badgesBody'),
      clear: resetBadgeState,
    },
    {
      label: i18n.t('toolsDangerZone_scribe'),
      description: i18n.t('toolsDangerZone_scribeBody'),
      clear: clearScribeLocalData,
    },
    {
      label: i18n.t('toolsDangerZone_memory'),
      description: i18n.t('toolsDangerZone_memoryBody'),
      clear: () => setScribeMemoryText(''),
    },
    {
      label: i18n.t('toolsDangerZone_routes'),
      clear: () => useSavedRoutes.setState({ routes: {} }),
    },
    {
      label: i18n.t('toolsDangerZone_places'),
      clear: () => useSavedPlaces.setState({ places: {} }),
    },
    {
      label: i18n.t('toolsDangerZone_notifications'),
      description: i18n.t('toolsDangerZone_notificationsBody'),
      clear: () => {
        clearDevNotifications()
        useNotificationsTray.setState(
          useNotificationsTray.getInitialState(),
          true
        )
      },
    },
  ]

  return (
    <ToolSection
      title={i18n.t('dangerZone')}
      icon={Trash2}
      tone='destructive'
      info={i18n.t('toolsDangerZone_info')}
    >
      <ToolList>
        {rows.map(({ label, description, clear }) => (
          <ToolRow
            key={label}
            label={label}
            info={description}
            tone='destructive'
            onPress={() =>
              confirmDestructive({
                title: label,
                description: description ?? i18n.t('toolsDangerZone_confirm'),
                onConfirm: () => {
                  clear()
                  toast.success(i18n.t('deleted'))
                },
              })
            }
          />
        ))}
      </ToolList>
      <BuddiesDeleteDataButton />
    </ToolSection>
  )
}
