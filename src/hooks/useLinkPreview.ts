import { useEffect, useState } from 'react'
import { Image, type ImageRef } from 'expo-image'
import {
  fetchLinkPreview,
  getCachedLinkPreview,
  LinkPreview,
} from '@/lib/linkPreview'
import { hasCapability } from '@/lib/platformCapabilities'
import { usePreferences } from '@/stores/preferences'

type FetchedResult = { url: string; preview: LinkPreview | null }

export type LinkPreviewImage = { uri: string } | ImageRef

export type LinkPreviewState = {
  preview: LinkPreview | null
  loading: boolean

  needsConsent: boolean

  load: () => void

  image: LinkPreviewImage | undefined
}

export function useLinkPreview(url: string): LinkPreviewState {
  const dataProtectionMode = usePreferences((s) => s.dataProtectionMode)
  const [requested, setRequested] = useState<string | null>(null)
  const [fetched, setFetched] = useState<FetchedResult | null>(null)
  const cached = getCachedLinkPreview(url)
  const hasFetched = fetched?.url === url
  const mayFetch = !dataProtectionMode || requested === url

  useEffect(() => {
    if (!mayFetch || getCachedLinkPreview(url)) return
    let active = true
    fetchLinkPreview(url).then((preview) => {
      if (active) setFetched({ url, preview })
    })
    return () => {
      active = false
    }
  }, [url, mayFetch])

  const known = hasFetched || !!cached
  const preview = hasFetched ? fetched.preview : (cached?.preview ?? null)
  const image = usePreviewImage(preview?.imageUrl, mayFetch)

  return {
    preview,
    loading: !known && mayFetch,
    needsConsent: !known && !mayFetch && hasCapability('linkPreviews'),
    load: () => setRequested(url),
    image,
  }
}

type CachedImage = { url: string; ref: ImageRef | null }

function usePreviewImage(
  imageUrl: string | undefined,
  mayFetch: boolean
): LinkPreviewImage | undefined {
  const [cached, setCached] = useState<CachedImage | null>(null)
  const cacheOnly = !!imageUrl && !mayFetch

  useEffect(() => {
    if (!cacheOnly || !imageUrl) return
    let active = true
    const settle = (ref: ImageRef | null) => {
      if (active) setCached({ url: imageUrl, ref })
    }
    Image.readFromCacheAsync(imageUrl).then(settle, () => settle(null))
    return () => {
      active = false
    }
  }, [imageUrl, cacheOnly])

  if (!imageUrl) return undefined
  if (!cacheOnly) return { uri: imageUrl }
  return cached?.url === imageUrl ? (cached.ref ?? undefined) : undefined
}

export default useLinkPreview
