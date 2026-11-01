import { useEffect, useMemo } from 'react'
import { flattenDailyMinutes } from '@/features/profile/lib/profileStats'
import useServiceReport from '@/stores/serviceReport'
import {
  generateDailyMinutesFingerprint,
  useTimeCache,
} from '@/stores/timeCache'

const useDailyMinutes = (): Map<string, number> => {
  const { serviceReports } = useServiceReport()
  const setDailyMinutesCache = useTimeCache((s) => s.setDailyMinutesCache)

  const { daily, fingerprint, cacheHit } = useMemo(() => {
    const fp = generateDailyMinutesFingerprint(serviceReports)

    const cached = useTimeCache.getState().dailyMinutes
    if (cached && cached.fingerprint === fp) {
      return {
        daily: new Map(Object.entries(cached.daily)),
        fingerprint: fp,
        cacheHit: true,
      }
    }
    return {
      daily: flattenDailyMinutes(serviceReports),
      fingerprint: fp,
      cacheHit: false,
    }
  }, [serviceReports])

  useEffect(() => {
    if (cacheHit) return
    const obj: Record<string, number> = {}
    daily.forEach((v, k) => {
      obj[k] = v
    })
    setDailyMinutesCache(obj, fingerprint)
  }, [cacheHit, daily, fingerprint, setDailyMinutesCache])

  return daily
}

export default useDailyMinutes
