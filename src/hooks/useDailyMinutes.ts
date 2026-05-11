import { useEffect, useMemo } from 'react'
import { flattenDailyMinutes } from '../lib/profileStats'
import useServiceReport from '../stores/serviceReport'
import {
  generateDailyMinutesFingerprint,
  useTimeCache,
} from '../stores/timeCache'

/**
 * Returns a `dateStr → minutes` map covering all reports. Reads from the
 * `useTimeCache.dailyMinutes` slot when the fingerprint matches and writes the
 * freshly flattened result back on a miss, so callers across screens
 * (`HomeScreen`, `ProfileDetailOverlay`) share the same memoized flatten.
 */
const useDailyMinutes = (): Map<string, number> => {
  const { serviceReports } = useServiceReport()
  const setDailyMinutesCache = useTimeCache((s) => s.setDailyMinutesCache)

  const { daily, fingerprint, cacheHit } = useMemo(() => {
    const fp = generateDailyMinutesFingerprint(serviceReports)
    // Imperative read — subscribing would loop the effect below that writes
    // the cache back. Same pattern the consumers used before this hook existed.
    // eslint-disable-next-line react-compiler/react-compiler
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
