import useServiceReport from '@/stores/serviceReport'
import { restampOverTombstones } from '@/features/service-reports/lib/rollover'
import type { TimeEntry } from '@/types/timeEntry'

/**
 * Stores the entries `applyRollover` built. Re-applying after Undo reuses the
 * undone pair's deterministic ids, so those entries are then re-stamped newer
 * than their tombstones (`restampOverTombstones`).
 */
export const addRolloverEntries = (entries: TimeEntry[]): void => {
  const { addServiceReport } = useServiceReport.getState()
  entries.forEach((entry) => addServiceReport(entry))
  const { serviceReports, deletedServiceReports, set } =
    useServiceReport.getState()
  const restamped = restampOverTombstones({
    serviceReports,
    ids: entries.map((entry) => entry.id),
    tombstones: deletedServiceReports,
  })
  if (restamped.changed) set({ serviceReports: restamped.serviceReports })
}
