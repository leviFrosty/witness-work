import { beforeEach, describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({ OS: 'ios' as string }))
vi.mock('react-native', () => ({ Platform: platform }))

import {
  sanitizeContactAvatar,
  sanitizeProfileAvatar,
} from '@/app/sync/avatarPayload'
import { Contact } from '@/types/contact'

const makeContact = (overrides: Partial<Contact> = {}): Contact => ({
  id: 'contact-1',
  name: 'Test',
  createdAt: new Date(0),
  ...overrides,
})

describe('payload.sanitizeContactAvatar', () => {
  describe('with includeImages=false (default, Phase 1)', () => {
    it('retains the photo reference when transfer is off', () => {
      const c = makeContact({
        avatar: { type: 'image', value: 'file:///tmp/c.jpg?t=1' },
      })
      const out = sanitizeContactAvatar(c, { includeImages: false })
      expect(out.avatar).toEqual({
        type: 'image',
        value: 'icloud://contact-contact-1',
      })
    })

    it('leaves emoji + none avatars untouched', () => {
      const emoji = makeContact({ avatar: { type: 'emoji', value: '🌱' } })
      const none = makeContact({ avatar: { type: 'none', value: '' } })
      expect(
        sanitizeContactAvatar(emoji, { includeImages: false }).avatar
      ).toEqual({ type: 'emoji', value: '🌱' })
      expect(
        sanitizeContactAvatar(none, { includeImages: false }).avatar
      ).toEqual({ type: 'none', value: '' })
    })
  })

  describe('with includeImages=true (Phase 2)', () => {
    it('rewrites an image avatar value to a marker keyed by contact id', () => {
      const c = makeContact({
        id: 'contact-abc',
        avatar: {
          type: 'image',
          value: 'file:///Documents/contact-abc-avatar.jpg?t=9',
        },
      })
      const out = sanitizeContactAvatar(c, { includeImages: true })
      expect(out.avatar).toEqual({
        type: 'image',
        value: 'icloud://contact-contact-abc',
      })
    })

    it('still leaves emoji + none avatars untouched', () => {
      const emoji = makeContact({ avatar: { type: 'emoji', value: '🌱' } })
      const none = makeContact({ avatar: { type: 'none', value: '' } })
      expect(
        sanitizeContactAvatar(emoji, { includeImages: true }).avatar
      ).toEqual({ type: 'emoji', value: '🌱' })
      expect(
        sanitizeContactAvatar(none, { includeImages: true }).avatar
      ).toEqual({ type: 'none', value: '' })
    })
  })
})

describe('payload.sanitizeProfileAvatar', () => {
  it('retains the profile photo reference when transfer is off', () => {
    expect(
      sanitizeProfileAvatar(
        { type: 'image', value: 'file:///tmp/profile.jpg?t=1' },
        { includeImages: false }
      )
    ).toEqual({ type: 'image', value: 'icloud://profile' })
  })

  it('rewrites image to the profile marker when images are on', () => {
    expect(
      sanitizeProfileAvatar(
        { type: 'image', value: 'file:///tmp/profile.jpg?t=1' },
        { includeImages: true }
      )
    ).toEqual({ type: 'image', value: 'icloud://profile' })
  })

  it('preserves emoji / none in both modes', () => {
    const emoji = { type: 'emoji' as const, value: '🕊️' }
    const none = { type: 'none' as const, value: '' }
    expect(sanitizeProfileAvatar(emoji, { includeImages: false })).toEqual(
      emoji
    )
    expect(sanitizeProfileAvatar(emoji, { includeImages: true })).toEqual(emoji)
    expect(sanitizeProfileAvatar(none, { includeImages: false })).toEqual(none)
    expect(sanitizeProfileAvatar(none, { includeImages: true })).toEqual(none)
  })

  it('passes undefined through unchanged', () => {
    expect(
      sanitizeProfileAvatar(undefined, { includeImages: true })
    ).toBeUndefined()
    expect(
      sanitizeProfileAvatar(undefined, { includeImages: false })
    ).toBeUndefined()
  })
})

describe('on the web, which has no photo sync', () => {
  beforeEach(() => {
    platform.OS = 'web'
  })

  it('keeps the reference to a photo a phone made', () => {
    const c = makeContact({
      avatar: {
        type: 'image',
        value: 'icloud://contact-contact-1',
        revision: 'r1',
      },
    })
    expect(sanitizeContactAvatar(c, { includeImages: true }).avatar).toEqual({
      type: 'image',
      value: 'icloud://contact-contact-1',
      revision: 'r1',
    })
  })

  it.each(['data:image/jpeg;base64,AAAA', 'blob:https://app.test/1'])(
    'does not refer to a contact photo whose bytes only this page holds (%s)',
    (value) => {
      const c = makeContact({
        avatar: { type: 'image', value, revision: 'web1' },
      })
      expect(sanitizeContactAvatar(c, { includeImages: true }).avatar).toEqual({
        type: 'none',
        value: '',
      })
    }
  )

  it('does not refer to a profile photo only this page holds', () => {
    expect(
      sanitizeProfileAvatar(
        { type: 'image', value: 'data:image/jpeg;base64,AAAA', revision: 'p1' },
        { includeImages: true }
      )
    ).toEqual({ type: 'none', value: '' })
  })

  it('keeps the profile reference a phone made', () => {
    expect(
      sanitizeProfileAvatar(
        { type: 'image', value: 'icloud://profile', revision: 'p1' },
        { includeImages: true }
      )
    ).toEqual({ type: 'image', value: 'icloud://profile', revision: 'p1' })
  })

  it('still refers to a phone photo from a data URL on a phone', () => {
    platform.OS = 'ios'
    const c = makeContact({
      avatar: { type: 'image', value: 'data:image/jpeg;base64,AAAA' },
    })
    expect(
      sanitizeContactAvatar(c, { includeImages: true }).avatar?.value
    ).toBe('icloud://contact-contact-1')
  })
})
