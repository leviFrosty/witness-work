import { describe, expect, it } from 'vitest'
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
    it('drops the avatar field entirely when it is an image', () => {
      const c = makeContact({
        avatar: { type: 'image', value: 'file:///tmp/c.jpg?t=1' },
      })
      const out = sanitizeContactAvatar(c, { includeImages: false })
      expect(out.avatar).toBeUndefined()
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
  it('collapses image to none when images are off', () => {
    expect(
      sanitizeProfileAvatar(
        { type: 'image', value: 'file:///tmp/profile.jpg?t=1' },
        { includeImages: false }
      )
    ).toEqual({ type: 'none', value: '' })
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
