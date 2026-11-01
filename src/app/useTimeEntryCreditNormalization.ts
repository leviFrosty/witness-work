import { useEffect } from 'react'
import useServiceReport from '@/stores/serviceReport'
import useCategories from '@/stores/categories'
import { normalizeTimeEntriesCredit } from '@/lib/categories'

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
