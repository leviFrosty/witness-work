import { describe, expect, it } from 'vitest'
import { fromB64u, fromUtf8, toB64u } from '@/lib/bytes'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import {
  derivePasskeyWrapKey,
  newPasskeyWrapId,
  openPasskeyWraps,
  PASSKEY_PRF_SALT,
  PASSKEY_PRF_SALT_B64U,
  passkeyName,
  passkeyTag,
  prfOutputOf,
  unwrapAccountKey,
  withoutPrfResults,
  wrapAccountKey,
} from '@/lib/serverAccount/passkeys'
import vectors from '@/lib/serverAccount/testing/passkeyVectors.json'

const bytes = (length: number, start = 0) =>
  Uint8Array.from({ length }, (_, index) => (start + index) & 0xff)

const hex = (value: Uint8Array) => Buffer.from(value).toString('hex')
const fromHex = (value: string) => new Uint8Array(Buffer.from(value, 'hex'))

describe('passkey PRF salt', () => {
  it('is the UTF-8 of the versioned label', () => {
    expect(fromUtf8(PASSKEY_PRF_SALT)).toBe('ww-account/v1/passkey-prf')
    expect(PASSKEY_PRF_SALT_B64U).toBe(toB64u(PASSKEY_PRF_SALT))
    expect(vectors.prfSalt.b64u).toBe(PASSKEY_PRF_SALT_B64U)
  })
})

describe('passkey tag and name', () => {
  it('matches the contract vector', () => {
    expect(passkeyTag(toB64u(bytes(32)))).toBe('KVW7')
    expect(passkeyName(toB64u(bytes(32)))).toBe('WitnessWork KVW7')
  })

  it('matches every tag vector', () => {
    for (const vector of vectors.tags) {
      expect(passkeyTag(vector.userHandle)).toBe(vector.tag)
      expect(passkeyName(vector.userHandle)).toBe(vector.name)
    }
  })

  it('only uses Crockford base32', () => {
    for (let start = 0; start < 64; start++) {
      expect(passkeyTag(toB64u(bytes(32, start * 7)))).toMatch(
        /^[0-9A-HJKMNP-TV-Z]{4}$/
      )
    }
  })

  it('refuses a handle that is not b64u', () => {
    expect(() => passkeyTag('not b64u!')).toThrow()
    expect(() => passkeyTag('')).toThrow()
  })
})

describe('passkey wraps', () => {
  const accountKey = bytes(32, 0x40)
  const prfOutput = bytes(32, 0x80)
  const accountId = toB64u(bytes(16, 0x10))
  const credentialId = toB64u(bytes(20, 0xa0))
  const nonce = bytes(24, 0xc0)

  it('matches the wrap vectors', () => {
    for (const vector of vectors.wraps) {
      const input = {
        prfOutput: fromHex(vector.prfOutputHex),
        accountKey: fromHex(vector.accountKeyHex),
        accountId: vector.accountId,
        credentialId: vector.credentialId,
        keyEpoch: vector.keyEpoch,
      }
      expect(
        hex(derivePasskeyWrapKey(input.prfOutput, input.credentialId))
      ).toBe(vector.wrapKeyHex)
      const wrap = wrapAccountKey(input, fromHex(vector.nonceHex))
      expect(wrap).toBe(vector.wrap)
      expect(wrap).toHaveLength(98)
      expect(hex(unwrapAccountKey({ ...input, wrap }))).toBe(
        vector.accountKeyHex
      )
      expect(deriveAccountSigningKey(input.accountKey).publicKey).toBe(
        vector.accountPub
      )
    }
  })

  it('is 0x01 ‖ nonce ‖ ciphertext and 98 characters', () => {
    const wrap = wrapAccountKey(
      { prfOutput, accountKey, accountId, credentialId, keyEpoch: 0 },
      nonce
    )
    const raw = fromB64u(wrap)
    expect(wrap).toHaveLength(98)
    expect(raw[0]).toBe(1)
    expect(raw.subarray(1, 25)).toEqual(nonce)
    expect(raw).toHaveLength(1 + 24 + 32 + 16)
  })

  it('binds the account, the credential and the key epoch', () => {
    const input = {
      prfOutput,
      accountKey,
      accountId,
      credentialId,
      keyEpoch: 0,
    }
    const wrap = wrapAccountKey(input, nonce)
    expect(() =>
      unwrapAccountKey({ ...input, wrap, accountId: toB64u(bytes(16, 1)) })
    ).toThrow()
    expect(() =>
      unwrapAccountKey({ ...input, wrap, credentialId: toB64u(bytes(20, 1)) })
    ).toThrow()
    expect(() => unwrapAccountKey({ ...input, wrap, keyEpoch: 1 })).toThrow()
    expect(() =>
      unwrapAccountKey({ ...input, wrap, prfOutput: bytes(32, 1) })
    ).toThrow()
  })

  it('refuses bad sizes', () => {
    const input = {
      prfOutput,
      accountKey,
      accountId,
      credentialId,
      keyEpoch: 0,
    }
    expect(() =>
      wrapAccountKey({ ...input, accountKey: bytes(31) }, nonce)
    ).toThrow()
    expect(() =>
      wrapAccountKey({ ...input, prfOutput: bytes(16) }, nonce)
    ).toThrow()
    expect(() => wrapAccountKey(input, bytes(12))).toThrow()
    expect(() => wrapAccountKey({ ...input, keyEpoch: -1 }, nonce)).toThrow()
    expect(() => wrapAccountKey({ ...input, keyEpoch: 1.5 }, nonce)).toThrow()
  })

  it('makes 16-byte wrap ids', () => {
    expect(fromB64u(newPasskeyWrapId(() => bytes(16)))).toHaveLength(16)
  })
})

