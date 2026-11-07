import { beforeEach, describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({ OS: 'ios' as string }))
vi.mock('react-native', () => ({ Platform: platform }))

import { canAddNotePhotos } from '@/lib/richText/notePhotos'

describe('canAddNotePhotos', () => {
  beforeEach(() => {
    platform.OS = 'ios'
  })

  it.each(['ios', 'android'])('follows the note on %s', (os) => {
    platform.OS = os
    expect(canAddNotePhotos(true)).toBe(true)
    expect(canAddNotePhotos(false)).toBe(false)
  })

  it('is never on the web, which has no photo sync', () => {
    platform.OS = 'web'
    expect(canAddNotePhotos(true)).toBe(false)
  })
})
