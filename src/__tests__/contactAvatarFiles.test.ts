import { describe, expect, it, vi } from 'vitest'

// Stub expo-file-system so importing contactAvatarFiles.ts doesn't drag in
// the native module. We only assert pure path / rect math here.
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///fake/Documents/',
  getInfoAsync: vi.fn(async () => ({ exists: false })),
  copyAsync: vi.fn(async () => undefined),
  deleteAsync: vi.fn(async () => undefined),
  readDirectoryAsync: vi.fn(async () => [] as string[]),
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
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

import {
  croppedAvatarFileName,
  croppedAvatarPath,
  defaultCenteredSquareCrop,
  originalAvatarFileName,
  originalAvatarPath,
  originalSiblingFileName,
  stripCacheBuster,
  withCacheBuster,
  cropAndSaveAvatar,
  deleteAvatarFiles,
} from '@/lib/contactAvatarFiles'

describe('contactAvatarFiles paths', () => {
  it('writes successive crops to immutable revision paths', async () => {
    const { copyAsync } = await import('expo-file-system/legacy')
    const crop = { originX: 0, originY: 0, width: 10, height: 10 }
    const source = { width: 10, height: 10 }
    const first = await cropAndSaveAvatar(
      'file:///source.jpg',
      'c',
      crop,
      source,
      'a'
    )
    const second = await cropAndSaveAvatar(
      'file:///source.jpg',
      'c',
      crop,
      source,
      'b'
    )
    expect(first.path).not.toBe(second.path)
    expect(copyAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'file:///fake/Documents/contact-c-avatar-picked-a.jpg',
      })
    )
    expect(copyAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'file:///fake/Documents/contact-c-avatar-picked-b.jpg',
      })
    )
  })
  it('builds cropped + original filenames per contact id', () => {
    expect(croppedAvatarFileName('abc')).toBe('contact-abc-avatar.jpg')
    expect(originalAvatarFileName('abc')).toBe(
      'contact-abc-avatar-original.jpg'
    )
  })

  it('gives each picked original its own revision path', () => {
    expect(originalAvatarPath('c', 'a')).toBe(
      'file:///fake/Documents/contact-c-avatar-original-a.jpg'
    )
    expect(originalAvatarPath('c', 'b')).toBe(
      'file:///fake/Documents/contact-c-avatar-original-b.jpg'
    )
    expect(originalSiblingFileName('profile-avatar.jpg', 'b')).toBe(
      'profile-avatar-original-b.jpg'
    )
  })

  it('erases canceled draft revisions only for the exact contact owner', async () => {
    const fs = await import('expo-file-system/legacy')
    vi.mocked(fs.deleteAsync).mockClear()
    vi.mocked(fs.readDirectoryAsync).mockResolvedValue([
      'contact-c-avatar.jpg',
      'contact-c-avatar-original.jpg',
      'contact-c-avatar-picked-a.jpg',
      'contact-c-avatar-picked-canceled.jpg',
      'contact-c-avatar-original-canceled.jpg',
      'contact-c-avatar-synced-a.jpg',
      'contact-c-avatar-other-avatar-picked-a.jpg',
      'profile-avatar-picked-a.jpg',
      'unrelated.jpg',
    ])
    await deleteAvatarFiles('c')
    expect(
      vi
        .mocked(fs.deleteAsync)
        .mock.calls.map(([path]) => path)
        .sort()
    ).toEqual(
      [
        'file:///fake/Documents/contact-c-avatar.jpg',
        'file:///fake/Documents/contact-c-avatar-original.jpg',
        'file:///fake/Documents/contact-c-avatar-picked-a.jpg',
        'file:///fake/Documents/contact-c-avatar-picked-canceled.jpg',
        'file:///fake/Documents/contact-c-avatar-original-canceled.jpg',
        'file:///fake/Documents/contact-c-avatar-synced-a.jpg',
      ].sort()
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
