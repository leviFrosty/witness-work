import useServiceReport from '@/stores/serviceReport'
import type { TimeEntry } from '@/types/timeEntry'

/**
 * Stores the entries `applyRollover` built. Re-applying after Undo reuses the
 * undone pair's deterministic ids; the store stamps those entries past their
 * tombstones.
 */
export const addRolloverEntries = (entries: TimeEntry[]): void => {
  useServiceReport.getState().addServiceReports(entries)
}
