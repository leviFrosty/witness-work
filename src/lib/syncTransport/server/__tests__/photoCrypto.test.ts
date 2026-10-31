import {
  createHmac,
  hkdfSync,
  randomBytes as nodeRandomBytes,
} from 'node:crypto'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { describe, expect, it } from 'vitest'
import { fromB64u, toB64u, utf8 } from '@/lib/bytes'
import { deriveSyncKey } from '@/lib/syncTransport/server/syncCrypto'
import {
  derivePhotoKeys,
  MAX_PHOTO_FILE_BYTES,
  openPhoto,
  openPhotoMeta,
  PhotoOpenError,
  photoName,
  SYNC_PHOTO_NAME_PATTERN,
  sealPhoto,
  sealPhotoMeta,
} from '@/lib/syncTransport/server/photoCrypto'

const random = (length: number) => new Uint8Array(nodeRandomBytes(length))
const accountKey = new Uint8Array(32).fill(7)
const accountId = 'A'.repeat(22)
const filename = 'witness-work-img-contact-c1--r1.jpg'

const nodeHkdf = (info: string) =>
  new Uint8Array(hkdfSync('sha256', accountKey, new Uint8Array(0), info, 32))

const openProblem = async (open: () => Promise<unknown>) => {
  try {
    await open()
  } catch (error) {
    expect(error).toBeInstanceOf(PhotoOpenError)
    return (error as PhotoOpenError).problem
  }
  throw new Error('opened')
}

describe('photo keys and names', () => {
  it('derives the photo and name keys by HKDF from the account key', () => {
    const keys = derivePhotoKeys(accountKey)
    expect(keys.photoKey).toEqual(nodeHkdf('ww-account/v1/sync-photo'))
    expect(keys.nameKey).toEqual(nodeHkdf('ww-account/v1/sync-photo-name'))
    expect(keys.photoKey).not.toEqual(deriveSyncKey(accountKey))
    expect(() => derivePhotoKeys(new Uint8Array(31))).toThrow()
  })

  it('names a photo by the HMAC of its filename', () => {
    const { nameKey } = derivePhotoKeys(accountKey)
    const name = photoName(nameKey, filename)
    const expected = createHmac('sha256', nameKey)
      .update(filename, 'utf8')
      .digest('base64url')
    expect(name).toBe(expected)
    expect(name).toHaveLength(43)
    expect(SYNC_PHOTO_NAME_PATTERN.test(name)).toBe(true)
    expect(photoName(nameKey, 'witness-work-img-contact-c1--r2.jpg')).not.toBe(
      name
    )
  })

  it('matches the fixed vectors ww-api checks against', async () => {
    // Account key 0x07 × 32, account id "A" × 22, nonce 0x09 × 24.
    const { photoKey, nameKey } = derivePhotoKeys(accountKey)
    expect(toB64u(photoKey)).toBe('2LB39AYFsLR3Ed0GQPBlmW0LYi9ctPABhuPj_NbySIg')
    expect(toB64u(nameKey)).toBe('rkVJ8u123U-jSZUtmkQdMWTmdSl-Yc7h92d9atau2Vo')
    expect(photoName(nameKey, 'witness-work-img-profile--r1.jpg')).toBe(
      'tb4CH3NBrND4KNN9HVMFsViQhSkR5yExES7ZsvOlTAU'
    )
    expect(photoName(nameKey, 'witness-work-note-n1.jpg')).toBe(
      '4PEaF0TX0MCuvzR65zUlJh72XxP6qVeePck_rbo0ibU'
    )
    const name = photoName(nameKey, filename)
    expect(name).toBe('HsZ7M3FU9DjlUE3BsW1FCinQeHsmGblGWWbapYK1h_s')
    const blob = await sealPhoto(
      photoKey,
      utf8('photo bytes'),
      { accountId, name },
      new Uint8Array(24).fill(9)
    )
    expect(toB64u(blob)).toBe(
      'AQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCR6pdw1L6WUYcR6ShHQk9STImrh8NMcvzWZzsQ'
    )
  })
})

