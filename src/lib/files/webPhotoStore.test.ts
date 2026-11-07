import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteWebPhoto,
  getWebPhotoBlob,
  getWebPhotoUrl,
  hasWebPhoto,
  listWebPhotos,
  putWebPhoto,
} from './webPhotoStore'

describe('webPhotoStore', () => {
  let counter = 0
  const revoke = vi.fn()

  beforeEach(() => {
    counter = 0
    revoke.mockClear()
    vi.stubGlobal('URL', {
      createObjectURL: () => `blob:photo-${++counter}`,
      revokeObjectURL: revoke,
    })
  })
  afterEach(() => {
    deleteWebPhoto('a')
    deleteWebPhoto('b')
    vi.unstubAllGlobals()
  })

  it('holds a photo by id', () => {
    const blob = new Blob(['x'], { type: 'image/jpeg' })
    putWebPhoto('a', blob)
    expect(hasWebPhoto('a')).toBe(true)
    expect(getWebPhotoBlob('a')).toBe(blob)
    expect(listWebPhotos().map((p) => p.id)).toEqual(['a'])
  })

  it('gives an empty URL for a photo this page does not have', () => {
    expect(getWebPhotoUrl('missing')).toBe('')
  })

  it('reuses one object URL per photo and revokes it on delete or replace', () => {
    putWebPhoto('a', new Blob(['1']))
    const url = getWebPhotoUrl('a')
    expect(getWebPhotoUrl('a')).toBe(url)
    putWebPhoto('a', new Blob(['2']))
    expect(revoke).toHaveBeenCalledWith(url)
    const next = getWebPhotoUrl('a')
    expect(next).not.toBe(url)
    deleteWebPhoto('a')
    expect(revoke).toHaveBeenCalledWith(next)
    expect(hasWebPhoto('a')).toBe(false)
  })
})
