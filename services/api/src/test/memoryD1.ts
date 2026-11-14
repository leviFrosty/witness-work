import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { vi } from 'vitest'

/**
 * A D1 test double backed by a real in-memory SQLite database, with the
 * accounts migrations applied, so Drizzle runs its actual SQL. Covers the
 * surface `drizzle-orm/d1` uses: `prepare().bind()` with `run`, `all`,
 * `raw`, and `first`, and `batch` (one transaction, rolled back on error).
 */

const MIGRATIONS_DIR = fileURLToPath(
  new URL('../../migrations/accounts', import.meta.url)
)

type Row = Record<string, unknown>

class MemoryD1Statement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly query: string,
    private readonly params: SQLInputValue[] = []
  ) {}

  bind(...params: unknown[]): MemoryD1Statement {
    return new MemoryD1Statement(this.db, this.query, params as SQLInputValue[])
  }

  async run() {
    const { changes, lastInsertRowid } = this.db
      .prepare(this.query)
      .run(...this.params)
    return {
      success: true,
      results: [],
      meta: { changes: Number(changes), last_row_id: Number(lastInsertRowid) },
    }
  }

  async all<T = Row>() {
    return { success: true, results: this.rows() as T[], meta: {} }
  }

  async raw<T = unknown[]>() {
    const statement = this.db.prepare(this.query)
    statement.setReturnArrays(true)
    return statement.all(...this.params) as T[]
  }

  async first<T = Row>() {
    return (this.rows()[0] as T | undefined) ?? null
  }

  rows(): Row[] {
    return this.db.prepare(this.query).all(...this.params) as Row[]
  }

  /** What a batch reports for this statement: its rows, or the rows it changed. */
  batchResult() {
    const statement = this.db.prepare(this.query)
    if (statement.columns().length > 0)
      return { success: true, results: this.rows(), meta: { changes: 0 } }
    const { changes } = statement.run(...this.params)
    return { success: true, results: [], meta: { changes: Number(changes) } }
  }
}

export class MemoryD1 {
  readonly db = new DatabaseSync(':memory:')

  constructor() {
    this.db.exec('PRAGMA foreign_keys = ON')
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((name) => name.endsWith('.sql'))
      .sort()
    for (const file of files)
      this.db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
  }

  prepare(query: string): MemoryD1Statement {
    return new MemoryD1Statement(this.db, query)
  }

  async batch(statements: MemoryD1Statement[]) {
    this.db.exec('BEGIN')
    try {
      const results = statements.map((statement) => statement.batchResult())
      this.db.exec('COMMIT')
      return results
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
}

export const makeMemoryD1 = (): MemoryD1 & D1Database =>
  new MemoryD1() as MemoryD1 & D1Database

/**
 * Makes statements whose SQL matches `pattern` fail when they run, the way
 * D1 does (so Drizzle wraps the error, with the query's parameters, in a
 * `DrizzleQueryError`). Restore it with `mockRestore()`.
 */
export const failQueries = (
  d1: MemoryD1,
  pattern: RegExp,
  message = 'D1_ERROR: database is locked: SQLITE_BUSY'
) => {
  const prepare = d1.prepare.bind(d1)
  const fail = async () => {
    throw new Error(message)
  }
  // `batch` reads `batchResult()` synchronously, so it throws there.
  const throwing = () => {
    throw new Error(message)
  }
  const failing = {
    run: fail,
    all: fail,
    raw: fail,
    first: fail,
    rows: throwing,
    batchResult: throwing,
  }
  return vi.spyOn(d1, 'prepare').mockImplementation((query: string) =>
    pattern.test(query)
      ? ({ ...failing, bind: () => failing } as unknown as MemoryD1Statement)
      : prepare(query)
  )
}
