import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ScribeClientError } from '@/features/scribe/lib/errors'

const mocks = vi.hoisted(() => ({
  territoryNotes: vi.fn(),
  noteUsage: vi.fn(),
  noteScribeFailure: vi.fn(),
}))

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/features/scribe/lib/defaultClient', () => ({
  scribeClient: () => ({ territoryNotes: mocks.territoryNotes }),
}))
vi.mock('@/features/scribe/runtime/status', () => ({
  noteScribeFailure: mocks.noteScribeFailure,
}))
vi.mock('@/features/scribe/stores/usage', () => ({
  noteUsage: mocks.noteUsage,
}))

import {
  notesFailureFor,
  readTerritoryNotesWithScribe,
} from '@/features/scribe/runtime/territoryNotes'

const NOTES = { notes: '12 NH', streets: [], locale: 'en-US' }
const USAGE = { plan: 'free', asOf: 1 }

beforeEach(() => {
  mocks.territoryNotes.mockReset()
  mocks.noteUsage.mockClear()
  mocks.noteScribeFailure.mockClear()
})

describe('readTerritoryNotesWithScribe', () => {
  it('returns the answer and moves the meter', async () => {
    const result = { doors: [], ranges: [], unread: [], usage: USAGE }
    mocks.territoryNotes.mockResolvedValue(result)
    expect(await readTerritoryNotesWithScribe(NOTES)).toEqual({
      status: 'read',
      result,
    })
    expect(mocks.noteUsage).toHaveBeenCalledWith(USAGE)
  })

  it('names why it fell back, keeping a charged failure’s usage', async () => {
    mocks.territoryNotes.mockRejectedValue(
      new ScribeClientError('limit_reached', { usage: USAGE as never })
    )
    expect(await readTerritoryNotesWithScribe(NOTES)).toEqual({
      status: 'failed',
      reason: 'limited',
    })
    expect(mocks.noteUsage).toHaveBeenCalledWith(USAGE)
    expect(mocks.noteScribeFailure).toHaveBeenCalledTimes(1)
  })

  it('is cancelled when the caller aborts', async () => {
    mocks.territoryNotes.mockRejectedValue(new ScribeClientError('cancelled'))
    expect(await readTerritoryNotesWithScribe(NOTES)).toEqual({
      status: 'cancelled',
    })
    expect(mocks.noteScribeFailure).not.toHaveBeenCalled()
  })
})

describe('notesFailureFor', () => {
  it.each([
    ['limit_reached', 'limited'],
    ['network', 'offline'],
    ['disabled', 'unavailable'],
    ['suspended', 'unavailable'],
    ['update_required', 'unavailable'],
    ['timeout', 'failed'],
    ['model_error', 'failed'],
    ['unknown', 'failed'],
  ] as const)('%s → %s', (code, reason) => {
    expect(notesFailureFor(code)).toBe(reason)
  })
})
