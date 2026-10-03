import { useEffect } from 'react'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import { normalizeTimeEntriesCredit } from '@/lib/categories'

/**
 * Keeps each Time Entry's `credit` flag on its Category's `isCredit`, at launch
 * and after every change to either store: an iCloud merge, a restore, an
 * import, or an entry saved while the Category was out of date. Local and
 * unstamped; see `normalizeTimeEntriesCredit`.
 *
 * Runs a microtask after the change, so writes made together are seen together:
 * the iCloud apply sets entries and Categories one after the other, and the
 * Credit switch flips the Category before restamping its entries, which must
 * still differ then to be stamped.
 */
export function useTimeEntryCreditNormalization(ready: boolean | undefined) {
  useEffect(() => {
    if (!ready) return
    let scheduled = false
    let active = true
    const normalize = () => {
      if (scheduled) return
      scheduled = true
      queueMicrotask(() => {
        scheduled = false
        if (active) normalizeNow()
      })
    }
    const normalizeNow = () => {
      const { serviceReports, set } = useServiceReport.getState()
      const normalized = normalizeTimeEntriesCredit(
        serviceReports,
        useCategories.getState().categories
      )
      if (normalized.changed) set({ serviceReports: normalized.serviceReports })
    }
    const unsubscribeReports = useServiceReport.subscribe((state, previous) => {
      if (state.serviceReports !== previous.serviceReports) normalize()
    })
    const unsubscribeCategories = useCategories.subscribe((state, previous) => {
      if (state.categories !== previous.categories) normalize()
    })
    normalizeNow()
    return () => {
      active = false
      unsubscribeReports()
      unsubscribeCategories()
    }
  }, [ready])
}
