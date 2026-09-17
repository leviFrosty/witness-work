import { useEffect } from 'react'
import { useFeatureFlag } from '@/lib/featureFlags'
import { prepareNotesImportAppAttestRecovery } from '@/features/notes-import/lib/notesImportAppAttestRuntime'

// Enroll existing keys after an upgrade; first-time users still prepare lazily.
export default function NotesImportAttestPreparation() {
  const enabled = useFeatureFlag('notes-import')
  useEffect(() => {
    if (!enabled) return
    void prepareNotesImportAppAttestRecovery().catch(() => {
      // Best effort. The normal Notes Import path retries through the same module
      // and presents its localized error if enrollment still cannot complete.
    })
  }, [enabled])
  return null
}
