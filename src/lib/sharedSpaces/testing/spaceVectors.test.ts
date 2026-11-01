import {
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  hkdfSync,
  type KeyObject,
} from 'node:crypto'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { describe, expect, it } from 'vitest'
import { fromB64u, toB64u } from '@/lib/bytes'
import { memberCheck } from '@/lib/sharedSpaces/crypto'
import {
  checkSpaceVectors,
  computeSpaceVectors,
} from '@/lib/sharedSpaces/testing/spaceVectors'
import expected from '@/lib/sharedSpaces/testing/spaceVectors.json'

const counting = (length: number, start = 0) =>
  Uint8Array.from({ length }, (_, index) => (start + index) & 0xff)

const bytes = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

const text = (value: string) => new TextEncoder().encode(value)

const nodeHkdf = (ikm: Uint8Array, info: string, length: number) =>
  new Uint8Array(hkdfSync('sha256', ikm, new Uint8Array(0), info, length))

const nodeSha256 = (input: string | Uint8Array) =>
  new Uint8Array(createHash('sha256').update(input).digest())

const hex = (value: Uint8Array) => Buffer.from(value).toString('hex')

const PKCS8_X25519 = Buffer.from('302e020100300506032b656e04220420', 'hex')
const SPKI_X25519 = Buffer.from('302a300506032b656e032100', 'hex')

const x25519Private = (raw: Uint8Array): KeyObject =>
  createPrivateKey({
    key: Buffer.concat([PKCS8_X25519, raw]),
    format: 'der',
    type: 'pkcs8',
  })

const x25519Public = (raw: Uint8Array): KeyObject =>
  createPublicKey({
    key: Buffer.concat([SPKI_X25519, raw]),
    format: 'der',
    type: 'spki',
  })

const publicOf = (raw: Uint8Array) =>
  new Uint8Array(
    createPublicKey(x25519Private(raw))
      .export({ format: 'der', type: 'spki' })
      .subarray(SPKI_X25519.length)
  )

const agree = (privateRaw: Uint8Array, publicRaw: Uint8Array) =>
  new Uint8Array(
    diffieHellman({
      privateKey: x25519Private(privateRaw),
      publicKey: x25519Public(publicRaw),
    })
  )

const wrapKeyOf = (shared: Uint8Array, ephPub: Uint8Array, memberPub: string) =>
  nodeHkdf(shared, `ww-spaces/v1/wrap|${toB64u(ephPub)}|${memberPub}`, 32)

const wrapAadOf = (spaceId: string, epoch: number, memberId: string) =>
  text(`ww-spaces/v1/wrap\n${spaceId}\n${epoch}\n${memberId}`)

const recordAadOf = (
  spaceId: string,
  epoch: number,
  recordId: string,
  deleted: boolean,
  stamp: number
) =>
  text(
    `ww-spaces/v1/record\n${spaceId}\n${epoch}\n${recordId}\n${deleted ? '1' : '0'}\n${stamp}`
  )

const recordKeyOf = (spaceKey: Uint8Array) =>
  nodeHkdf(spaceKey, 'ww-spaces/v1/record', 32)

const sealBlob = (
  key: Uint8Array,
  nonce: Uint8Array,
  plaintext: Uint8Array,
  aad: Uint8Array
) =>
  toB64u(
    bytes(
      new Uint8Array([1]),
      nonce,
      xchacha20poly1305(key, nonce, aad).encrypt(plaintext)
    )
  )

function openBlob(key: Uint8Array, blob: string, aad: Uint8Array) {
  const raw = fromB64u(blob)
  try {
    return xchacha20poly1305(key, raw.subarray(1, 25), aad).decrypt(
      raw.subarray(25)
    )
  } catch {
    return 'refused'
  }
}

const vectors = expected as Record<string, string>
const spaceId = vectors['space.id']
const spaceKey = counting(32, 0x40)
const tripId = '0b1f5c2e-8a7d-4e6f-9a3b-2c1d0e9f8a7b'

