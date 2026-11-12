import { useNavigation } from '@react-navigation/native'
import type { RootStackNavigation } from '@/types/rootStack'
import {
  readTerritoryNotesWithScribe,
  useScribeAvailability,
  useScribeOffered,
} from '@/features/scribe'
import { appLocale } from '@/features/scribe/lib/locale'
import { scribeConsentPending } from '@/features/scribe/stores/consent'
import type { NotesAi } from '@/features/territories/lib/scribeNotes'
import { notesAiMode } from '@/app/territories/notesAiMode'

export default function useTerritoryNotesScribe(): NotesAi {
  const navigation = useNavigation<RootStackNavigation>()
  const offered = useScribeOffered()
  const availability = useScribeAvailability()

  return {
    mode: notesAiMode(offered, availability),
    read: async (request, signal) => {
      if (scribeConsentPending()) {
        navigation.navigate('ScribeConsent', { mode: 'open' })
        return { status: 'consent' }
      }
      const outcome = await readTerritoryNotesWithScribe(
        { ...request, locale: appLocale() },
        signal
      )
      return outcome.status === 'read'
        ? { status: 'read', answer: outcome.result }
        : outcome
    },
  }
}
