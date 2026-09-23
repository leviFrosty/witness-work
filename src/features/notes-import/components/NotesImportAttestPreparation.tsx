import { useEffect } from 'react'
import { useNotesImportEnabled } from '@/features/notes-import/hooks/useNotesImportEnabled'
import { prepareNotesImportAppAttestRecovery } from '@/features/notes-import/lib/notesImportAppAttestRuntime'

// Enroll existing keys after an upgrade; first-time users still prepare lazily.
export default function NotesImportAttestPreparation() {
  const enabled = useNotesImportEnabled()
  useEffect(() => {
    if (!enabled) return
    void prepareNotesImportAppAttestRecovery().catch(() => {
      // Best effort. The normal Notes Import path retries through the same module
      // and presents its localized error if enrollment still cannot complete.
    })
  }, [enabled])
  return null
}
