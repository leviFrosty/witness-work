import { useEffect, useState } from 'react'
import Constants from 'expo-constants'
import { create } from 'zustand'
import { beginStartupWork } from '@/lib/deferUntilNotBlocking'
import { getNotesImportStatus } from '@/features/notes-import/lib/notesImportClient'
import type { NotesImportPublicSchedule } from '@/features/notes-import/lib/notesImportUsage'
import {
  notesImportUpdateRequired,
  type NotesImportUpdateRequired,
} from '@/features/notes-import/lib/notesImportVersionGate'

export interface NotesImportAvailability {
  /** False only once the proxy definitively reports the feature is down. */
  available: boolean
  /** Operator detail for an explicit unavailable response. */
  reason: string | null
  /** Fresh public allowance schedule held in memory for this app session only. */
  schedule: NotesImportPublicSchedule | null
  /**
   * Set when this build is below the proxy's advertised minimum app version.
   * `available` is false and `reason` is `'version_below_min'` in that case.
   */
  updateRequired: NotesImportUpdateRequired | null
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
  updateRequired: null,
  loading: true,

  probe: async () => {
    const finishStartup = beginStartupWork()
    const probe = ++latestProbe
    // Access remains fail-open, but schedule claims disappear while this fresh
    // probe is pending (including when another surface mounts later).
    set({
      available: true,
      reason: null,
      schedule: null,
      updateRequired: null,
      loading: true,
    })
    const status = await getNotesImportStatus()
      .catch(() => null)
      .finally(finishStartup)
    if (probe !== latestProbe) return

    if (!status) {
      set({
        available: true,
        reason: null,
        schedule: null,
        updateRequired: null,
        loading: false,
      })
      return
    }
    // The version floor wins over every other state: it is the one condition
    // the user can resolve themselves, and an update is required regardless of
    // whether the proxy is also down right now.
    const updateRequired = notesImportUpdateRequired(
      Constants.expoConfig?.version,
      status.minAppVersion
    )
    if (updateRequired) {
      set({
        available: false,
        reason: 'version_below_min',
        schedule: null,
        updateRequired,
        loading: false,
      })
      return
    }
    if (!status.available) {
      set({
        available: false,
        reason: status.reason ?? null,
        schedule: null,
        updateRequired: null,
        loading: false,
      })
      return
    }
    set({
      available: true,
      reason: null,
      schedule: status.limits,
      updateRequired: null,
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
  const updateRequired = useAvailabilityStore((state) => state.updateRequired)
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
    updateRequired: pending ? null : updateRequired,
    loading: pending,
  }
}
