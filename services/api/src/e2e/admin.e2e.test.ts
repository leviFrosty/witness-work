import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ADMIN_TOKEN, enableLegacyNotesImport, http, writeTranscript } from '../test/e2e'

/** Maintainer usage reset: every auth failure is an indistinguishable 404. */

afterAll(() => {
  writeTranscript('admin')
})

// Notes Import answers only behind Scribe AI's legacy switch (src/scribe/legacy.ts).
let restoreLegacy = () => {}
beforeAll(() => {
  restoreLegacy = enableLegacyNotesImport()
})
afterAll(() => {
  restoreLegacy()
})

const reset = (headers: Record<string, string>, body: unknown = { meterId: 'verifyMeter01' }) =>
  http('POST', '/admin/notes-import/reset', { headers, body })

describe('POST /admin/notes-import/reset', () => {
  it('404s without a token', async () => {
    const res = await reset({})
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ ok: false, error: 'not_found', code: 'not_found' })
  })

  it('404s with a wrong token, identical to no token', async () => {
    const res = await reset({ 'x-ww-admin-token': 'wrong-token' })
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ ok: false, error: 'not_found', code: 'not_found' })
  })

  it('404s for GET (route is POST only)', async () => {
    const res = await http('GET', '/admin/notes-import/reset')
    expect(res.status).toBe(404)
  })

  describe.skipIf(!ADMIN_TOKEN)('with the launcher admin token', () => {
    const auth = () => ({ 'x-ww-admin-token': ADMIN_TOKEN ?? '' })

    it('400s on an invalid meterId', async () => {
      const res = await reset(auth(), { meterId: 'bad id!' })
      expect(res.status).toBe(400)
      expect(res.body).toEqual({
        ok: false,
        error: 'Invalid meterId',
        code: 'bad_request',
      })
    })

    it('resets a meter', async () => {
      const res = await reset(auth(), { meterId: `verify_${Date.now()}` })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true })
    })
  })
})
