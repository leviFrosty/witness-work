import { describe, expect, it, vi } from 'vitest'

// Stub expo-file-system so importing contactAvatarFiles.ts doesn't drag in
// the native module. We only assert pure path / rect math here.
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///fake/Documents/',
  getInfoAsync: vi.fn(async () => ({ exists: false })),
  copyAsync: vi.fn(async () => undefined),
  deleteAsync: vi.fn(async () => undefined),
}))
vi.mock('expo-image-manipulator', () => ({
  manipulateAsync: vi.fn(async () => ({
    uri: 'file:///fake/result.jpg',
    width: 1,
    height: 1,
  })),
  SaveFormat: { JPEG: 'jpeg' },
}))
// `../lib/logger` chains through to the preferences store which imports the
// react-native MMKV module — not parseable in node. Stub it out for these
// pure-function tests.
vi.mock('../lib/logger', () => import('./mocks/logger'))

import {
  croppedAvatarFileName,
  croppedAvatarPath,
  defaultCenteredSquareCrop,
  originalAvatarFileName,
  originalAvatarPath,
  originalSiblingFileName,
  stripCacheBuster,
  withCacheBuster,
} from '../lib/contactAvatarFiles'

describe('contactAvatarFiles paths', () => {
  it('builds cropped + original filenames per contact id', () => {
    expect(croppedAvatarFileName('abc')).toBe('contact-abc-avatar.jpg')
    expect(originalAvatarFileName('abc')).toBe(
      'contact-abc-avatar-original.jpg'
    )
  })

  it('builds absolute paths inside the documents directory', () => {
    expect(croppedAvatarPath('abc')).toBe(
      'file:///fake/Documents/contact-abc-avatar.jpg'
    )
    expect(originalAvatarPath('abc')).toBe(
      'file:///fake/Documents/contact-abc-avatar-original.jpg'
    )
  })

  it('derives a sibling original filename from any cropped filename', () => {
    expect(originalSiblingFileName('contact-x-avatar.jpg')).toBe(
      'contact-x-avatar-original.jpg'
    )
    // Profile avatar uses a different prefix — the helper is generic.
    expect(originalSiblingFileName('profile-avatar.jpg')).toBe(
      'profile-avatar-original.jpg'
    )
    // No extension: append at end so the round-trip is non-destructive.
    expect(originalSiblingFileName('foo')).toBe('foo-original')
  })
})

describe('cache-buster helpers', () => {
  it('strips the ?t=… suffix back to a usable filesystem path', () => {
    expect(
      stripCacheBuster('file:///fake/Documents/contact-x-avatar.jpg?t=12345')
    ).toBe('file:///fake/Documents/contact-x-avatar.jpg')
  })

  it('round-trips a path → bust → strip back to the same path', () => {
    const path = 'file:///fake/Documents/contact-x-avatar.jpg'
    expect(stripCacheBuster(withCacheBuster(path))).toBe(path)
  })

  it('leaves clean paths alone when no query is present', () => {
    const path = 'file:///clean.jpg'
    expect(stripCacheBuster(path)).toBe(path)
  })
})

describe('defaultCenteredSquareCrop', () => {
  it('returns a centered square for a landscape source', () => {
    expect(defaultCenteredSquareCrop({ width: 4000, height: 3000 })).toEqual({
      originX: 500,
      originY: 0,
      width: 3000,
      height: 3000,
    })
  })

  it('returns a centered square for a portrait source', () => {
    expect(defaultCenteredSquareCrop({ width: 1080, height: 1920 })).toEqual({
      originX: 0,
      originY: 420,
      width: 1080,
      height: 1080,
    })
  })

  it('is a no-op when source is already square', () => {
    expect(defaultCenteredSquareCrop({ width: 800, height: 800 })).toEqual({
      originX: 0,
      originY: 0,
      width: 800,
      height: 800,
    })
  })
})
