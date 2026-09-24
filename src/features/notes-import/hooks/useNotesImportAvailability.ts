import { useFeatureFlag } from '@/lib/featureFlags'
import { useEffect, useState } from 'react'
import Constants from 'expo-constants'
import { create } from 'zustand'
import { getNotesImportStatus } from '@/features/notes-import/lib/notesImportClient'
import type { NotesImportPublicSchedule } from '@/features/notes-import/lib/notesImportUsage'
import {
  notesImportUpdateRequired,
  type NotesImportUpdateRequired,
} from '@/features/notes-import/lib/notesImportVersionGate'

export interface NotesImportAvailability {
  /** True only after both the feature flag and availability probe succeed. */
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

const STATUS_FRESHNESS_MS = 30_000
let freshUntil = 0
let inFlight: Promise<void> | null = null

/**
 * Session-only status state. Nothing here is persisted: Help and Paywall may
 * make explicit allowance claims only from a fresh available response received
 * since this JS session started. Consumers share one pending request and reuse
 * valid results for 30 seconds from request start; this does not poll in the
 * background. The API may additionally reuse its public hint for 30 seconds.
 */
const useAvailabilityStore = create<AvailabilityStore>((set) => ({
  available: false,
  reason: null,
  schedule: null,
  updateRequired: null,
  loading: true,

  probe: () => {
    if (inFlight) return inFlight
    if (Date.now() < freshUntil) return Promise.resolve()
    const startedAt = Date.now()
    const refresh = async () => {
      // Access and schedule claims remain closed while a fresh probe is pending.
      set({
        available: false,
        reason: null,
        schedule: null,
        updateRequired: null,
        loading: true,
      })
      const status = await getNotesImportStatus().catch(() => null)
      // Anchor freshness to request start, so slow responses do not extend it.
      // Failed/degraded probes are retried by the next consumer.
      freshUntil =
        status && (!status.available || status.limits)
          ? startedAt + STATUS_FRESHNESS_MS
          : 0

      if (!status) {
        set({
          available: false,
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
    }
    inFlight = refresh().finally(() => {
      inFlight = null
    })
    return inFlight
  },
}))

/**
 * Probes Notes Import availability and shares only this session's latest valid
 * schedule. Failed or pending probes keep access closed.
 */
export const useNotesImportAvailability = (): NotesImportAvailability => {
  const enabled = useFeatureFlag('notes-import')
  const [hasFreshProbe, setHasFreshProbe] = useState(
    () => Date.now() < freshUntil
  )
  const available = useAvailabilityStore((state) => state.available)
  const reason = useAvailabilityStore((state) => state.reason)
  const schedule = useAvailabilityStore((state) => state.schedule)
  const updateRequired = useAvailabilityStore((state) => state.updateRequired)
  const loading = useAvailabilityStore((state) => state.loading)
  const probe = useAvailabilityStore((state) => state.probe)

  useEffect(() => {
    let mounted = true
    setHasFreshProbe(Date.now() < freshUntil)
    if (!enabled) return
    void probe().finally(() => {
      if (mounted) setHasFreshProbe(true)
    })
    return () => {
      mounted = false
    }
  }, [probe, enabled])

  const pending = !hasFreshProbe || loading
  return {
    available: enabled && !pending && available,
    reason: pending ? null : reason,
    schedule: !enabled || pending ? null : schedule,
    updateRequired: pending ? null : updateRequired,
    loading: pending,
  }
}
