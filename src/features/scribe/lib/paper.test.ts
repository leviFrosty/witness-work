import { describe, expect, it, vi } from 'vitest'

vi.mock('expo-file-system/legacy', () => ({ deleteAsync: vi.fn() }))
vi.mock('expo-image-manipulator', () => ({}))

const { firstUnreadPage, joinPaperPages, mapInOrder, retriesPaperPage } =
  await import('@/features/scribe/lib/paper')

describe('paper pages', () => {
  it('joins pages in order and skips unread or blank ones', () => {
    expect(
      joinPaperPages(['  Ana | 12 Oak St ', null, '', undefined, 'Ben\n'])
    ).toBe('Ana | 12 Oak St\n\nBen')
    expect(joinPaperPages([null, ' '])).toBe('')
  })

  it('keeps pages for Try again only when a later attempt can read them', () => {
    expect(retriesPaperPage('network')).toBe(true)
    expect(retriesPaperPage('timeout')).toBe(true)
    expect(retriesPaperPage('rate_limited')).toBe(true)
    expect(retriesPaperPage('unavailable')).toBe(true)
    expect(retriesPaperPage('model_error')).toBe(true)
    expect(retriesPaperPage('page_limit')).toBe(false)
    expect(retriesPaperPage('limit_reached')).toBe(false)
    expect(retriesPaperPage('too_large')).toBe(false)
    expect(retriesPaperPage('suspended')).toBe(false)
  })

  it('finds the first unread page from where the composer is', () => {
    expect(firstUnreadPage(['a', '', null, 'd'], 0)).toBe(2)
    expect(firstUnreadPage(['a', 'b'], 0)).toBe(2)
    expect(firstUnreadPage([null, 'b'], 0)).toBe(0)
    expect(firstUnreadPage(['a', null, 'c'], 2)).toBe(3)
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
        return `page ${index}`
      },
      () => false
    )
    expect(results).toEqual(['page 0', 'page 1', 'page 2', 'page 3'])
    expect(peak).toBe(2)
  })

  it('starts no new pages once told to stop', async () => {
    let stop = false
    const started: number[] = []
    const results = await mapInOrder(
      [0, 1, 2, 3, 4],
      1,
      async (item) => {
        started.push(item)
        if (item === 1) stop = true
        return item
      },
      () => stop
    )
    expect(started).toEqual([0, 1])
    expect(results).toEqual([0, 1, undefined, undefined, undefined])
  })

  it('handles an empty batch', async () => {
    await expect(
      mapInOrder(
        [],
        3,
        async () => 1,
        () => false
      )
    ).resolves.toEqual([])
  })
})
