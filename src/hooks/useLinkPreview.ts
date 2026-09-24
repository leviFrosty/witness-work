import { useEffect, useState } from 'react'
import {
  fetchLinkPreview,
  getCachedLinkPreview,
  LinkPreview,
} from '@/lib/linkPreview'

type FetchedResult = { url: string; preview: LinkPreview | null }

/**
 * OpenGraph preview for `url`. Reads the MMKV cache synchronously so cached
 * links render their card on first paint; otherwise fetches in the background.
 */
export function useLinkPreview(url: string): {
  preview: LinkPreview | null
  loading: boolean
} {
  const [fetched, setFetched] = useState<FetchedResult | null>(null)
  const cached = getCachedLinkPreview(url)
  const hasFetched = fetched?.url === url

  useEffect(() => {
    if (getCachedLinkPreview(url)) return
    let active = true
    fetchLinkPreview(url).then((preview) => {
      if (active) setFetched({ url, preview })
    })
    return () => {
      active = false
    }
  }, [url])

  if (hasFetched) return { preview: fetched.preview, loading: false }
  if (cached) return { preview: cached.preview, loading: false }
  return { preview: null, loading: true }
}

export default useLinkPreview