describe('openPasskeyWraps', () => {
  const accountKey = bytes(32, 0x40)
  const accountPub = deriveAccountSigningKey(accountKey).publicKey
  const prfOutput = bytes(32, 0x80)
  const accountId = toB64u(bytes(16, 0x10))
  const credentialId = toB64u(bytes(20, 0xa0))
  const wrapFor = (key: Uint8Array, prf = prfOutput, keyEpoch = 0) =>
    wrapAccountKey(
      { prfOutput: prf, accountKey: key, accountId, credentialId, keyEpoch },
      bytes(24, key[0])
    )
  const base = { prfOutput, accountId, accountPub, credentialId, keyEpoch: 0 }

  it('opens the wrap whose key derives accountPub', () => {
    const result = openPasskeyWraps({
      ...base,
      wraps: [
        {
          wrapId: 'other',
          wrap: wrapFor(accountKey, bytes(32, 3)),
          keyEpoch: 0,
        },
        { wrapId: 'mine', wrap: wrapFor(accountKey), keyEpoch: 0 },
      ],
    })
    expect(result).toEqual({
      ok: true,
      accountKey,
      wrapId: 'mine',
      keyEpoch: 0,
    })
  })

  it("can't unlock without wraps", () => {
    expect(openPasskeyWraps({ ...base, wraps: [] })).toEqual({
      ok: false,
      reason: 'noWraps',
    })
  })

  it("can't unlock without PRF output", () => {
    expect(
      openPasskeyWraps({
        ...base,
        prfOutput: null,
        wraps: [{ wrapId: 'a', wrap: wrapFor(accountKey), keyEpoch: 0 }],
      })
    ).toEqual({ ok: false, reason: 'noPrf' })
  })

  it("can't unlock when no wrap opens", () => {
    expect(
      openPasskeyWraps({
        ...base,
        wraps: [
          { wrapId: 'a', wrap: wrapFor(accountKey, bytes(32, 9)), keyEpoch: 0 },
          { wrapId: 'b', wrap: 'garbage', keyEpoch: 0 },
        ],
      })
    ).toEqual({ ok: false, reason: 'noneOpened' })
  })

  it('never trusts a wrap that opens to another key', () => {
    expect(
      openPasskeyWraps({
        ...base,
        wraps: [{ wrapId: 'a', wrap: wrapFor(bytes(32, 0x41)), keyEpoch: 0 }],
      })
    ).toEqual({ ok: false, reason: 'wrongKey' })
  })

  it("opens a wrap under the account's epoch", () => {
    const result = openPasskeyWraps({
      ...base,
      keyEpoch: 2,
      wraps: [
        {
          wrapId: 'e2',
          wrap: wrapFor(accountKey, prfOutput, 2),
          keyEpoch: 2,
        },
      ],
    })
    expect(result).toMatchObject({ ok: true, keyEpoch: 2 })
  })

  it("skips a wrap for another epoch than the account's", () => {
    const stale = {
      wrapId: 'old',
      wrap: wrapFor(accountKey, prfOutput, 1),
      keyEpoch: 1,
    }
    expect(openPasskeyWraps({ ...base, keyEpoch: 2, wraps: [stale] })).toEqual({
      ok: false,
      reason: 'noWraps',
    })
    expect(
      openPasskeyWraps({
        ...base,
        keyEpoch: 2,
        wraps: [
          stale,
          {
            wrapId: 'new',
            wrap: wrapFor(accountKey, prfOutput, 2),
            keyEpoch: 2,
          },
        ],
      })
    ).toMatchObject({ ok: true, wrapId: 'new', keyEpoch: 2 })
  })
})

describe('PRF results', () => {
  const output = bytes(32, 5)

  it('reads b64u, bytes or ArrayBuffer output', () => {
    const of = (first: unknown) =>
      prfOutputOf({ clientExtensionResults: { prf: { results: { first } } } })
    expect(of(toB64u(output))).toEqual(output)
    expect(of(output)).toEqual(output)
    expect(of(output.slice().buffer)).toEqual(output)
    expect(of(toB64u(bytes(16)))).toBeNull()
    expect(of(undefined)).toBeNull()
    expect(prfOutputOf({})).toBeNull()
  })

  it('drops PRF results before a response is posted', () => {
    const response = {
      id: 'cred',
      rawId: 'cred',
      type: 'public-key',
      response: { clientDataJSON: 'x' },
      clientExtensionResults: {
        prf: { enabled: true, results: { first: toB64u(output) } },
        credProps: { rk: true },
      },
    }
    const stripped = withoutPrfResults(response)
    expect(stripped.clientExtensionResults).toEqual({ credProps: { rk: true } })
    expect(JSON.stringify(stripped)).not.toContain(toB64u(output))
    // The original is untouched; its PRF output is still the caller's.
    expect(response.clientExtensionResults.prf.results.first).toBe(
      toB64u(output)
    )
  })
})
