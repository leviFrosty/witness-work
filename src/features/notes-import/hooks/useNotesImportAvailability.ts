import { useEffect, useState } from 'react'
import { getNotesImportStatus } from '@/features/notes-import/lib/notesImportClient'

interface NotesImportAvailability {
  /** False only once the proxy definitively reports the feature is down. */
  available: boolean
  /**
   * Why it's down — a machine code or operator-supplied detail text. Null while
   * available or before the probe resolves. See
   * {@link NotesImportStatus.reason}.
   */
  reason: string | null
  loading: boolean
}

/**
 * Probes Notes Import availability so an entry point can disable itself when
 * the service can't run (manually disabled, or no healthy ZDR provider).
 * Optimistic by default — `available` starts true and only flips false on a
 * definitive `{ available: false }` from the proxy, so the button never
 * flickers disabled while the probe is in flight and a failed probe leaves it
 * enabled (fail open).
 */
export const useNotesImportAvailability = (): NotesImportAvailability => {
  const [available, setAvailable] = useState(true)
  const [reason, setReason] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getNotesImportStatus()
      .then((status) => {
        if (cancelled) return
        setAvailable(status.available)
        setReason(status.reason ?? null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { available, reason, loading }
}
