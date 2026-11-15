import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/preferences', async () => {
  const { create } = await import('zustand')
  return {
    usePreferences: create(() => ({ optimizePhotoStorage: false })),
  }
})
import {
  avatarPhotoEncoding,
  notePhotoEncoding,
  resizeToFit,
} from '@/lib/photoEncoding'
import { usePreferences } from '@/stores/preferences'

afterEach(() => usePreferences.setState({ optimizePhotoStorage: false }))

describe('photo encoding', () => {
  it('keeps the usual sizes until Optimize Photo Storage is on', () => {
    expect(notePhotoEncoding()).toMatchObject({ maxSide: 2048, quality: 0.8 })
    expect(avatarPhotoEncoding()).toMatchObject({ maxSide: null, quality: 0.9 })
  })

  it('saves smaller photos when it is on', () => {
    usePreferences.setState({ optimizePhotoStorage: true })
    expect(notePhotoEncoding()).toMatchObject({ maxSide: 1280, quality: 0.6 })
    expect(avatarPhotoEncoding()).toMatchObject({ maxSide: 768, quality: 0.7 })
  })

  it('resizes only past the longest side', () => {
    expect(resizeToFit({ width: 4000, height: 3000 }, 1280)).toEqual({
      width: 1280,
    })
    expect(resizeToFit({ width: 3000, height: 4000 }, 1280)).toEqual({
      height: 1280,
    })
    expect(resizeToFit({ width: 800, height: 600 }, 1280)).toBeNull()
    expect(resizeToFit({ width: 4000, height: 3000 }, null)).toBeNull()
  })
})
