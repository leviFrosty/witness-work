import { describe, expect, it } from 'vitest'
import { encode } from 'cbor2'
import { verifyAssertionCryptography } from './assert'
import { AppAttestError } from './errors'
import { appIdRpHash } from './appId'
import { buildAssertionClientData } from './clientData'
import { base64ToBytes, bytesToBase64Url, sha256Bytes } from '../crypto'

const TEAM = 'ABCDE12345'
const BUNDLE = 'com.example.app'

const concat = (a: Uint8Array, b: Uint8Array) => {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

/** Encode a WebCrypto raw (r||s) ECDSA signature as DER, like Apple does. */
const rawEcdsaToDer = (raw: Uint8Array): Uint8Array => {
  const derInt = (b: Uint8Array): Uint8Array => {
    let i = 0
    while (i < b.length - 1 && b[i] === 0) i++
    let v = b.subarray(i)
    if (v[0] & 0x80) {
      const t = new Uint8Array(v.length + 1)
      t.set(v, 1)
      v = t
    }
    return new Uint8Array([0x02, v.length, ...v])
  }
  const body = concat(derInt(raw.subarray(0, 32)), derInt(raw.subarray(32, 64)))
  return new Uint8Array([0x30, body.length, ...body])
}

const setup = async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  )
  const spki = bytesToBase64Url(
    new Uint8Array(
      (await crypto.subtle.exportKey('spki', pair.publicKey)) as ArrayBuffer
    )
  )

  const buildAuthData = async (signCount: number, flags = 0) => {
    const rp = await appIdRpHash(TEAM, BUNDLE)
    const ad = new Uint8Array(37)
    ad.set(rp, 0)
    ad[32] = flags
    new DataView(ad.buffer).setUint32(33, signCount, false)
    return ad
  }

  const makeAssertion = async (opts: {
    clientData: string
    signCount: number
    flags?: number
  }) => {
    const authData = await buildAuthData(opts.signCount, opts.flags ?? 0)
    const clientDataHash = await sha256Bytes(
      new TextEncoder().encode(opts.clientData)
    )
    const nonce = await sha256Bytes(concat(authData, clientDataHash))
    const rawSig = new Uint8Array(
      await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        pair.privateKey,
        nonce
      )
    )
    return bytesToBase64Url(
      encode({
        signature: rawEcdsaToDer(rawSig),
        authenticatorData: authData,
      })
    )
  }

  const verify = (assertion: string, clientData: string) =>
    verifyAssertionCryptography({
      assertion,
      spki,
      clientData,
      teamId: TEAM,
      bundleId: BUNDLE,
    })

  return { makeAssertion, verify }
}

const v1ClientData = (overrides: Partial<{
  challenge: string
  uuid: string
  accountId: string
  contentHash: string
}> = {}) =>
  buildAssertionClientData({
    challenge: overrides.challenge ?? 'challenge-1',
    uuid: overrides.uuid ?? 'uuid-1',
    accountId: overrides.accountId,
    contentHash: overrides.contentHash ?? 'hash-1',
  })

