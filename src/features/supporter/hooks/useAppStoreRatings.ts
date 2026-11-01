import { useEffect, useState } from 'react'
import {
  getAppStoreRatings,
  refreshAppStoreRatingsIfStale,
  type AppStoreRatings,
} from '@/features/supporter/lib/appStoreRatings'

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
