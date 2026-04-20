import { describe, expect, it } from 'vitest'
import {
  filenameForContact,
  filenameForProfile,
  markerForContact,
  MARKER_PROFILE,
  parseContactMarker,
  isProfileMarker,
  isValidImageFilename,
} from '../imageNames'

describe('imageNames', () => {
  describe('filenameForContact', () => {
    it('maps a contact id to a deterministic container filename', () => {
      expect(filenameForContact('abc123')).toBe(
        'witness-work-img-contact-abc123.jpg'
      )
    })
  })

  describe('filenameForProfile', () => {
    it('returns a single stable filename (no identity embedded)', () => {
      expect(filenameForProfile()).toBe('witness-work-img-profile.jpg')
    })
  })

  describe('marker values (on-wire avatar.value)', () => {
    it('encodes a contact id as a stable icloud:// marker', () => {
      expect(markerForContact('abc123')).toBe('icloud://contact-abc123')
    })

    it('exposes a constant marker for the profile', () => {
      expect(MARKER_PROFILE).toBe('icloud://profile')
    })
  })

  describe('parseContactMarker', () => {
    it('round-trips with markerForContact', () => {
      expect(parseContactMarker(markerForContact('abc123'))).toBe('abc123')
    })

    it('returns null for the profile marker', () => {
      expect(parseContactMarker(MARKER_PROFILE)).toBeNull()
    })

    it('returns null for unrelated strings', () => {
      expect(parseContactMarker('file:///documents/contact-abc.jpg')).toBeNull()
      expect(parseContactMarker('')).toBeNull()
      expect(parseContactMarker('icloud://other-abc')).toBeNull()
    })

    it('accepts contact ids that contain hyphens', () => {
      expect(parseContactMarker('icloud://contact-abc-def-123')).toBe(
        'abc-def-123'
      )
    })
  })

  describe('isProfileMarker', () => {
    it('matches only the exact profile marker', () => {
      expect(isProfileMarker(MARKER_PROFILE)).toBe(true)
      expect(isProfileMarker('icloud://profile/')).toBe(false)
      expect(isProfileMarker('icloud://contact-abc')).toBe(false)
      expect(isProfileMarker('')).toBe(false)
    })
  })

  describe('isValidImageFilename', () => {
    it('accepts the filenames produced by filenameForContact / Profile', () => {
      expect(isValidImageFilename(filenameForContact('abc123'))).toBe(true)
      expect(isValidImageFilename(filenameForProfile())).toBe(true)
    })

    it('rejects filenames outside the witness-work-img- namespace', () => {
      // Belongs to the JSON sync namespace — must not be reachable via the
      // binary-file bridge.
      expect(isValidImageFilename('witness-work-abc.json')).toBe(false)
      // Binary namespace but wrong outer prefix.
      expect(isValidImageFilename('other-img-contact-abc.jpg')).toBe(false)
      // Close but missing the trailing hyphen.
      expect(isValidImageFilename('witness-work-imgcontact-abc.jpg')).toBe(
        false
      )
    })

    it('rejects wrong extensions', () => {
      expect(isValidImageFilename('witness-work-img-contact-abc.png')).toBe(
        false
      )
      expect(isValidImageFilename('witness-work-img-contact-abc')).toBe(false)
      expect(isValidImageFilename('witness-work-img-contact-abc.jpg.bak')).toBe(
        false
      )
    })

    it('rejects path separators and traversal components (defence-in-depth)', () => {
      // Contact id shouldn't ever contain these, but the validator is the last
      // line of defence at the bridge — reject aggressively.
      expect(
        isValidImageFilename('witness-work-img-contact-../secret.jpg')
      ).toBe(false)
      expect(isValidImageFilename('witness-work-img-contact-a/b.jpg')).toBe(
        false
      )
      expect(isValidImageFilename('witness-work-img-contact-..jpg')).toBe(false)
    })

    it('rejects empty / trivial strings', () => {
      expect(isValidImageFilename('')).toBe(false)
      expect(isValidImageFilename('witness-work-img-.jpg')).toBe(false)
    })
  })
})
