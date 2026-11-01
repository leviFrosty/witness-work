import useServiceReport from '@/stores/serviceReport'
import type { TimeEntry } from '@/types/timeEntry'

export const addRolloverEntries = (entries: TimeEntry[]): void => {
  useServiceReport.getState().addServiceReports(entries)
}
