import { useEffect } from 'react'
import { useNotesImportEnabled } from '@/features/notes-import/hooks/useNotesImportEnabled'
import { useNotesImportManager } from '@/features/notes-import/hooks/useNotesImportManager'

export function useNotesImportResume() {
  const enabled = useNotesImportEnabled()

  // Flag initialization refreshes on foreground/reconnect; resume only once visible.
  useEffect(() => {
    if (enabled) useNotesImportManager.getState().appBecameActive()
  }, [enabled])
}
