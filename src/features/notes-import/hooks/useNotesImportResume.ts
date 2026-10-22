import { useEffect } from 'react'
import { addReconnectListener } from '@/lib/http/online'
import { useNotesImportEnabled } from '@/hooks/useNotesImportEnabled'
import { useNotesImportManager } from '@/features/notes-import/hooks/useNotesImportManager'

export function useNotesImportResume() {
  const enabled = useNotesImportEnabled()

  // Flag initialization refreshes on foreground/reconnect; resume only once visible.
  useEffect(() => {
    if (enabled) useNotesImportManager.getState().appBecameActive()
  }, [enabled])

  // An import that stopped for a lost connection goes on when it's back.
  useEffect(() => {
    if (!enabled) return
    const reconnect = addReconnectListener(() =>
      useNotesImportManager.getState().reconnected()
    )
    return () => reconnect.remove()
  }, [enabled])
}