describe('Shared Spaces crypto vectors', () => {
  it('match the shared known-answer file under Node', () => {
    expect(computeSpaceVectors()).toEqual(expected)
    expect(checkSpaceVectors()).toEqual({
      ok: true,
      checked: Object.keys(expected).length,
      mismatches: [],
    })
  })

  it('anchor XChaCha20-Poly1305 to its draft test vector', () => {
    expect(vectors['rfc.xchacha'].startsWith('bd6d179d3e83d43b')).toBe(true)
    expect(
      vectors['rfc.xchacha'].endsWith('c0875924c1c7987947deafd8780acf49')
    ).toBe(true)
  })

  it('derive member values with the protocol labels, the id a hash of the key', () => {
    const seed = counting(32, 0x00)
    const token = nodeHkdf(seed, `ww-spaces/v1/member-token|${spaceId}`, 32)
    expect(vectors['member.token']).toBe(toB64u(token))
    expect(vectors['member.tokenHash']).toBe(toB64u(nodeSha256(token)))
    const dhPrivate = nodeHkdf(seed, `ww-spaces/v1/member-dh|${spaceId}`, 32)
    expect(vectors['member.dhPrivate']).toBe(hex(dhPrivate))

    const dhPub = toB64u(publicOf(dhPrivate))
    expect(vectors['member.dhPub']).toBe(dhPub)
    const idInput = `ww-spaces/v1/member-id|${spaceId}|${dhPub}`
    expect(vectors['member.idInput']).toBe(idInput)
    expect(vectors['member.id']).toBe(
      toB64u(nodeSha256(idInput).subarray(0, 16))
    )
    const other = nodeHkdf(
      counting(32, 0x20),
      `ww-spaces/v1/member-dh|${spaceId}`,
      32
    )
    const otherPub = toB64u(publicOf(other))
    expect(vectors['member.otherDhPub']).toBe(otherPub)
    expect(vectors['member.otherId']).toBe(
      toB64u(
        nodeSha256(`ww-spaces/v1/member-id|${spaceId}|${otherPub}`).subarray(
          0,
          16
        )
      )
    )

    expect(vectors['member.forgedKey']).toBe('refused')
    expect(vectors['member.id']).not.toBe(vectors['member.otherId'])
    expect(vectors['key.record']).toBe(hex(recordKeyOf(spaceKey)))
  })

  it('build the wrap byte for byte, and refuse it under the wrong AAD', () => {
    const memberPub = vectors['member.otherDhPub']
    const memberId = vectors['member.otherId']
    const ephemeral = counting(32, 0x50)
    const nonce = counting(24, 0x70)
    const ephPub = publicOf(ephemeral)
    const aad = wrapAadOf(spaceId, 1, memberId)
    expect(new TextDecoder().decode(aad)).toBe(vectors['wrap.aad'])
    const wrapKey = wrapKeyOf(
      agree(ephemeral, fromB64u(memberPub)),
      ephPub,
      memberPub
    )
    const wrap = toB64u(
      bytes(
        ephPub,
        new Uint8Array([1]),
        nonce,
        xchacha20poly1305(wrapKey, nonce, aad).encrypt(spaceKey)
      )
    )
    expect(wrap).toBe(vectors['wrap.value'])

    const raw = fromB64u(wrap)
    const memberPrivate = fromB64u(
      toB64u(
        nodeHkdf(counting(32, 0x20), `ww-spaces/v1/member-dh|${spaceId}`, 32)
      )
    )
    const opened = wrapKeyOf(
      agree(memberPrivate, raw.subarray(0, 32)),
      raw.subarray(0, 32),
      memberPub
    )
    const sealed = raw.subarray(57)
    expect(
      hex(xchacha20poly1305(opened, raw.subarray(33, 57), aad).decrypt(sealed))
    ).toBe(vectors['wrap.opened'])
    for (const wrong of [
      wrapAadOf(spaceId, 2, memberId),
      wrapAadOf(spaceId, 1, vectors['member.id']),
      wrapAadOf(toB64u(counting(16, 0x30)), 1, memberId),
    ])
      expect(() =>
        xchacha20poly1305(opened, raw.subarray(33, 57), wrong).decrypt(sealed)
      ).toThrow()
    expect(vectors['wrap.wrongEpoch']).toBe('decrypt')
    expect(vectors['wrap.wrongMember']).toBe('decrypt')
  })

  it('build every sealed record byte for byte, and refuse the wrong AAD', () => {
    const recordKey = recordKeyOf(spaceKey)
    const stamp = 1_790_000_000_123
    const aad = recordAadOf(spaceId, 1, tripId, false, stamp)
    expect(new TextDecoder().decode(aad)).toBe(vectors['record.aad'])
    const plaintext = text(vectors['record.plaintext'])
    expect(sealBlob(recordKey, counting(24, 0x90), plaintext, aad)).toBe(
      vectors['record.blob']
    )
    expect(
      new TextDecoder().decode(
        openBlob(recordKey, vectors['record.blob'], aad) as Uint8Array
      )
    ).toBe(vectors['record.opened'])
    for (const wrong of [
      recordAadOf(spaceId, 1, tripId, false, stamp + 1),
      recordAadOf(spaceId, 1, tripId, true, stamp),
      recordAadOf(spaceId, 1, 'another-trip', false, stamp),
      recordAadOf(spaceId, 2, tripId, false, stamp),
      recordAadOf(toB64u(counting(16, 0x30)), 1, tripId, false, stamp),
    ])
      expect(openBlob(recordKey, vectors['record.blob'], wrong)).toBe('refused')
    for (const name of [
      'record.wrongStamp',
      'record.wrongDeleted',
      'record.wrongId',
      'record.wrongEpoch',
    ])
      expect(vectors[name]).toBe('decrypt')

    const deletion = recordAadOf(spaceId, 1, tripId, true, 1_790_000_100_000)
    expect(new TextDecoder().decode(deletion)).toBe(vectors['deletion.aad'])
    expect(
      sealBlob(
        recordKey,
        counting(24, 0xa0),
        text('{"v":1,"kind":"trip"}'),
        deletion
      )
    ).toBe(vectors['deletion.blob'])

    const nextKey = counting(32, 0xc0)
    const chain = recordAadOf(spaceId, 2, 'k.2', false, 1_790_000_200_000)
    expect(
      sealBlob(
        recordKeyOf(nextKey),
        counting(24, 0xb0),
        text(`{"v":1,"kind":"keys","data":{"prev":"${toB64u(spaceKey)}"}}`),
        chain
      )
    ).toBe(vectors['keys.blob'])
    expect(
      openBlob(
        recordKeyOf(nextKey),
        vectors['keys.blob'],
        recordAadOf(spaceId, 2, 'k.3', false, 1_790_000_200_000)
      )
    ).toBe('refused')
    expect(vectors['keys.wrongId']).toBe('decrypt')
    expect(vectors['keys.prev']).toBe(hex(spaceKey))
  })

  it('make the User’s key check from the root seed, over the record and its key', () => {
    const checkKey = nodeHkdf(
      counting(32, 0x00),
      `ww-spaces/v1/member-check|${spaceId}`,
      32
    )
    expect(vectors['member.checkKey']).toBe(hex(checkKey))
    const covered = (avatar: string | null) =>
      JSON.stringify([
        'ww-spaces/v1/member-check',
        spaceId,
        1,
        toB64u(spaceKey),
        'Zoë 王',
        avatar,
        vectors['member.tag'],
        1_790_000_000_000,
      ])
    expect(vectors['member.checkInput']).toBe(covered('🚗'))
    const check = (input: string) =>
      toB64u(
        new Uint8Array(
          createHmac('sha256', checkKey).update(text(input)).digest()
        ).subarray(0, 16)
      )
    expect(vectors['member.check']).toBe(check(covered('🚗')))
    expect(vectors['member.checkNoAvatar']).toBe(check(covered(null)))
    expect(vectors['member.check']).not.toBe(vectors['member.checkNoAvatar'])
  })

  it('give another key check for another epoch, key, or field', () => {
    const checkKey = new Uint8Array(
      Buffer.from(vectors['member.checkKey'], 'hex')
    )
    const fields = {
      spaceId,
      epoch: 1,
      spaceKey: toB64u(spaceKey),
      name: 'Zoë 王',
      avatar: '🚗' as string | null,
      tag: vectors['member.tag'],
      joinedAt: 1_790_000_000_000,
    }
    const check = (
      key: Uint8Array,
      { epoch, spaceKey: k, name, avatar, tag, joinedAt } = fields
    ) =>
      toB64u(
        new Uint8Array(
          createHmac('sha256', key)
            .update(
              text(
                JSON.stringify([
                  'ww-spaces/v1/member-check',
                  fields.spaceId,
                  epoch,
                  k,
                  name,
                  avatar,
                  tag,
                  joinedAt,
                ])
              )
            )
            .digest()
        ).subarray(0, 16)
      )

    const appCheck = (key: Uint8Array, variant = fields) =>
      memberCheck(key, {
        ...variant,
        spaceKey: fromB64u(variant.spaceKey),
        avatar: variant.avatar ?? undefined,
      })
    expect(check(checkKey)).toBe(vectors['member.check'])
    const variants: [Uint8Array, typeof fields][] = [
      [checkKey, { ...fields, epoch: 2 }],
      [checkKey, { ...fields, spaceKey: toB64u(counting(32, 0x41)) }],
      [checkKey, { ...fields, name: 'Zoe 王' }],
      [checkKey, { ...fields, avatar: '🚙' }],
      [checkKey, { ...fields, tag: toB64u(counting(16, 0x10)) }],
      [checkKey, { ...fields, joinedAt: 1_790_000_000_001 }],

      [counting(32, 0x01), fields],
    ]
    const others = variants.map(([key, variant]) => check(key, variant))
    for (const other of others) expect(other).not.toBe(vectors['member.check'])
    expect(new Set(others).size).toBe(others.length)
    expect(variants.map(([key, variant]) => appCheck(key, variant))).toEqual(
      others
    )
  })

  it('hash the verifier, tag, copy id and event id as specified', () => {
    expect(vectors['invite.joinVerifier']).toBe(
      toB64u(nodeSha256(fromB64u(vectors['invite.joinSecret'])))
    )
    const inboxId = toB64u(counting(16, 0xf0))
    expect(vectors['member.tag']).toBe(
      toB64u(
        nodeSha256(`ww-spaces/v1/member-tag|${spaceId}|${inboxId}`).subarray(
          0,
          16
        )
      )
    )
    const copy = nodeSha256(
      `ww-spaces/v1/copy|${spaceId}|1790000000000|${tripId}`
    )

    copy[6] = (copy[6] & 0x0f) | 0x80
    copy[8] = (copy[8] & 0x3f) | 0x80
    const id = hex(copy.subarray(0, 16))
    expect(vectors['copy.id']).toBe(
      `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`
    )
    expect(vectors['event.id']).toBe(
      toB64u(
        nodeSha256(
          `ww-spaces/v1/car-event|car.invite|${inboxId}|${toB64u(counting(16, 0x60))}|${toB64u(counting(16, 0x80))}`
        ).subarray(0, 16)
      )
    )
  })
})
