import { describe, expect, it } from 'vitest'
import {
  isAvatarFileValue,
  isInlineImage,
  keepsLocalAvatar,
} from '@/lib/avatarFilePolicy'

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

describe('isAvatarFileValue', () => {
  it.each([
    'file:///Docs/profile-avatar.jpg',
    'webphoto:avatars/profile-avatar-synced-p1.jpg?t=1',
  ])('is true for %s', (value) => expect(isAvatarFileValue(value)).toBe(true))

  it.each(['icloud://profile', 'data:image/jpeg;base64,AA', 'blob:x', ''])(
    'is false for %s',
    (value) => expect(isAvatarFileValue(value)).toBe(false)
  )

  it('keeps the browser’s copy of a photo when the same revision arrives', () => {
    expect(
      keepsLocalAvatar(
        {
          type: 'image',
          value: 'webphoto:avatars/profile-avatar-picked-p1.jpg?t=1',
          revision: 'p1',
        },
        { type: 'image', value: 'icloud://profile', revision: 'p1' }
      )
    ).toBe(true)
  })
})
