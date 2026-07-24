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

import { runNotesImportStreaming } from '@/features/notes-import/lib/notesImportClient'

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
