import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'

/**
 * The JSON backup file. Any new stores should be added to this type to be
 * included in the import/export.
 */
export type BackupFile = {
  serviceReportStore?: unknown
  contactStore?: unknown
  conversationStore?: unknown
  preferencesStore?: unknown
}

/** The same backup Settings exports, from the stores' current state. */
export function createBackupFile(): BackupFile {
  return {
    serviceReportStore: useServiceReport.getState(),
    contactStore: useContacts.getState(),
    conversationStore: useConversations.getState(),
    preferencesStore: usePreferences.getState(),
  }
}
