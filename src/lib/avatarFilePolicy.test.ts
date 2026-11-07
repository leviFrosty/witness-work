import { describe, expect, it } from 'vitest'
import { isInlineImage, keepsLocalAvatar } from '@/lib/avatarFilePolicy'

describe('isInlineImage', () => {
  it.each([
    'data:image/jpeg;base64,AA',
    'blob:https://x/1',
    'DATA:image/png;base64,AA',
    'Blob:https://x/2',
  ])('is true for %s', (uri) => expect(isInlineImage(uri)).toBe(true))

  it.each(['file:///a.jpg', 'https://x/a.jpg', 'photo-0001', ''])(
    'is false for %s',
    (uri) => expect(isInlineImage(uri)).toBe(false)
  )

  it('keeps a browser’s photo whatever the scheme’s case', () => {
    expect(
      keepsLocalAvatar(
        { type: 'image', value: 'DATA:image/png;base64,AA', revision: 'r1' },
        { type: 'none' }
      )
    ).toBe(true)
  })
})
