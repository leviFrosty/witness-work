import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import {
  DEV_BYPASS_TOKEN,
  configured,
  enableLegacyNotesImport,
  http,
  writeTranscript,
} from '../test/e2e'

/**
 * Notes Import without inference: the attestation verify probe (dev bypass),
 * the App Attest challenge, their old /notes-import paths, and kickoff's auth
 * gate. A real kickoff calls OpenRouter (paid),
 * so it only runs with WW_API_E2E_ALLOW_PAID=1 plus a dev bypass. Local
 * workers also need OPENROUTER_API_KEY; deployed workers use their own secret.
 */

afterAll(() => {
  writeTranscript('notes-import')
})

// Notes Import answers only behind Scribe AI's legacy switch (src/scribe/legacy.ts).
let restoreLegacy = () => {}
beforeAll(() => {
  restoreLegacy = enableLegacyNotesImport()
})
afterAll(() => {
  restoreLegacy()
})

const bypass = (token = DEV_BYPASS_TOKEN ?? '') => ({
  'x-ww-dev-bypass': token,
  ...(process.env.WW_API_VERSION_OVERRIDES
    ? { 'Cloudflare-Workers-Version-Overrides': process.env.WW_API_VERSION_OVERRIDES }
    : {}),
})
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

describe.skipIf(!DEV_BYPASS_TOKEN)('POST /attestation/v1/verify with the dev bypass', () => {
  it('accepts a v1 probe', async () => {
    const res = await http('POST', '/attestation/v1/verify', {
      body: {},
      headers: bypass(),
    })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('echoes a valid v2 probe operationId', async () => {
    const hash = sha256('verify-probe')
    const operationId = `op_${randomUUID().replaceAll('-', '')}`
    const res = await http('POST', '/attestation/v1/verify', {
      headers: bypass(),
      body: {
        protocolVersion: 2,
        operation: 'assert',
        operationId,
        purpose: 'attestation-verify',
        contentHash: hash,
        requestHash: hash,
      },
    })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, protocolVersion: 2, operationId })
  })

  it('rejects a v2 probe whose requestHash differs', async () => {
    const res = await http('POST', '/attestation/v1/verify', {
      headers: bypass(),
      body: {
        protocolVersion: 2,
        operation: 'assert',
        operationId: 'op_mismatch01',
        purpose: 'attestation-verify',
        contentHash: sha256('a'),
        requestHash: sha256('b'),
      },
    })
    expect(res.status).toBe(400)
  })

  it('treats a wrong bypass token as an unattested request', async () => {
    const res = await http('POST', '/attestation/v1/verify', {
      body: {},
      headers: bypass('not-the-token'),
    })
    expect(res.status).toBe(400)
    expect(res.text).toContain('Missing uuid')
  })

  it('keeps the old path and purpose working, marked deprecated', async () => {
    const hash = sha256('verify-probe')
    const operationId = `op_${randomUUID().replaceAll('-', '')}`
    const res = await http('POST', '/notes-import/verify', {
      headers: bypass(),
      body: {
        protocolVersion: 2,
        operation: 'assert',
        operationId,
        purpose: 'notes-import-verify',
        contentHash: hash,
        requestHash: hash,
      },
    })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, protocolVersion: 2, operationId })
    expect(res.headers.get('deprecation')).toMatch(/^@\d+$/)
    expect(res.headers.get('link')).toBe('</attestation/v1/verify>; rel="successor-version"')
  })

  it('rejects malformed JSON', async () => {
    const res = await http('POST', '/attestation/v1/verify', {
      raw: '{not json',
      headers: bypass(),
    })
    expect(res.status).toBe(400)
  })
})

describe('App Attest handshake (no inference)', () => {
  it('POST /attestation/v1/challenge issues a challenge', async () => {
    const res = await http('POST', '/attestation/v1/challenge', { body: {} })
    expect(res.status).toBe(200)
    expect(typeof res.body.challenge).toBe('string')
    expect(res.body.challenge.length).toBeGreaterThan(16)
    expect(res.headers.get('deprecation')).toBeNull()
  })

  it('POST /notes-import/challenge still issues one, marked deprecated', async () => {
    const res = await http('POST', '/notes-import/challenge', { body: {} })
    expect(res.status).toBe(200)
    expect(typeof res.body.challenge).toBe('string')
    expect(res.headers.get('deprecation')).toMatch(/^@\d+$/)
    expect(res.headers.get('link')).toBe('</attestation/v1/challenge>; rel="successor-version"')
  })

  it('GET /attestation/v1/status lists App Attest', async () => {
    const res = await http('GET', '/attestation/v1/status')
    expect(res.status).toBe(200)
    expect(res.body.providers.appAttest.protocolVersions).toEqual([1, 2])
  })

  it('kickoff without credentials is refused before any model call', async () => {
    const status = await http('GET', '/notes-import/status')
    const res = await http('POST', '/notes-import/kickoff', {
      body: {
        uuid: randomUUID(),
        notesText: 'Visited Jane',
        context: {
          now: new Date().toISOString(),
          timeZone: 'UTC',
          existingContacts: [],
          existingCategories: [],
        },
      },
    })
    // 503 when the provider probe says no ZDR host is up; otherwise 401.
    expect(res.status).toBe(status.body.available ? 401 : 503)
  })

  it('stream endpoints refuse a missing token', async () => {
    const res = await http('GET', '/notes-import/someImportId/result')
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
  })
})

