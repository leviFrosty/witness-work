import { describe, expect, it } from 'vitest'
import { normalizeResponseJson, toUnpaddedB64u } from './normalize'

const parse = (json: string) => JSON.parse(json) as Record<string, unknown>

const response = (clientExtensionResults?: unknown) =>
  JSON.stringify({
    id: 'cred',
    rawId: 'cred',
    type: 'public-key',
    response: { clientDataJSON: 'e30' },
    ...(clientExtensionResults === undefined ? {} : { clientExtensionResults }),
  })

describe('toUnpaddedB64u', () => {
  it('turns padded standard base64 into unpadded base64url', () => {
    expect(toUnpaddedB64u('+/+/ab==')).toBe('-_-_ab')
    expect(toUnpaddedB64u('abc=')).toBe('abc')
  })

  it('leaves base64url alone', () => {
    expect(toUnpaddedB64u('-_-_ab')).toBe('-_-_ab')
  })
})

describe('normalizeResponseJson', () => {
  it('adds clientExtensionResults when the provider left it out', () => {
    expect(
      parse(normalizeResponseJson(response())).clientExtensionResults
    ).toEqual({})
  })

  it('keeps the rest of the response untouched', () => {
    const out = parse(
      normalizeResponseJson(response({ credProps: { rk: true } }))
    )
    expect(out).toEqual({
      id: 'cred',
      rawId: 'cred',
      type: 'public-key',
      response: { clientDataJSON: 'e30' },
      clientExtensionResults: { credProps: { rk: true } },
    })
  })

  it('normalizes a padded PRF result and drops the second output', () => {
    const out = parse(
      normalizeResponseJson(
        response({
          prf: { enabled: true, results: { first: 'ab+/cd==', second: 'zz' } },
        })
      )
    )
    expect(out.clientExtensionResults).toEqual({
      prf: { enabled: true, results: { first: 'ab-_cd' } },
    })
  })

  it('keeps enabled on its own', () => {
    const out = parse(
      normalizeResponseJson(response({ prf: { enabled: false } }))
    )
    expect(out.clientExtensionResults).toEqual({ prf: { enabled: false } })
  })

  it('drops an empty or malformed prf', () => {
    for (const prf of [
      {},
      null,
      'x',
      { results: { first: 3 } },
      { results: {} },
    ]) {
      expect(
        parse(normalizeResponseJson(response({ prf }))).clientExtensionResults
      ).toEqual({})
    }
  })
})
