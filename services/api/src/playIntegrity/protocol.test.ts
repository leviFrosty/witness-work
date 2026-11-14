import { describe, expect, it } from 'vitest'
import {
  buildPlayIntegrityChallengeDescriptor,
  buildPlayIntegrityClientData,
  computePlayIntegrityRequestBinding,
  isPlayIntegrityRequest,
  parsePlayIntegrityAssertionRequest,
  parsePlayIntegrityChallengeRequest,
} from './protocol'

const UUID = '65A8B00C-DA7A-4E0A-BA5C-8E3D1B8C5F1C'
const CONTENT_HASH =
  'e0129726d5d80305a40c79da48fae94cdf34a3e95b8a476c5287f268699d7097'
const REQUEST_HASH =
  '022bb5d93a09241655bf5a32a2b25308b15e3bc75ebfd4524685c9a90b603148'
const CHALLENGE = 'C'.repeat(43)

const challengeBody = {
  attestationProvider: 'play-integrity',
  protocolVersion: 1,
  operation: 'assert',
  operationId: 'play-operation-1',
  uuid: UUID,
  accountId: 'account-id-1',
  purpose: 'notes-import-kickoff',
  contentHash: CONTENT_HASH,
  requestHash: REQUEST_HASH,
}

describe('Play Integrity protocol', () => {
  it('only claims bodies that explicitly opt in', () => {
    expect(isPlayIntegrityRequest(challengeBody)).toBe(true)
    expect(isPlayIntegrityRequest({ protocolVersion: 2 })).toBe(false)
    expect(isPlayIntegrityRequest({ attestationProvider: 'app-attest' })).toBe(
      false
    )
    expect(isPlayIntegrityRequest(null)).toBe(false)
  })

  it('parses a challenge request and drops unknown fields', () => {
    expect(
      parsePlayIntegrityChallengeRequest({ ...challengeBody, extra: 'x' })
    ).toEqual(challengeBody)
  })

  it.each([
    ['protocol version', { protocolVersion: 2 }],
    ['operation', { operation: 'bind' }],
    ['App Attest key', { keyId: `${'A'.repeat(43)}=` }],
    ['operation id', { operationId: 'short' }],
    ['uuid', { uuid: 'has|pipe' }],
    ['account id', { accountId: 'has|pipe-account' }],
    ['purpose', { purpose: 'notes-import-anything' }],
    ['content hash', { contentHash: 'A'.repeat(64) }],
    ['request hash', { requestHash: 'abc' }],
  ])('rejects an invalid %s', (_name, override) => {
    expect(
      parsePlayIntegrityChallengeRequest({ ...challengeBody, ...override })
    ).toBeNull()
  })

  it('requires a challenge and a token-shaped integrity token, never an assertion', () => {
    const body = {
      ...challengeBody,
      challenge: CHALLENGE,
      integrityToken: 'eyJhbGciOi.abc_def-ghi.jkl',
    }
    expect(
      parsePlayIntegrityAssertionRequest(body, 'notes-import-kickoff')
    ).toMatchObject({ challenge: CHALLENGE })
    expect(
      parsePlayIntegrityAssertionRequest(body, 'notes-import-verify')
    ).toBeNull()
    expect(
      parsePlayIntegrityAssertionRequest(
        { ...body, assertion: 'apple' },
        'notes-import-kickoff'
      )
    ).toBeNull()
    expect(
      parsePlayIntegrityAssertionRequest(
        { ...body, integrityToken: 'has space' },
        'notes-import-kickoff'
      )
    ).toBeNull()
    expect(
      parsePlayIntegrityAssertionRequest(
        { ...body, integrityToken: 'a'.repeat(32_769) },
        'notes-import-kickoff'
      )
    ).toBeNull()
  })

  it('binds every protected field into the descriptor and client data', async () => {
    const request = parsePlayIntegrityChallengeRequest(challengeBody)!
    expect(buildPlayIntegrityChallengeDescriptor(request)).toBe(
      [
        'witnesswork.play-integrity',
        '1',
        'challenge',
        'assert',
        'play-operation-1',
        UUID,
        'account-id-1',
        'notes-import-kickoff',
        CONTENT_HASH,
        REQUEST_HASH,
      ].join('|')
    )
    const signed = { ...request, challenge: CHALLENGE }
    expect(buildPlayIntegrityClientData(signed)).toBe(
      [
        'witnesswork.play-integrity',
        '1',
        'assert',
        'notes-import-kickoff',
        'play-operation-1',
        CHALLENGE,
        UUID,
        'account-id-1',
        CONTENT_HASH,
        REQUEST_HASH,
      ].join('|')
    )
    // Golden shared with the witness-work client builder test.
    await expect(computePlayIntegrityRequestBinding(signed)).resolves.toBe(
      '75142f154cfe8b4a2e20220371bfe27d127f93fda168c93d8578c28b508ed08a'
    )
  })

  it('leaves an absent account id empty rather than shifting fields', () => {
    const { accountId: _accountId, ...withoutAccount } = challengeBody
    const request = parsePlayIntegrityChallengeRequest(withoutAccount)!
    expect(
      buildPlayIntegrityClientData({ ...request, challenge: CHALLENGE })
    ).toContain(`|${UUID}||${CONTENT_HASH}|`)
  })
})
