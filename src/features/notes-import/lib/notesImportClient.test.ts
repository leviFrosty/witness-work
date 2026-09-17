import axios from 'axios'
import { fetch as expoFetch } from 'expo/fetch'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  NotesImportAppAttestError,
  NotesImportAppAttestHttpError,
} from '@/features/notes-import/lib/notesImportAppAttest'

const harness = vi.hoisted(() => ({
  post: vi.fn(),
}))

vi.mock('expo/fetch', () => ({ fetch: vi.fn() }))
vi.mock('@/features/notes-import/lib/notesContentHash', () => ({
  notesContentHash: vi.fn(async () => 'a'.repeat(64)),
}))
vi.mock('@/features/notes-import/lib/notesImportAppAttestRuntime', () => ({
  notesImportAppAttest: { post: harness.post },
}))

import {
  runNotesImportStreaming,
  resumeNotesImport,
} from '@/features/notes-import/lib/notesImportClient'

const request = {
  notesText: 'private notes',
  context: {
    now: '2026-07-23T09:30:00-05:00',
    timeZone: 'America/Chicago',
    existingContacts: [],
    existingCategories: [],
  },
}

describe('Notes Import client authorization errors', () => {
  beforeEach(() => {
    harness.post.mockReset()
  })

  it('preserves backend reason and action from semantic authorization errors', async () => {
    harness.post.mockRejectedValueOnce(
      new NotesImportAppAttestError('counterConflict', {
        status: 409,
        serverCode: 'attestation_failed',
        reason: 'counter_not_increasing',
        action: 'start_new_operation',
      })
    )

    await expect(runNotesImportStreaming(request)).rejects.toMatchObject({
      name: 'NotesImportClientError',
      code: 'attestation_failed',
      status: 409,
      reason: 'counter_not_increasing',
      action: 'start_new_operation',
    })
  })

  it('keeps cancellation distinct from a network failure', async () => {
    harness.post.mockRejectedValueOnce(
      new NotesImportAppAttestHttpError({ kind: 'cancelled' })
    )

    await expect(runNotesImportStreaming(request)).rejects.toMatchObject({
      name: 'NotesImportClientError',
      code: 'cancelled',
      message: 'Import cancelled',
    })
  })
})

describe('Notes Import terminal error safety', () => {
  it('normalizes an unrecognized stream error code', async () => {
    vi.mocked(expoFetch, { partial: true }).mockResolvedValueOnce({
      status: 200,
      ok: true,
      body: new Response(
        'data: ' +
          JSON.stringify({
            type: 'error',
            code: 'private server text',
            message: 'failed',
          }) +
          '\n\n'
      ).body,
    })
    await expect(
      resumeNotesImport({
        ...request,
        run: { importId: 'run', subscribeToken: 'token' },
      })
    ).rejects.toMatchObject({ code: 'unknown' })
  })

  it('normalizes an unrecognized snapshot error code', async () => {
    vi.mocked(expoFetch, { partial: true }).mockResolvedValueOnce({
      status: 200,
      ok: true,
      body: new Response('').body,
    })
    const get = vi.spyOn(axios, 'get').mockResolvedValueOnce({
      data: {
        status: 'error',
        error: { code: 'private server text', message: 'failed' },
      },
    })
    try {
      await expect(
        resumeNotesImport({
          ...request,
          run: { importId: 'run', subscribeToken: 'token' },
        })
      ).rejects.toMatchObject({ code: 'unknown' })
    } finally {
      get.mockRestore()
    }
  })
})
