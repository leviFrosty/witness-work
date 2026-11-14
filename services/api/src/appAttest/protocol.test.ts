import { describe, expect, it } from 'vitest'
import {
  buildNotesImportRequestCanonicalJson,
  buildV2AssertionClientData,
  buildV2BindClientData,
  buildV2ChallengeDescriptor,
  buildV2EnrollClientData,
  computeNotesImportRequestHash,
  deriveRecoveryTokenMaterial,
  isAppAttestKeyId,
  type V2AssertionChallengeRequest,
} from './protocol'

describe('App Attest v2 client-data contract', () => {
  it('domain-separates bind, enroll, and protected assertions byte-for-byte', () => {
    expect(
      buildV2BindClientData({
        operationId: 'bind-operation',
        challenge: 'challenge',
        uuid: 'install-uuid',
        tokenHash: 'token-hash',
      })
    ).toBe(
      'witnesswork.app-attest|2|bind|bind-operation|challenge|install-uuid|token-hash'
    )

    expect(
      buildV2EnrollClientData({
        operationId: 'enroll-operation',
        challenge: 'challenge',
        uuid: 'install-uuid',
        keyId: 'active-key',
        tokenHash: 'token-hash',
      })
    ).toBe(
      'witnesswork.app-attest|2|enroll|enroll-operation|challenge|install-uuid|active-key|token-hash'
    )

    expect(
      buildV2AssertionClientData({
        purpose: 'notes-import-verify',
        operationId: 'assert-operation',
        challenge: 'challenge',
        uuid: 'install-uuid',
        contentHash: 'content-hash',
        requestHash: 'request-hash',
      })
    ).toBe(
      'witnesswork.app-attest|2|assert|notes-import-verify|assert-operation|challenge|install-uuid||content-hash|request-hash'
    )
    expect(
      buildV2AssertionClientData({
        purpose: 'notes-import-kickoff',
        operationId: 'assert-operation',
        challenge: 'challenge',
        uuid: 'install-uuid',
        accountId: 'account-id',
        contentHash: 'content-hash',
        requestHash: 'request-hash',
      })
    ).toBe(
      'witnesswork.app-attest|2|assert|notes-import-kickoff|assert-operation|challenge|install-uuid|account-id|content-hash|request-hash'
    )
  })

  it('publishes stable canonical request JSON and lowercase SHA-256 golden vectors', async () => {
    const vectors = [
      {
        input: {
          notesText: 'Met Ana\nReturn Tuesday',
          context: {
            existingContacts: [
              { name: 'Zoe', id: 'contact-2' },
              { id: 'contact-1', name: 'Ana' },
            ],
            categories: ['Return Visit', 'Bible Study'],
            locale: 'en-US',
          },
        },
        canonical:
          '{"context":{"categories":["Return Visit","Bible Study"],"existingContacts":[{"id":"contact-2","name":"Zoe"},{"id":"contact-1","name":"Ana"}],"locale":"en-US"},"notesText":"Met Ana\\nReturn Tuesday","refinement":null}',
        hash: '022bb5d93a09241655bf5a32a2b25308b15e3bc75ebfd4524685c9a90b603148',
      },
      {
        input: {
          notesText: '"Quoted" notes',
          context: { z: 0, a: { b: true, a: null } },
          refinement: {
            previousResultJSON: '{"summary":"First"}',
            instruction: 'Use category A',
          },
        },
        canonical:
          '{"context":{"a":{"a":null,"b":true},"z":0},"notesText":"\\"Quoted\\" notes","refinement":{"instruction":"Use category A","previousResultJSON":"{\\"summary\\":\\"First\\"}"}}',
        hash: '20f7f37109aeb2dd614788a2ff71bcd5a278a357fe065b77677ce1f6419da679',
      },
    ]

    for (const vector of vectors) {
      expect(buildNotesImportRequestCanonicalJson(vector.input)).toBe(
        vector.canonical
      )
      await expect(computeNotesImportRequestHash(vector.input)).resolves.toBe(
        vector.hash
      )
    }
  })

  it('is stable across object insertion order and changes for every protected payload field', async () => {
    const first = {
      notesText: 'same notes',
      context: { z: [3, { b: 2, a: 1 }], a: true },
      refinement: null,
    }
    const reordered = {
      notesText: 'same notes',
      context: { a: true, z: [3, { a: 1, b: 2 }] },
      refinement: null,
    }

    expect(buildNotesImportRequestCanonicalJson(first)).toBe(
      buildNotesImportRequestCanonicalJson(reordered)
    )
    await expect(computeNotesImportRequestHash(first)).resolves.toBe(
      await computeNotesImportRequestHash(reordered)
    )

    const originalHash = await computeNotesImportRequestHash(first)
    const mutations = [
      { ...first, notesText: 'changed notes' },
      { ...first, context: { ...first.context, a: false } },
      {
        ...first,
        refinement: {
          previousResultJSON: '{"summary":"Earlier"}',
          instruction: 'Try again',
        },
      },
    ]
    for (const mutation of mutations) {
      await expect(computeNotesImportRequestHash(mutation)).resolves.not.toBe(
        originalHash
      )
    }
  })

  it('binds accountId, contentHash, and requestHash into assertion challenge descriptors', () => {
    const request = {
      protocolVersion: 2,
      operation: 'assert',
      operationId: 'assert-operation',
      uuid: 'install-uuid',
      keyId: 'active-key',
      purpose: 'notes-import-kickoff',
      accountId: 'account-id',
      contentHash: 'content-hash',
      requestHash: 'request-hash',
    } satisfies V2AssertionChallengeRequest

    const descriptor = buildV2ChallengeDescriptor(request)
    expect(descriptor).toBe(
      'witnesswork.app-attest|2|challenge|assert|assert-operation|install-uuid|active-key|notes-import-kickoff|account-id|content-hash|request-hash'
    )
    for (const mutation of [
      { ...request, accountId: 'changed-account' },
      { ...request, contentHash: 'changed-content' },
      { ...request, requestHash: 'changed-request' },
    ]) {
      expect(buildV2ChallengeDescriptor(mutation)).not.toBe(descriptor)
    }
  })

  it('derives the published 256-bit recovery-token hash and stored verifier vector', async () => {
    await expect(
      deriveRecoveryTokenMaterial(
        'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE'
      )
    ).resolves.toEqual({
      tokenHash: 'cs1uhCLEB_ttCYaQ8RMLfe1-wvf14dML2dUh8BU2N5M',
      verifier: 'G3OATWoQBw6jqqNKLE8vblZ9yKgf4uEJhZow-puWWzk',
    })
  })

  it('accepts only canonical 32-byte Apple key identifiers in v2', () => {
    expect(
      isAppAttestKeyId('sVDPRuerjbV83x+vholYh+EwttQgP9BlbLyeZhgI+8k=')
    ).toBe(true)
    expect(
      isAppAttestKeyId('sVDPRuerjbV83x-vholYh-EwttQgP9BlbLyeZhgI-8k')
    ).toBe(false)
    expect(isAppAttestKeyId(`${'B'.repeat(43)}=`)).toBe(false)
  })

  it('rejects tokens that are not exactly 32-byte unpadded base64url', async () => {
    await expect(deriveRecoveryTokenMaterial('too-short')).resolves.toBeNull()
    await expect(
      deriveRecoveryTokenMaterial(
        'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQF'
      )
    ).resolves.toBeNull()
    await expect(
      deriveRecoveryTokenMaterial(
        'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE='
      )
    ).resolves.toBeNull()
  })
})
