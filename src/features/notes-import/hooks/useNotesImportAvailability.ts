import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { getNotesImportStatus } from '@/features/notes-import/lib/notesImportClient'
import type { NotesImportPublicSchedule } from '@/features/notes-import/lib/notesImportUsage'

export interface NotesImportAvailability {
  /** False only once the proxy definitively reports the feature is down. */
  available: boolean
  /** Operator detail for an explicit unavailable response. */
  reason: string | null
  /** Fresh public allowance schedule held in memory for this app session only. */
  schedule: NotesImportPublicSchedule | null
  loading: boolean
}

interface AvailabilityStore extends NotesImportAvailability {
  probe: () => Promise<void>
}

let latestProbe = 0

/**
 * Session-only status state. Nothing here is persisted: Help and Paywall may
 * make explicit allowance claims only from a fresh available response received
 * since this JS session started.
 */
const useAvailabilityStore = create<AvailabilityStore>((set) => ({
  available: true,
  reason: null,
  schedule: null,
  loading: true,

  probe: async () => {
    const probe = ++latestProbe
    // Access remains fail-open, but schedule claims disappear while this fresh
    // probe is pending (including when another surface mounts later).
    set({ available: true, reason: null, schedule: null, loading: true })
    const status = await getNotesImportStatus().catch(() => null)
    if (probe !== latestProbe) return

    if (!status) {
      set({ available: true, reason: null, schedule: null, loading: false })
      return
    }
    if (!status.available) {
      set({
        available: false,
        reason: status.reason ?? null,
        schedule: null,
        loading: false,
      })
      return
    }
    set({
      available: true,
      reason: null,
      schedule: status.limits,
      loading: false,
    })
  },
}))

/**
 * Probes Notes Import availability and shares only this session's latest valid
 * schedule. A failed probe never blocks an import attempt, but it does hide all
 * schedule-specific Help/Paywall copy.
 */
export const useNotesImportAvailability = (): NotesImportAvailability => {
  const [hasFreshProbe, setHasFreshProbe] = useState(false)
  const available = useAvailabilityStore((state) => state.available)
  const reason = useAvailabilityStore((state) => state.reason)
  const schedule = useAvailabilityStore((state) => state.schedule)
  const loading = useAvailabilityStore((state) => state.loading)
  const probe = useAvailabilityStore((state) => state.probe)

  useEffect(() => {
    let mounted = true
    setHasFreshProbe(false)
    void probe().finally(() => {
      if (mounted) setHasFreshProbe(true)
    })
    return () => {
      mounted = false
    }
  }, [probe])

  const pending = !hasFreshProbe || loading
  return {
    available: pending ? true : available,
    reason: pending ? null : reason,
    schedule: pending ? null : schedule,
    loading: pending,
  }
}
