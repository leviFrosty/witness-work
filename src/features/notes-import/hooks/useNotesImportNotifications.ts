import { Sparkles as SparklesIcon } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import i18n from '@/lib/locales'
import type { NotificationItem } from '@/types/notifications'
import type { RootStackNavigation } from '@/types/rootStack'
import { useNotesImportEnabled } from '@/features/notes-import/hooks/useNotesImportEnabled'
import { useNotesImportManager } from '@/features/notes-import/hooks/useNotesImportManager'
import { isUnviewedReady } from '@/features/notes-import/lib/notesImportLedger'

/**
 * One tray item per Notes Import whose result is ready and not yet opened. A
 * refinement's re-parse is a new occurrence.
 */
export default function useNotesImportNotifications(): NotificationItem[] {
  const navigation = useNavigation<RootStackNavigation>()
  const enabled = useNotesImportEnabled()
  const entries = useNotesImportManager((s) => s.entries)
  if (!enabled) return []

  return entries.filter(isUnviewedReady).map((entry) => ({
    id: `notes_import:${entry.hash}:${entry.parsedAt ?? entry.createdAt}`,
    kind: 'notes_import',
    at: entry.parsedAt ?? entry.createdAt,
    icon: SparklesIcon,
    title: i18n.t('notesImport_chatReadyTitle'),
    description: entry.summary || entry.provisionalTitle,
    actions: [
      {
        id: 'review',
        label: i18n.t('notifications_review'),
        onPress: () =>
          navigation.navigate('NotesImportComposer', { hash: entry.hash }),
      },
    ],
  }))
}
