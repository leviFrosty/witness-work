import { useEffect, useState } from 'react'
import {
  appendCapturedText,
  inputMethodFor,
  type NotesImportCaptureMethod,
} from '@/features/notes-import/lib/notesImportCapture'
import { useNotesImportVoiceLog } from '@/features/notes-import/hooks/useNotesImportVoiceLog'
import { useNotesImportPhotoImport } from '@/features/notes-import/hooks/useNotesImportPhotoImport'
import { useNotesImportPaperImport } from '@/features/notes-import/hooks/useNotesImportPaperImport'

/**
 * The composer's capture inputs. Voice logs and scanned pages become text on
 * the device (ADR 0018); chosen page photos are read by ww-api (Import from
 * Paper, ADR 0025). Either way the text lands in the draft, where the user
 * edits it like typed notes before sending. Remembers which captures fed the
 * current draft so the submitted import is attributed in analytics.
 */
export function useNotesImportCapture({
  draft,
  setDraft,
  onInserted,
  paperMaxPages,
  onPaperLimitReached,
}: {
  draft: string
  setDraft: (update: (draft: string) => string) => void
  /** Called after captured text lands, e.g. to focus the input for edits. */
  onInserted: () => void
  /** Pages per Import from Paper batch, or null when ww-api can't read them. */
  paperMaxPages: number | null
  onPaperLimitReached: () => void
}) {
  const [captures, setCaptures] = useState<NotesImportCaptureMethod[]>([])

  const insert = (method: NotesImportCaptureMethod) => (text: string) => {
    setDraft((current) => appendCapturedText(current, text))
    setCaptures((current) => [...current, method])
    onInserted()
  }

  const voice = useNotesImportVoiceLog({ onTranscript: insert('voice') })
  const photo = useNotesImportPhotoImport({ onText: insert('photo') })
  const paper = useNotesImportPaperImport({
    maxPages: paperMaxPages,
    onText: insert('paper'),
    onLimitReached: onPaperLimitReached,
  })

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
    paper,
    /** A capture owns the composer: typing and sending wait for it. */
    busy: recording || photo.reading || paper.reading,
    /** The draft as shown: live transcript appended while recording. */
    displayDraft: recording
      ? appendCapturedText(draft, voice.transcript)
      : draft,
    inputMethod: inputMethodFor(captures),
  }
}
