import { useEffect, useState } from 'react'
import {
  getAppStoreRatings,
  refreshAppStoreRatingsIfStale,
  type AppStoreRatings,
} from '@/features/supporter/lib/appStoreRatings'

/**
 * Persisted App Store ratings (or the bundled snapshot), refreshed in the
 * background when the stored copy is a week old.
 */
export const useAppStoreRatings = (): AppStoreRatings => {
  const [ratings, setRatings] = useState(getAppStoreRatings)
  useEffect(() => {
    let active = true
    void refreshAppStoreRatingsIfStale().then((fresh) => {
      if (active && fresh) setRatings(fresh)
    })
    return () => {
      active = false
    }
  }, [])
  return ratings
}