describe('verifyAssertionCryptography', () => {
  it('accepts a valid assertion and returns its counter without storing policy state', async () => {
    const { makeAssertion, verify } = await setup()
    const clientData = v1ClientData()
    const assertion = await makeAssertion({ clientData, signCount: 7 })

    await expect(verify(assertion, clientData)).resolves.toEqual({ signCount: 7 })
  })

  it('accepts real-device 37-byte authenticator data with the AT flag set', async () => {
    const { makeAssertion, verify } = await setup()
    const clientData = v1ClientData()
    const assertion = await makeAssertion({
      clientData,
      signCount: 1,
      flags: 0x40,
    })

    await expect(verify(assertion, clientData)).resolves.toEqual({ signCount: 1 })
  })

  it('reports malformed assertions as AppAttestError', async () => {
    const { verify } = await setup()
    const malformed = bytesToBase64Url(
      encode({
        signature: new Uint8Array([1, 2, 3]),
        authenticatorData: new Uint8Array(10),
      })
    )

    await expect(verify(malformed, v1ClientData())).rejects.toBeInstanceOf(
      AppAttestError
    )
  })

  it('rejects client data changed after signing', async () => {
    const { makeAssertion, verify } = await setup()
    const signed = v1ClientData({ contentHash: 'signed-hash' })
    const assertion = await makeAssertion({ clientData: signed, signCount: 1 })

    await expect(
      verify(assertion, v1ClientData({ contentHash: 'different-hash' }))
    ).rejects.toThrow('assertion signature invalid')
  })

  it('binds an optional account id into the signed data', async () => {
    const { makeAssertion, verify } = await setup()
    const signed = v1ClientData({ accountId: 'account-1' })
    const assertion = await makeAssertion({ clientData: signed, signCount: 1 })

    await expect(verify(assertion, signed)).resolves.toEqual({ signCount: 1 })
    await expect(
      verify(assertion, v1ClientData({ accountId: 'account-2' }))
    ).rejects.toThrow('assertion signature invalid')
  })
})

describe('verifyAssertionCryptography (captured real-device fixture)', () => {
  // Levi's public key/assertion capture pins the to-be-signed message to actual
  // Secure Enclave behavior rather than to the synthetic signer above.
  const FIXTURE = {
    teamId: 'Y3KE7B7AHJ',
    bundleId: 'com.leviwilkerson.jwtime',
    uuid: '65A8B00C-DA7A-4E0A-BA5C-8E3D1B8C5F1C',
    accountId: '65A8B00C-DA7A-4E0A-BA5C-8E3D1B8C5F1C',
    challenge: 'Ofu3bubTCTXH-xVXg8DOfaBha2KXq9kx4q7n61fvjiE',
    contentHash:
      '2cd3ff6962f569cd7b328f7c7fae72ce36e6fedd5f2fd1e172c73b4156c77184',
    spki: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAELY66tAKMMvuOymEnOhvE6rspbpTBUOJL46iDxYK8w5A1MTJGEZSIHoI5xgRi7l33TjfYP69-2QxYLp7C45ajcQ',
    authenticatorData: 'GGeAsV7N4dOwSQdAhz2pQI2VH8icOWVMZ4l-wJbm9gtAAAAAGg',
    signatureDer:
      'MEUCIQCL_IvSSGA3ffEKmsu0XE4ET5HVWzS1aO9cC4Pmc-cb8AIgEmYBgoJOkZVqcRSMDyDnlTEBe0-0-YtznMLEPUhOwYQ',
  }

  const assertion = () =>
    bytesToBase64Url(
      encode({
        signature: base64ToBytes(FIXTURE.signatureDer),
        authenticatorData: base64ToBytes(FIXTURE.authenticatorData),
      })
    )

  const clientData = (contentHash = FIXTURE.contentHash) =>
    buildAssertionClientData({
      challenge: FIXTURE.challenge,
      uuid: FIXTURE.uuid,
      accountId: FIXTURE.accountId,
      contentHash,
    })

  it('verifies the capture and returns its hardware counter', async () => {
    await expect(
      verifyAssertionCryptography({
        assertion: assertion(),
        spki: FIXTURE.spki,
        clientData: clientData(),
        teamId: FIXTURE.teamId,
        bundleId: FIXTURE.bundleId,
      })
    ).resolves.toEqual({ signCount: 26 })
  })

  it('rejects the capture when a signed field changes', async () => {
    await expect(
      verifyAssertionCryptography({
        assertion: assertion(),
        spki: FIXTURE.spki,
        clientData: clientData(FIXTURE.contentHash.replace(/2/g, '3')),
        teamId: FIXTURE.teamId,
        bundleId: FIXTURE.bundleId,
      })
    ).rejects.toThrow('assertion signature invalid')
  })
})
