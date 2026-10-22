import { describe, expect, it, vi } from 'vitest'

vi.mock('expo-file-system/legacy', () => ({ deleteAsync: vi.fn() }))
vi.mock('expo-image-manipulator', () => ({}))

const {
  firstUnreadPage,
  joinPaperPages,
  mapInOrder,
  retriesPaperPage,
  stopsPaperBatch,
} = await import('@/features/notes-import/lib/notesImportPaper')
const { canonicalProtectedRequest } = await import(
  '@/lib/attestation/appAttest'
)

describe('Import from Paper helpers', () => {
  it('joins pages in order and skips unread or blank ones', () => {
    expect(
      joinPaperPages(['  Ana | 12 Oak St ', null, '', undefined, 'Ben\n'])
    ).toBe('Ana | 12 Oak St\n\nBen')
    expect(joinPaperPages([null, ' '])).toBe('')
  })

  it('keeps input order with limited concurrency', async () => {
    let inFlight = 0
    let peak = 0
    const results = await mapInOrder(
      [30, 10, 20, 5],
      2,
      async (delay, index) => {
        inFlight += 1
        peak = Math.max(peak, inFlight)
        await new Promise((resolve) => setTimeout(resolve, delay))
        inFlight -= 1
        return `page ${index + 1}`
      },
      () => false
    )
    expect(results).toEqual(['page 1', 'page 2', 'page 3', 'page 4'])
    expect(peak).toBe(2)
  })

  it('starts no new pages once stopped', async () => {
    let stopped = false
    const task = vi.fn(async (_: number, index: number) => {
      if (index === 0) stopped = true
      return index
    })
    const results = await mapInOrder([1, 2, 3], 1, task, () => stopped)
    expect(task).toHaveBeenCalledTimes(1)
    expect(results).toEqual([0, undefined, undefined])
  })

  it('stops the batch only for failures every page would repeat', () => {
    expect(stopsPaperBatch('limit_reached')).toBe(true)
    expect(stopsPaperBatch('transcribe_limit')).toBe(true)
    expect(stopsPaperBatch('network')).toBe(true)
    expect(stopsPaperBatch('model_error')).toBe(false)
    expect(stopsPaperBatch('too_large')).toBe(false)
  })

  it('keeps pages for Try Again only when a later attempt can read them', () => {
    expect(retriesPaperPage('network')).toBe(true)
    expect(retriesPaperPage('unavailable')).toBe(true)
    expect(retriesPaperPage('model_error')).toBe(true)
    expect(retriesPaperPage('transcribe_limit')).toBe(false)
    expect(retriesPaperPage('too_large')).toBe(false)
    expect(retriesPaperPage('cancelled')).toBe(false)
  })

  it('finds the first unread page from where the draft is', () => {
    expect(firstUnreadPage(['a', '', null, 'd'], 0)).toBe(2)
    expect(firstUnreadPage(['a', 'b'], 0)).toBe(2)
    expect(firstUnreadPage([null, 'b'], 0)).toBe(0)
    expect(firstUnreadPage(['a', null, 'c'], 2)).toBe(3)
  })

  it('signs the same request hash ww-api recomputes for a page', () => {
    // Pinned in ww-api src/notesImport/transcribe.test.ts.
    const imageHash =
      '6e7eb94d97c303b438c9c78f339ba53ab979dcbc288e2b1d4068e871588c5f40'
    expect(
      canonicalProtectedRequest(
        { image: '/9j/4AAQ', mimeType: 'image/jpeg' },
        imageHash
      )
    ).toBe(`{"imageHash":"${imageHash}","mimeType":"image/jpeg"}`)
  })
})