const allowPaid =
  process.env.WW_API_E2E_ALLOW_PAID === '1' &&
  (Boolean(process.env.WW_API_URL) || configured('OPENROUTER_API_KEY')) &&
  Boolean(DEV_BYPASS_TOKEN)

describe.skipIf(!allowPaid)('PAID: kickoff → result (WW_API_E2E_ALLOW_PAID=1)', () => {
  const context = {
    now: '2026-10-12T09:00:00-04:00',
    timeZone: 'America/New_York',
    existingContacts: [
      { id: 'existing-jane', name: 'Jane Doe', address: '12 Main St' },
      { id: 'existing-kami', name: 'Kami', address: '211 E Jefferson St' },
    ],
    existingCategories: [
      { id: 'standard', name: 'Standard', isCredit: false },
      { id: 'ldc', name: 'LDC', isCredit: true },
    ],
  }
  const notesText = `June 2026: 12 hours in field service.
October 1, 2026: 90 minutes RBC construction.
Yesterday visited Jane Doe, 12 Main St. Not at home. Return Friday October 16, 2026 at 6pm to discuss lesson 1.
I started as a regular pioneer on March 1, 2024.
October 2, 2026: visited Cammy at 2 E Jefferson St.
October 3, 2026: visited an older woman at 9 Oak St and left a contact card.`

  const importResult = async (body: unknown) => {
    const kickoff = await http('POST', '/notes-import/kickoff', {
      headers: bypass(), body,
    })
    expect(kickoff.status).toBe(200)
    const { importId, subscribeToken } = kickoff.body
    let result = { status: 'running' } as {
      status: string
      payload?: { result: import('../notesImport/schema').NotesImportResult }
    }
    const deadline = Date.now() + 170_000
    while (Date.now() < deadline && !['done', 'error', 'cancelled'].includes(result.status)) {
      await new Promise((resolve) => setTimeout(resolve, 3_000))
      result = (await http('GET', `/notes-import/${importId}/result?token=${subscribeToken}`)).body
    }
    expect(result.status).toBe('done')
    expect(result.payload).toBeDefined()
    return result.payload!.result
  }

  it('extracts dates, durations, deduplication, and roles, then preserves them through a correction',
    { timeout: 360_000 }, async () => {
      const uuid = randomUUID()
      const initial = await importResult({ uuid, notesText, context })
      expect(initial.contacts).toHaveLength(2)
      const cammy = initial.contacts.find(contact => contact.name === 'Cammy')!
      const unnamed = initial.contacts.find(contact => contact.name.toLowerCase().includes('older woman'))!
      expect(cammy.address?.line1).toContain('2 E Jefferson')
      expect(unnamed.address?.line1).toContain('9 Oak')
      expect(initial.visits.some(visit => visit.contactId === 'existing-kami')).toBe(false)
      expect(initial.categories).toEqual([])
      expect(initial.visits).toHaveLength(3)
      const jane = initial.visits.find(visit => visit.contactId === 'existing-jane')!
      expect(jane).toMatchObject({
        contactId: 'existing-jane', date: '2026-10-11',
        notAtHome: true, isBibleStudy: false,
      })
      expect(jane.followUp?.date).toContain('2026-10-16T18:00')
      expect(initial.timeEntries).toHaveLength(2)
      expect(initial.timeEntries).toEqual(expect.arrayContaining([
        expect.objectContaining({ date: '2026-06-01', hours: 12, minutes: 0, categoryId: 'standard' }),
        expect.objectContaining({ date: '2026-10-01', hours: 1, minutes: 30, categoryId: 'ldc', credit: true }),
      ]))
      expect(initial.publisher).toEqual({ role: 'regularPioneer', tenureStartDate: '2024-03-01' })
      expect(initial.warnings.some(warning => /monthly|representative/i.test(warning.message))).toBe(false)

      const corrected = await importResult({
        uuid, notesText, context,
        refinement: {
          previousResultJSON: JSON.stringify(initial),
          instruction: 'The RBC construction was 75 minutes. The visit to Jane was October 10, 2026, not yesterday. Keep everything else the same.',
        },
      })
      expect(corrected.contacts).toEqual(initial.contacts)
      expect(corrected.categories).toEqual(initial.categories)
      expect(corrected.publisher).toEqual(initial.publisher)
      expect(corrected.timeEntries).toHaveLength(2)
      expect(corrected.timeEntries).toEqual(expect.arrayContaining([
        expect.objectContaining({ date: '2026-06-01', hours: 12, minutes: 0, categoryId: 'standard' }),
        expect.objectContaining({ date: '2026-10-01', hours: 1, minutes: 15, categoryId: 'ldc', credit: true }),
      ]))
      expect(corrected.visits).toHaveLength(3)
      const correctedJane = corrected.visits.find(visit => visit.contactId === 'existing-jane')!
      expect(correctedJane).toMatchObject({ contactId: 'existing-jane', date: '2026-10-10', notAtHome: true, isBibleStudy: false })
      expect(correctedJane.followUp).toEqual(jane.followUp)
      for (const contact of initial.contacts) {
        expect(corrected.visits.find(visit => visit.contactTempId === contact.tempId)).toEqual(initial.visits.find(visit => visit.contactTempId === contact.tempId))
      }
    })
})
