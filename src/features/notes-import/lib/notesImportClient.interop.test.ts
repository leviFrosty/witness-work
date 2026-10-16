import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

/**
 * Opt-in contract check of Notes Import on account sessions against a real
 * worker (see `interopSessions`; skipped by default). Only failure paths and
 * run routes for imports that don't exist run by default: they spend nothing.
 * `NOTES_IMPORT_INTEROP_MODEL=1` adds one real import of a single sentence, and
 * `NOTES_IMPORT_INTEROP_PAGE=<path to a small JPEG>` one page read; both are
 * paid model calls.
 */
const env = vi.hoisted(() => ({
  modelRuns: process.env.NOTES_IMPORT_INTEROP_MODEL === '1',
  page: process.env.NOTES_IMPORT_INTEROP_PAGE,
}))

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/http/online', () => ({ isKnownOffline: () => false }))
vi.mock('@/lib/perf', () => ({ perf: { count: vi.fn() } }))
// Node's fetch reads a streaming body as expo/fetch does.
vi.mock('expo/fetch', () => ({ fetch: globalThis.fetch }))
vi.mock('@/lib/account', () => ({
  getOrCreateAccountId: () => 'interop-revenuecat-user',
}))
vi.mock('@/lib/attestation', () => ({
  deviceAttestation: { checkSupport: async () => 'supported' },
}))
vi.mock('@/constants/apis', async () => {
  const { interopRelayUrl } = await import(
    '@/lib/serverAccount/testing/interopSessions'
  )
  const base = interopRelayUrl ?? 'http://interop.invalid'
  return {
    default: {
      accounts: base,
      notesImport: `${base}/notes-import`,
      notesImportStatus: `${base}/notes-import/status`,
      notesImportKickoff: `${base}/notes-import/kickoff`,
      notesImportTranscribe: `${base}/notes-import/transcribe`,
      notesImportEvents: (id: string) => `${base}/notes-import/${id}/events`,
      notesImportResult: (id: string) => `${base}/notes-import/${id}/result`,
      notesImportDestroy: (id: string) => `${base}/notes-import/${id}/destroy`,
    },
  }
})
vi.mock('@/lib/serverAccount', async () => {
  const { interopSessions } = await import(
    '@/lib/serverAccount/testing/interopSessions'
  )
  const { randomBytes } = await import('node:crypto')
  return {
    accountSessions: interopSessions(
      (length) => new Uint8Array(randomBytes(length))
    ),
  }
})

import apis from '@/constants/apis'
import { HttpError } from '@/lib/http/request'
import { accountSessions } from '@/lib/serverAccount'
import {
  interopEnabled,
  interopRelayUrl,
  interopSessions,
} from '@/lib/serverAccount/testing/interopSessions'
import {
  destroyNotesImport,
  fetchNotesImportResult,
  NotesImportClientError,
  runNotesImportStreaming,
  transcribeNotesPage,
} from '@/features/notes-import/lib/notesImportClient'

const random = (length: number) => new Uint8Array(nodeRandomBytes(length))

const context = {
  now: new Date().toISOString(),
  timeZone: 'UTC',
  existingContacts: [],
  existingCategories: [],
}

/** An id kickoff would issue, for an import nobody started. */
const UNKNOWN_IMPORT = `imp_${'0'.repeat(40)}`

const codeOf = (error: unknown) =>
  error instanceof NotesImportClientError
    ? error.code
    : error instanceof HttpError
      ? error.serverCode
      : String(error)

