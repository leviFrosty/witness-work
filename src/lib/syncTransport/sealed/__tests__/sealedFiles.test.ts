import { describe, expect, it } from 'vitest'
import { noteImageIdFromFilename } from '@/lib/syncTransport/imageNames'
import {
  isLockedPlaceholder,
  isSealedPhotoName,
  LOCKED_PLACEHOLDER,
  NEWER_PLACEHOLDER,
  parseSealedEnvelope,
  readAdvert,
  sealedEnvelopeJson,
  sealedPhotoNameFor,
  sealedSnapshotName,
  snapshotNameOf,
  withAdvert,
} from '@/lib/syncTransport/sealed/sealedFiles'

describe('sealed file names', () => {
  it('map both ways and stay in the native module’s namespace', () => {
    const sealed = sealedSnapshotName('witness-work-abc.json')
    expect(sealed).toBe('witness-work-abc.sealed.json')
    expect(sealed.startsWith('witness-work') && sealed.endsWith('.json')).toBe(
      true
    )
    expect(snapshotNameOf(sealed)).toBe('witness-work-abc.json')
    expect(snapshotNameOf('witness-work-abc.json')).toBe(
      'witness-work-abc.json'
    )
  })

  it('give photos names old builds’ note GC never matches', () => {
    const name = sealedPhotoNameFor('AbC-dEf123')
    expect(isSealedPhotoName(name)).toBe(true)
    expect(noteImageIdFromFilename(name)).toBeNull()
  })
})

describe('the envelope', () => {
  it('round-trips', () => {
    const json = sealedEnvelopeJson('key-id', new Uint8Array([1, 2, 3]))
    expect(parseSealedEnvelope(json)).toEqual({
      format: 1,
      key: 'key-id',
      blob: new Uint8Array([1, 2, 3]),
    })
    expect(parseSealedEnvelope('{"version":1}')).toBeNull()
    expect(parseSealedEnvelope('not json')).toBeNull()
  })

  it('tells placeholders apart', () => {
    expect(isLockedPlaceholder(LOCKED_PLACEHOLDER)).toBe(true)
    expect(isLockedPlaceholder(NEWER_PLACEHOLDER)).toBe(false)
  })
})

describe('the advert', () => {
  it('goes first in the JSON and reads back without parsing the rest', () => {
    const json = withAdvert('{"version":1,"x":2}', { key: 'abc_DEF-1' })
    expect(JSON.parse(json)).toEqual({
      sealing: { v: 1, key: 'abc_DEF-1' },
      version: 1,
      x: 2,
    })
    expect(readAdvert(json)).toEqual({ key: 'abc_DEF-1' })
    expect(readAdvert(withAdvert('{"a":1}', { key: null }))).toEqual({
      key: null,
    })
  })

  it('handles an empty object, and files from before it', () => {
    expect(JSON.parse(withAdvert('{}', { key: null }))).toEqual({
      sealing: { v: 1, key: null },
    })
    expect(readAdvert('{"version":1}')).toBeNull()
    expect(readAdvert('')).toBeNull()
  })
})
