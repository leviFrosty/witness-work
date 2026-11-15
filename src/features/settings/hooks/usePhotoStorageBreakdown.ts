import { useEffect } from 'react'
import { create } from 'zustand'
import {
  loadPhotoStorageBreakdown,
  type PhotoStorageBreakdown,
} from '@/app/sync/photoStorage'
import { logger } from '@/lib/logger'

type BreakdownState = {
  breakdown: PhotoStorageBreakdown | null
  loading: boolean
  failed: boolean
}

const useBreakdownStore = create<BreakdownState>(() => ({
  breakdown: null,
  loading: false,
  failed: false,
}))

let latest = 0

export function reloadPhotoStorageBreakdown(): Promise<void> {
  const run = ++latest
  useBreakdownStore.setState({ loading: true })
  return loadPhotoStorageBreakdown()
    .then((breakdown) => {
      if (run !== latest) return
      useBreakdownStore.setState({ breakdown, loading: false, failed: false })
    })
    .catch((error: unknown) => {
      if (run !== latest) return
      logger.warn('[photoStorage] listing photos failed', error)
      useBreakdownStore.setState({ loading: false, failed: true })
    })
}

export default function usePhotoStorageBreakdown(shown: boolean) {
  const state = useBreakdownStore()
  useEffect(() => {
    if (shown) void reloadPhotoStorageBreakdown()
  }, [shown])
  return { ...state, reload: reloadPhotoStorageBreakdown }
}