describe('photo blob', () => {
  const { photoKey, nameKey } = derivePhotoKeys(accountKey)
  const name = photoName(nameKey, filename)
  const address = { accountId, name }

  it('is the noble one-shot XChaCha20-Poly1305 with the contract AAD', async () => {
    const bytes = random(300_000)
    const nonce = random(24)
    const blob = await sealPhoto(photoKey, bytes, address, nonce)
    const aad = utf8(`ww-account/v1/sync-photo\n${accountId}\n${name}`)
    const expected = xchacha20poly1305(photoKey, nonce, aad).encrypt(bytes)
    expect(blob[0]).toBe(1)
    expect(blob.subarray(1, 25)).toEqual(nonce)
    expect(blob.subarray(25)).toEqual(expected)
    expect(blob).toHaveLength(1 + 24 + bytes.length + 16)
  })

  it('round-trips any size, empty and chunk edges included', async () => {
    for (const size of [0, 1, 63, 64, 65, 131_072, 131_073, 1_000_003]) {
      const bytes = random(size)
      const blob = await sealPhoto(photoKey, bytes, address, random(24))
      expect(await openPhoto(photoKey, blob, address)).toEqual(bytes)
    }
  })

  it('yields between chunks so a large photo never holds the thread', async () => {
    let pauses = 0
    const pause = async () => {
      pauses++
    }
    const bytes = random(1_000_000)
    const blob = await sealPhoto(photoKey, bytes, address, random(24), pause)
    expect(pauses).toBeGreaterThan(3)
    pauses = 0
    expect(await openPhoto(photoKey, blob, address, pause)).toEqual(bytes)
    expect(pauses).toBeGreaterThan(3)
  })

  it('opens only for its own account and name', async () => {
    const blob = await sealPhoto(photoKey, random(1000), address, random(24))
    expect(
      await openProblem(() =>
        openPhoto(photoKey, blob, { ...address, accountId: 'B'.repeat(22) })
      )
    ).toBe('decrypt')
    expect(
      await openProblem(() =>
        openPhoto(photoKey, blob, {
          ...address,
          name: photoName(nameKey, 'witness-work-note-n1.jpg'),
        })
      )
    ).toBe('decrypt')
    expect(await openProblem(() => openPhoto(nameKey, blob, address))).toBe(
      'decrypt'
    )
  })

  it('refuses a tampered, truncated or unknown-version blob', async () => {
    const blob = await sealPhoto(photoKey, random(1000), address, random(24))
    const flipped = blob.slice()
    flipped[100] ^= 1
    expect(await openProblem(() => openPhoto(photoKey, flipped, address))).toBe(
      'decrypt'
    )
    expect(
      await openProblem(() =>
        openPhoto(photoKey, blob.subarray(0, 40), address)
      )
    ).toBe('format')
    const v2 = blob.slice()
    v2[0] = 2
    expect(await openProblem(() => openPhoto(photoKey, v2, address))).toBe(
      'format'
    )
  })

  it('caps a photo so its blob fits the server’s 25 MiB', () => {
    expect(MAX_PHOTO_FILE_BYTES + 1 + 24 + 16).toBe(25 * 1024 * 1024)
  })
})

describe('photo meta', () => {
  const { photoKey, nameKey } = derivePhotoKeys(accountKey)
  const name = photoName(nameKey, filename)
  const address = { accountId, name }

  it('seals the filename as the contract’s JSON under the meta AAD', () => {
    const nonce = random(24)
    const meta = sealPhotoMeta(photoKey, filename, address, nonce)
    expect(meta.length).toBeLessThanOrEqual(512)
    const sealed = fromB64u(meta)
    expect(sealed[0]).toBe(1)
    const aad = utf8(`ww-account/v1/sync-photo-meta\n${accountId}\n${name}`)
    const json = new TextDecoder().decode(
      xchacha20poly1305(photoKey, sealed.subarray(1, 25), aad).decrypt(
        sealed.subarray(25)
      )
    )
    // Padded with spaces to 256 bytes, so every meta is one length.
    expect(json).toHaveLength(256)
    expect(json).toMatch(/^\{"v":1,"filename":"[^"]+"\} +$/)
    expect(JSON.parse(json)).toEqual({ v: 1, filename })
    expect(
      sealPhotoMeta(photoKey, 'witness-work-note-n1.jpg', address, nonce)
    ).toHaveLength(meta.length)
    expect(openPhotoMeta(photoKey, meta, address)).toBe(filename)
  })

  it('reads as nothing when it doesn’t open or isn’t ours', () => {
    const meta = sealPhotoMeta(photoKey, filename, address, random(24))
    expect(
      openPhotoMeta(photoKey, meta, { ...address, accountId: 'B'.repeat(22) })
    ).toBeNull()
    expect(
      openPhotoMeta(photoKey, meta, {
        ...address,
        name: photoName(nameKey, 'witness-work-note-n1.jpg'),
      })
    ).toBeNull()
    expect(openPhotoMeta(photoKey, 'not base64!', address)).toBeNull()
    expect(openPhotoMeta(photoKey, '', address)).toBeNull()
    // A filename that doesn't hash to the name it's stored under.
    const moved = sealPhotoMeta(
      photoKey,
      'witness-work-note-n1.jpg',
      address,
      random(24)
    )
    expect(openPhotoMeta(photoKey, moved, address, nameKey)).toBeNull()
    expect(openPhotoMeta(photoKey, meta, address, nameKey)).toBe(filename)
    // A filename the app wouldn't write, under its own name.
    const odd = '../witness-work-img-contact-c1.jpg'
    const oddAddress = { accountId, name: photoName(nameKey, odd) }
    const oddMeta = sealPhotoMeta(photoKey, odd, oddAddress, random(24))
    expect(
      openPhotoMeta(photoKey, oddMeta, oddAddress, nameKey, () => false)
    ).toBeNull()
    expect(openPhotoMeta(photoKey, oddMeta, oddAddress, nameKey)).toBe(odd)
  })
})
