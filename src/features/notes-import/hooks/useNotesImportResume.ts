import { useEffect } from 'react'
import { useFeatureFlag } from '@/lib/featureFlags'
import { useNotesImportManager } from '@/features/notes-import/hooks/useNotesImportManager'

export function useNotesImportResume() {
  const enabled = useFeatureFlag('notes-import')

  // Flag initialization refreshes on foreground/reconnect; resume only once visible.
  useEffect(() => {
    if (enabled) useNotesImportManager.getState().appBecameActive()
  }, [enabled])
}
