import { useNavigation } from '@react-navigation/native'
import {
  type NoteEditorOptions,
  startNoteEditorSession,
} from '@/lib/richText/noteEditorSession'
import type { RootStackNavigation } from '@/types/rootStack'

export function useOpenNoteEditor() {
  const navigation = useNavigation<RootStackNavigation>()
  return (options: NoteEditorOptions) => {
    navigation.navigate('NoteEditor', {
      sessionId: startNoteEditorSession(options),
    })
  }
}
