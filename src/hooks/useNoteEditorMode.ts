import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import { hasCapability } from '@/lib/platformCapabilities'
import {
  noteEditorMode,
  type NoteEditorMode,
} from '@/lib/richText/noteEditorMode'

export default function useNoteEditorMode(): NoteEditorMode {
  return noteEditorMode(useAdaptiveLayout(), hasCapability('inlineNoteEditor'))
}
