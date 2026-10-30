import { describe, expect, it } from 'vitest'
import { toB64u } from '@/lib/bytes'
import {
  PRF_SALT,
  prfEnabled,
  prfFirst,
  splitPrf,
  toCreatedPasskey,
  toPasskeyAssertion,
  withPrfSalt,
} from '@/lib/passkeys/prf'
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@/lib/passkeys/types'

const OUTPUT = Uint8Array.from({ length: 32 }, (_, i) => i)

it('salts with the account protocol label', () => {
  expect(new TextDecoder().decode(PRF_SALT)).toBe('ww-account/v1/passkey-prf')
})

describe('withPrfSalt', () => {
  it('sets eval.first and keeps the other extensions', () => {
    const options = {
      challenge: 'c',
      extensions: { credProps: true, prf: { eval: { first: 'old' } } },
    }
    expect(withPrfSalt(options, 'salt')).toEqual({
      challenge: 'c',
      extensions: { credProps: true, prf: { eval: { first: 'salt' } } },
    })
    expect(options.extensions.prf.eval.first).toBe('old')
  })

  it('adds extensions when there are none', () => {
    const buffer = new ArrayBuffer(2)
    const options: { challenge: string; extensions?: object } = {
      challenge: 'c',
    }
    expect(withPrfSalt(options, buffer).extensions).toEqual({
      prf: { eval: { first: buffer } },
    })
  })
})

describe('splitPrf', () => {
  it('removes prf and keeps the other results', () => {
    const raw = {
      id: 'x',
      clientExtensionResults: {
        credProps: { rk: true },
        prf: { enabled: true },
      },
    }
    const { response, prf } = splitPrf(raw)
    expect(response).toEqual({
      id: 'x',
      clientExtensionResults: { credProps: { rk: true } },
    })
    expect(prf).toEqual({ enabled: true })
    expect(raw.clientExtensionResults.prf).toEqual({ enabled: true })
  })

  it('adds empty results when there were none', () => {
    expect(
      splitPrf({ id: 'x' } as { id: string; clientExtensionResults?: object })
    ).toEqual({
      response: { id: 'x', clientExtensionResults: {} },
      prf: undefined,
    })
  })
})

describe('prfEnabled', () => {
  it('reads a boolean and nothing else', () => {
    expect(prfEnabled({ enabled: true })).toBe(true)
    expect(prfEnabled({ enabled: false })).toBe(false)
    expect(prfEnabled({ enabled: 'yes' })).toBeNull()
    expect(prfEnabled({})).toBeNull()
    expect(prfEnabled(undefined)).toBeNull()
  })
})

describe('prfFirst', () => {
  it('decodes base64url from the native module', () => {
    expect(prfFirst({ results: { first: toB64u(OUTPUT) } })).toEqual(OUTPUT)
  })

  it('copies an ArrayBuffer from the browser', () => {
    const buffer = OUTPUT.slice().buffer
    const bytes = prfFirst({ results: { first: buffer } })
    expect(bytes).toEqual(OUTPUT)
    expect(bytes!.buffer).not.toBe(buffer)
  })

  it('copies only the viewed bytes of a view', () => {
    const view = new Uint8Array([0, ...OUTPUT, 0]).subarray(1, 33)
    expect(prfFirst({ results: { first: view } })).toEqual(OUTPUT)
  })

  it('is null when absent, empty, malformed or not 32 bytes', () => {
    for (const prf of [
      { results: { first: 'AQL_' } },
      { results: { first: toB64u(new Uint8Array(31)) } },
      { results: { first: toB64u(new Uint8Array(33)) } },
      { results: { first: new Uint8Array(64).buffer } },
      undefined,
      {},
      { enabled: true },
      { results: {} },
      { results: { first: '' } },
      { results: { first: new ArrayBuffer(0) } },
      { results: { first: 'not base64url!' } },
      { results: { first: 42 } },
    ]) {
      expect(prfFirst(prf)).toBeNull()
    }
  })
})

describe('toCreatedPasskey', () => {
  const registration = (prf?: unknown) =>
    ({
      id: 'x',
      rawId: 'x',
      type: 'public-key',
      response: { clientDataJSON: 'e30', attestationObject: 'o2Nm' },
      clientExtensionResults: prf === undefined ? {} : { prf },
    }) as RegistrationResponseJSON

  it('strips PRF and returns its facts', () => {
    const created = toCreatedPasskey(
      registration({ enabled: true, results: { first: toB64u(OUTPUT) } })
    )
    expect(created.response.clientExtensionResults).toEqual({})
    expect(created.prf).toEqual({ enabled: true, first: OUTPUT })
  })

  it('reports nothing when PRF is absent', () => {
    expect(toCreatedPasskey(registration()).prf).toEqual({
      enabled: null,
      first: null,
    })
  })
})

describe('toPasskeyAssertion', () => {
  it('strips PRF and returns the output', () => {
    // Native PRF output is base64url, which the browser types don't allow.
    const prf: unknown = { results: { first: toB64u(OUTPUT) } }
    const assertion = toPasskeyAssertion({
      id: 'x',
      rawId: 'x',
      type: 'public-key',
      response: {
        clientDataJSON: 'e30',
        authenticatorData: 'YQ',
        signature: 'cw',
      },
      clientExtensionResults: { prf },
    } as AuthenticationResponseJSON)
    expect(assertion.response.clientExtensionResults).toEqual({})
    expect(assertion.prf).toEqual(OUTPUT)
  })
})
