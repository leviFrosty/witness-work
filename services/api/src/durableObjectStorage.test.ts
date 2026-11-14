import { describe, expect, it } from 'vitest'
import { SEQ_PAGE_CHUNK, deleteAllThen, readSeqPage } from './durableObjectStorage'

/**
 * The Durable Object storage helpers Shared Spaces and Buddies share:
 * `readSeqPage` at its chunk boundaries, and the order of `deleteAllThen`'s
 * steps.
 */

type Row = { seq: number }

/** `count` rows with seqs from `from` up. */
const rows = (count: number, from = 1): Row[] =>
  Array.from({ length: count }, (_, index) => ({ seq: from + index }))

/** A `read` over `table`, recording each query's `(after, count)`. */
const reader = (table: Row[]) => {
  const calls: [number, number][] = []
  const read = (after: number, count: number): Row[] => {
    calls.push([after, count])
    return table.filter((row) => row.seq > after).slice(0, count)
  }
  return { read, calls }
}

/** `take` for a page of at most `limit` rows, as `sync` pages. */
const upTo =
  (limit: number) =>
  (_: Row, taken: readonly Row[]): boolean =>
    taken.length < limit

describe('readSeqPage', () => {
  it('reads every row when their count is a multiple of the chunk, then one empty chunk', () => {
    const table = rows(6)
    const { read, calls } = reader(table)
    expect(readSeqPage(read, 0, () => true, 3)).toEqual({ rows: table, more: false })
    expect(calls).toEqual([
      [0, 3],
      [3, 3],
      [6, 3],
    ])
  })

  it('stops at the first row of a later chunk that take turns down, and reads no further', () => {
    const { read, calls } = reader(rows(9))
    expect(readSeqPage(read, 0, (row) => row.seq <= 3, 3)).toEqual({
      rows: rows(3),
      more: true,
    })
    expect(calls).toEqual([
      [0, 3],
      [3, 3],
    ])
  })

  it('says no more when a limit of a chunk or more meets exactly that many rows', () => {
    for (const limit of [SEQ_PAGE_CHUNK, 100, 2 * SEQ_PAGE_CHUNK, 1_000]) {
      const chunk = Math.min(SEQ_PAGE_CHUNK, limit + 1)
      const exact = rows(limit, 11)
      expect(readSeqPage(reader(exact).read, 10, upTo(limit), chunk), String(limit)).toEqual({
        rows: exact,
        more: false,
      })
      // One row past the limit is more.
      const page = readSeqPage(reader(rows(limit + 1, 11)).read, 10, upTo(limit), chunk)
      expect({ rows: page.rows.length, more: page.more }, String(limit)).toEqual({
        rows: limit,
        more: true,
      })
    }
  })

  it('reads one past a limit under a chunk, so it knows whether there’s more', () => {
    const { read, calls } = reader(rows(5))
    expect(readSeqPage(read, 0, upTo(5), Math.min(SEQ_PAGE_CHUNK, 5 + 1))).toEqual({
      rows: rows(5),
      more: false,
    })
    expect(calls).toEqual([[0, 6]])
  })

  it('starts after since, and passes take the rows taken so far', () => {
    const seen: number[] = []
    const page = readSeqPage(
      reader(rows(10)).read,
      4,
      (row, taken) => {
        seen.push(taken.length)
        return row.seq < 8
      },
      2
    )
    expect(page).toEqual({ rows: rows(3, 5), more: true })
    expect(seen).toEqual([0, 1, 2, 3])
  })
})

describe('deleteAllThen', () => {
  const recording = () => {
    const steps: string[] = []
    const ctx = {
      blockConcurrencyWhile: async <T>(fn: () => Promise<T>): Promise<T> => {
        steps.push('block')
        try {
          return await fn()
        } finally {
          steps.push('unblock')
        }
      },
      storage: {
        deleteAll: async () => {
          steps.push('deleteAll')
        },
        transactionSync: <T>(fn: () => T): T => {
          steps.push('transaction')
          return fn()
        },
      },
    } as unknown as DurableObjectState
    return { steps, ctx }
  }

  it('frees the storage, then runs afterDeleteAll, then restore in a transaction, all blocking', async () => {
    const { steps, ctx } = recording()
    await deleteAllThen(ctx, {
      afterDeleteAll: async () => {
        steps.push('afterDeleteAll')
      },
      restore: () => {
        steps.push('restore')
      },
    })
    expect(steps).toEqual([
      'block',
      'deleteAll',
      'afterDeleteAll',
      'transaction',
      'restore',
      'unblock',
    ])
  })

  it('stops at a step that fails, and rejects', async () => {
    const { steps, ctx } = recording()
    await expect(
      deleteAllThen(ctx, {
        afterDeleteAll: async () => {
          throw new Error('storage unavailable')
        },
        restore: () => {
          steps.push('restore')
        },
      })
    ).rejects.toThrow('storage unavailable')
    expect(steps).toEqual(['block', 'deleteAll', 'unblock'])
    const bare = recording()
    await deleteAllThen(bare.ctx)
    expect(bare.steps).toEqual(['block', 'deleteAll', 'unblock'])
  })
})
