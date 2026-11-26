import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { LinkPreview } from '@/lib/linkPreview'

const runtime = vi.hoisted(() => ({ platform: 'ios' }))
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return runtime.platform
    },
  },
}))

const cache = vi.hoisted(() => new Map<string, LinkPreview | null>())
const fetchLinkPreview = vi.hoisted(() =>
  vi.fn(async (url: string): Promise<LinkPreview | null> => {
    const preview = { title: 'Page', imageUrl: `${url}/og.png` }
    cache.set(url, preview)
    return preview
  })
)
vi.mock('@/lib/linkPreview', () => ({
  fetchLinkPreview,
  getCachedLinkPreview: (url: string) =>
    cache.has(url) ? { preview: cache.get(url) ?? null } : undefined,
}))

const cachedImageRef = vi.hoisted(() => ({ ref: 'cached-image-ref' }))
const readFromCacheAsync = vi.hoisted(() =>
  vi.fn(async (_key: string): Promise<unknown> => cachedImageRef)
)
vi.mock('expo-image', () => ({ Image: { readFromCacheAsync } }))

vi.mock('@/stores/preferences', async () => ({
  usePreferences: (await import('zustand')).create(() => ({
    dataProtectionMode: false,
  })),
}))

import { usePreferences } from '@/stores/preferences'
import { useLinkPreview, type LinkPreviewState } from './useLinkPreview'

const URL = 'https://example.test/article'

const Harness = ({
  url,
  onResult,
}: {
  url: string
  onResult: (state: LinkPreviewState) => void
}) => {
  onResult(useLinkPreview(url))
  return null
}

let latest: LinkPreviewState
let renderer: ReactTestRenderer | undefined
const render = async () => {
  await act(async () => {
    renderer = create(
      <Harness url={URL} onResult={(state) => (latest = state)} />
    )
  })
}

beforeEach(() => {
  cache.clear()
  fetchLinkPreview.mockClear()
  readFromCacheAsync.mockClear()
  readFromCacheAsync.mockResolvedValue(cachedImageRef)
  runtime.platform = 'ios'
  usePreferences.setState({ dataProtectionMode: false })
})

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

it('loads the preview and its image on its own with data protection off', async () => {
  await render()
  expect(fetchLinkPreview).toHaveBeenCalledWith(URL)
  expect(latest).toMatchObject({
    preview: { title: 'Page' },
    loading: false,
    needsConsent: false,
    image: { uri: `${URL}/og.png` },
  })
})

it('fetches nothing in data protection mode until the User asks', async () => {
  usePreferences.setState({ dataProtectionMode: true })
  await render()
  expect(fetchLinkPreview).not.toHaveBeenCalled()
  expect(readFromCacheAsync).not.toHaveBeenCalled()
  expect(latest).toMatchObject({
    preview: null,
    loading: false,
    needsConsent: true,
    image: undefined,
  })

  await act(async () => latest.load())
  expect(fetchLinkPreview).toHaveBeenCalledTimes(1)
  expect(latest).toMatchObject({
    preview: { title: 'Page' },
    needsConsent: false,
    image: { uri: `${URL}/og.png` },
  })
})

it('shows a cached preview in data protection mode with its image from the cache only', async () => {
  cache.set(URL, { title: 'Cached', imageUrl: `${URL}/og.png` })
  usePreferences.setState({ dataProtectionMode: true })
  await render()
  expect(fetchLinkPreview).not.toHaveBeenCalled()
  expect(readFromCacheAsync).toHaveBeenCalledWith(`${URL}/og.png`)
  expect(latest).toMatchObject({
    preview: { title: 'Cached' },
    needsConsent: false,
    image: cachedImageRef,
  })
})

it('leaves out an image that is no longer cached in data protection mode', async () => {
  cache.set(URL, { title: 'Cached', imageUrl: `${URL}/og.png` })
  readFromCacheAsync.mockResolvedValue(null)
  usePreferences.setState({ dataProtectionMode: true })
  await render()
  expect(latest.preview?.title).toBe('Cached')
  expect(latest.image).toBeUndefined()
})

it('keeps a loaded preview when data protection mode turns on', async () => {
  await render()
  await act(async () => {
    usePreferences.setState({ dataProtectionMode: true })
  })
  expect(fetchLinkPreview).toHaveBeenCalledTimes(1)
  expect(latest).toMatchObject({
    preview: { title: 'Page' },
    needsConsent: false,
    image: cachedImageRef,
  })
})

it('offers no load button on the web, which never fetches previews', async () => {
  runtime.platform = 'web'
  usePreferences.setState({ dataProtectionMode: true })
  await render()
  expect(fetchLinkPreview).not.toHaveBeenCalled()
  expect(latest).toMatchObject({
    preview: null,
    loading: false,
    needsConsent: false,
  })
})
