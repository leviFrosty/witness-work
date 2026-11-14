import { describe, expect, it, vi } from 'vitest'

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    ctx: DurableObjectState
    env: unknown
    constructor(ctx: DurableObjectState, env: unknown) {
      this.ctx = ctx
      this.env = env
    }
  },
}))

interface FakeState {
  meta: Map<string, number>
  hashes: Map<string, { charged: number; refinements: number }>
  emptyRuns: number[]
  /** Optional so existing fixtures stay unchanged. */
  transcribedPages?: number[]
}

const cursor = <T>(rows: T[]) => ({
  toArray: () => rows,
  one: () => rows[0],
})

const fakeContext = (state: FakeState): DurableObjectState =>
  ({
    id: { toString: () => 'opaque-object-id' },
    storage: {
      sql: {
        exec: (query: string, ...args: unknown[]) => {
          if (query.startsWith('CREATE TABLE')) return cursor([])
          if (query.includes('SELECT k, v FROM credit_meta')) {
            return cursor(
              [...state.meta].map(([k, v]) => ({ k, v }))
            )
          }
          if (query === 'SELECT COUNT(*) AS n FROM empty_run') {
            return cursor([{ n: state.emptyRuns.length }])
          }
          if (query.startsWith('SELECT COUNT(*) AS n FROM empty_run WHERE')) {
            const since = Number(args[0])
            return cursor([{ n: state.emptyRuns.filter((ts) => ts > since).length }])
          }
          if (query === 'DELETE FROM credit_meta') {
            state.meta.clear()
            return cursor([])
          }
          if (query === 'DELETE FROM transcribed_page') {
            state.transcribedPages = []
            return cursor([])
          }
          if (query === 'DELETE FROM transcribed_page WHERE ts <= ?') {
            const before = Number(args[0])
            state.transcribedPages = (state.transcribedPages ?? []).filter(
              (ts) => ts > before
            )
            return cursor([])
          }
          if (query.startsWith('SELECT COUNT(*) AS n, MIN(ts) AS oldest FROM transcribed_page')) {
            const pages = state.transcribedPages ?? []
            return cursor([
              { n: pages.length, oldest: pages.length ? Math.min(...pages) : null },
            ])
          }
          if (query === 'INSERT INTO transcribed_page (ts) VALUES (?)') {
            state.transcribedPages = [...(state.transcribedPages ?? []), Number(args[0])]
            return cursor([])
          }
          if (query === 'DELETE FROM empty_run') {
            state.emptyRuns = []
            return cursor([])
          }
          if (query.startsWith('INSERT OR REPLACE INTO credit_meta')) {
            state.meta.set('count', Number(args[0]))
            state.meta.set('windowStartedAt', Number(args[1]))
            return cursor([])
          }
          if (query.startsWith('INSERT OR REPLACE INTO hash_record')) {
            state.hashes.set(String(args[0]), {
              charged: Number(args[1]),
              refinements: Number(args[2]),
            })
            return cursor([])
          }
          if (query.startsWith('SELECT charged, refinements FROM hash_record')) {
            const record = state.hashes.get(String(args[0]))
            return cursor(record ? [record] : [])
          }
          throw new Error(`Unexpected SQL in test: ${query}`)
        },
      },
    },
  }) as unknown as DurableObjectState

describe('NotesImportIndex recordUsage', () => {
  it('does not persist a charge before the terminal snapshot is safe', async () => {
    const now = Date.UTC(2026, 6, 1)
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now)
    const state: FakeState = {
      meta: new Map(),
      hashes: new Map(),
      emptyRuns: [],
    }
    const { NotesImportIndex } = await import('./indexDO')
    const index = new NotesImportIndex(fakeContext(state), {} as never)

    expect(() =>
      index.recordUsage({
        hash: 'new-hash',
        isSupporter: false,
        decision: {
          allowed: true,
          isNewHash: true,
          isRefinement: false,
          remaining: 4,
        },
        importLimit: 5,
        refinementLimit: 5,
        windowDurationMs: 8_640_000_000_000_000,
        isEmpty: false,
        emptyWindowSeconds: 604_800,
        emptyWindowLimit: 5,
      })
    ).toThrow(RangeError)
    expect(state.meta.size).toBe(0)
    expect(state.hashes.size).toBe(0)
    expect(state.emptyRuns).toEqual([])
    nowSpy.mockRestore()
  })
})

describe('NotesImportIndex resetUsage', () => {
  it('clears rolling/empty state while permanent replay and refinement records survive', async () => {
    const now = Date.now()
    const state: FakeState = {
      meta: new Map([
        ['count', 4],
        ['windowStartedAt', now],
      ]),
      hashes: new Map([
        ['known-hash', { charged: 1, refinements: 1 }],
      ]),
      emptyRuns: [now - 2, now - 1],
    }
    const { NotesImportIndex } = await import('./indexDO')
    const index = new NotesImportIndex(fakeContext(state), {} as never)

    expect(index.resetUsage()).toEqual({
      previousCount: 4,
      hadActiveWindow: true,
      deletedEmptyRuns: 2,
    })
    expect(state.meta.size).toBe(0)
    expect(state.emptyRuns).toEqual([])

    const known = index.checkCredit({
      hash: 'known-hash',
      isSupporter: false,
      isRefinement: true,
      importLimit: 5,
      refinementLimit: 2,
      windowDurationMs: 30 * 24 * 60 * 60 * 1000,
    })
    expect(known.decision.allowed).toBe(true)
    expect(known.credits).toMatchObject({
      remaining: 5,
      resetsAt: null,
      refinements: { remaining: 1, limit: 2 },
    })
    expect(state.hashes.get('known-hash')).toEqual({
      charged: 1,
      refinements: 1,
    })
  })
})

describe('NotesImportIndex takeTranscribePage', () => {
  it('counts pages in a rolling window and says when the oldest ages out', async () => {
    const now = 1_000_000_000
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now)
    const day = 24 * 60 * 60 * 1000
    const state: FakeState = {
      meta: new Map(),
      hashes: new Map(),
      emptyRuns: [],
      // One page has aged out; two still count.
      transcribedPages: [now - day - 1, now - 3_000, now - 1_000],
    }
    const { NotesImportIndex } = await import('./indexDO')
    const index = new NotesImportIndex(fakeContext(state), {} as never)

    expect(index.takeTranscribePage(3, day)).toEqual({ ok: true, remaining: 0 })
    expect(state.transcribedPages).toEqual([now - 3_000, now - 1_000, now])
    expect(index.takeTranscribePage(3, day)).toEqual({
      ok: false,
      retryAfterMs: day - 3_000,
    })
    expect(state.transcribedPages).toHaveLength(3)

    index.resetUsage()
    expect(state.transcribedPages).toEqual([])
    nowSpy.mockRestore()
  })
})