describe.skipIf(!interopEnabled)('Notes Import against a real worker', () => {
  it('refuses a bearer token it did not issue, with WWW-Authenticate', async () => {
    const response = await fetch(apis.notesImportKickoff, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer not-a-token',
      },
      body: JSON.stringify({ notesText: 'x', context }),
    })
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ code: 'unauthorized' })
    expect(response.headers.get('www-authenticate')).toMatch(/^Bearer/)
  })

  // Each is refused before the credit gate, so none spends a model call.
  it('refuses notes over the limit as the session', async () => {
    const error = await runNotesImportStreaming({
      notesText: 'x'.repeat(100_001),
      context,
    }).catch((e: unknown) => e)
    expect(codeOf(error)).toBe('too_large')
  })

  it('accepts only revenueCatAppUserId values the app would send', async () => {
    const kickoff = (body: Record<string, unknown>) =>
      accountSessions
        .request({
          url: apis.notesImportKickoff,
          method: 'POST',
          json: body,
          timeoutMs: 15_000,
        })
        .catch((e: unknown) => e)
    // The id is checked before the size, so a refused one never gets there.
    for (const id of ['$RCAnonymousID:0123456789abcdef', 'short'])
      expect(
        codeOf(
          await kickoff({
            notesText: 'x'.repeat(100_001),
            context,
            revenueCatAppUserId: id,
          })
        )
      ).toBe('bad_request')
    // A valid id passes the check and meets the size limit instead.
    expect(
      codeOf(
        await kickoff({
          notesText: 'x'.repeat(100_001),
          context,
          revenueCatAppUserId: 'interop-revenuecat-user',
        })
      )
    ).toBe('too_large')
  })

  it('answers run routes for an import that does not exist with 404 not_found', async () => {
    await expect(fetchNotesImportResult(UNKNOWN_IMPORT)).rejects.toMatchObject({
      code: 'not_found',
    })
    const events = await accountSessions.withSession((authorization) =>
      fetch(apis.notesImportEvents(UNKNOWN_IMPORT), {
        headers: { authorization, accept: 'text/event-stream' },
      })
    )
    expect(events.status).toBe(404)
    const destroy = await accountSessions
      .request({
        url: apis.notesImportDestroy(UNKNOWN_IMPORT),
        method: 'POST',
        timeoutMs: 10_000,
      })
      .catch((e: unknown) => e)
    expect(codeOf(destroy)).toBe('not_found')
    // The client's own destroy reads that as already deleted.
    await expect(
      destroyNotesImport({ importId: UNKNOWN_IMPORT })
    ).resolves.toBeUndefined()
  })

  it.skipIf(!env.modelRuns)(
    'imports one sentence end to end, readable and deletable only by its account',
    async () => {
      const handles: string[] = []
      const events: string[] = []
      const response = await runNotesImportStreaming({
        notesText: 'Visited Ann at 12 Oak Street on May 3.',
        context,
        onKickoff: ({ importId }) => handles.push(importId),
        onEvent: (event) => events.push(event.type),
      })
      expect(response.result).toMatchObject({
        contacts: expect.any(Array),
        visits: expect.any(Array),
      })
      expect(events.at(-1)).toBe('done')
      const [importId] = handles
      expect(importId).toMatch(/^imp_[a-f0-9]{40}$/)

      await expect(fetchNotesImportResult(importId)).resolves.toMatchObject({
        status: 'done',
      })
      // Another account gets the same 404 as an import that doesn't exist.
      const other = interopSessions(random)
      const foreign = await other
        .request({ url: apis.notesImportResult(importId), timeoutMs: 10_000 })
        .catch((e: unknown) => e)
      expect(codeOf(foreign)).toBe('not_found')
      // No Authorization: the legacy form, which wants the subscribe token.
      const legacy = await fetch(apis.notesImportResult(importId))
      expect([400, 401, 426]).toContain(legacy.status)

      const destroyed = await accountSessions.request<{ ok: boolean }>({
        url: apis.notesImportDestroy(importId),
        method: 'POST',
        timeoutMs: 10_000,
      })
      expect(destroyed.data).toEqual({ ok: true })
      await expect(fetchNotesImportResult(importId)).rejects.toMatchObject({
        code: 'not_found',
      })
    },
    120_000
  )

  it.skipIf(!env.modelRuns || !env.page)(
    'reads one page as the session',
    async () => {
      const image = readFileSync(env.page!).toString('base64')
      const page = await transcribeNotesPage({ image, mimeType: 'image/jpeg' })
      expect(page).toEqual({
        text: expect.any(String),
        truncated: expect.any(Boolean),
      })
    },
    120_000
  )
})

describe.skipIf(!interopEnabled)('the interop worker', () => {
  it('is the one under test', () => {
    expect(apis.notesImportKickoff).toBe(
      `${interopRelayUrl}/notes-import/kickoff`
    )
  })
})
