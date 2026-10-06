import { useEffect, useState } from 'react'
import {
  appendCapturedText,
  inputMethodFor,
  type NotesImportCaptureMethod,
} from '@/features/notes-import/lib/notesImportCapture'
import { useNotesImportVoiceLog } from '@/features/notes-import/hooks/useNotesImportVoiceLog'
import { useNotesImportPhotoImport } from '@/features/notes-import/hooks/useNotesImportPhotoImport'

/**
 * The composer's capture inputs (ADR 0018). Voice logs and photos become text
 * on the device and land in the draft, where the user edits them like typed
 * notes before sending. Remembers which captures fed the current draft so the
 * submitted import is attributed in analytics.
 */
export function useNotesImportCapture({
  draft,
  setDraft,
  onInserted,
}: {
  draft: string
  setDraft: (update: (draft: string) => string) => void
  /** Called after captured text lands, e.g. to focus the input for edits. */
  onInserted: () => void
}) {
  const [captures, setCaptures] = useState<NotesImportCaptureMethod[]>([])

  const insert = (method: NotesImportCaptureMethod) => (text: string) => {
    setDraft((current) => appendCapturedText(current, text))
    setCaptures((current) => [...current, method])
    onInserted()
  }

  const voice = useNotesImportVoiceLog({ onTranscript: insert('voice') })
  const photo = useNotesImportPhotoImport({ onText: insert('photo') })

  // Clearing the draft (sent, deleted, or swapped for another import) starts
  // a fresh attribution.
  const draftEmpty = !draft.trim()
  useEffect(() => {
    if (draftEmpty) setCaptures((current) => (current.length ? [] : current))
  }, [draftEmpty])

  const recording = voice.phase !== 'idle'

  return {
    voice,
    photo,
    /** A capture owns the composer: typing and sending wait for it. */
    busy: recording || photo.reading,
    /** The draft as shown: live transcript appended while recording. */
    displayDraft: recording
      ? appendCapturedText(draft, voice.transcript)
      : draft,
    inputMethod: inputMethodFor(captures),
  }
}
