import { beforeEach, describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({ OS: 'ios' as string }))
vi.mock('react-native', () => ({ Platform: platform }))

import { canAddNotePhotos } from '@/lib/richText/notePhotos'

describe('canAddNotePhotos', () => {
  beforeEach(() => {
    platform.OS = 'ios'
  })

  it.each(['ios', 'android', 'web'])('follows the note on %s', (os) => {
    platform.OS = os
    expect(canAddNotePhotos(true)).toBe(true)
    expect(canAddNotePhotos(false)).toBe(false)
  })
})
