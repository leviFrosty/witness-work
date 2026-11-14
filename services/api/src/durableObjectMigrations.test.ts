import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * wrangler.toml's Durable Object migrations. Wrangler finds a Worker's
 * applied tag by name and sends only the steps after it; it never checks for
 * a repeated tag or a class created twice, and a renumbered applied tag
 * makes it replay every step. So the lists are pinned here: what each Worker
 * has applied stays as it is, and any new class goes at the end of every
 * list, once. `[[env.beta.migrations]]` replaces the top-level list for Beta
 * and `[[env.dev.migrations]]` for the local worker, whose list is what
 * `wrangler dev --env dev` state on developers' machines has applied.
 */

type Table = { header: string; lines: string[] }
const tables: Table[] = []
for (const line of readFileSync(
  new URL('../wrangler.toml', import.meta.url),
  'utf8'
).split('\n')) {
  const header = /^\s*(\[\[?[^\]]+\]\]?)/.exec(line)?.[1]
  if (header) tables.push({ header, lines: [] })
  else tables.at(-1)?.lines.push(line)
}
const field = (table: Table, name: string) =>
  table.lines
    .map((line) => new RegExp(`^\\s*${name}\\s*=\\s*(.+?)\\s*(#.*)?$`).exec(line))
    .find(Boolean)?.[1]

const migrations = (prefix: string) =>
  tables
    .filter((table) => table.header === `[[${prefix}migrations]]`)
    .map((table) => ({
      tag: JSON.parse(field(table, 'tag') ?? 'null') as string,
      classes: JSON.parse(field(table, 'new_sqlite_classes') ?? '[]') as string[],
      other: table.lines.some((line) =>
        /^\s*(new_classes|renamed_classes|deleted_classes|transferred_classes)\s*=/.test(line)
      ),
    }))

const boundClasses = (prefix: string) =>
  tables
    .filter((table) => table.header === `[[${prefix}durable_objects.bindings]]`)
    .map((table) => JSON.parse(field(table, 'class_name') ?? 'null') as string)

/** Applied before Shared Spaces and the web launch, in every environment. */
const SHARED_HISTORY = [
  ['v1', 'NotesImportRun', 'NotesImportIndex'],
  ['v2', 'AppAttestIdentity'],
  ['v3', 'BuddyInbox', 'BuddyInvite'],
  ['v4', 'PlayIntegrityChallenges'],
  ['v5', 'RoutePlanningQuota'],
  ['v6', 'BuddyRegistrationQuota'],
  ['v7', 'AccountHandoff'],
  ['v8', 'AccountSync'],
  ['v9', 'ScribeMeter'],
]

// ww-proxy was at v9; SharedSpace landed on main first.
const PRODUCTION_HISTORY = [
  ...SHARED_HISTORY,
  ['v10', 'SharedSpace'],
  ['v11', 'AccountRateCounter'],
  ['v12', 'AccountApproval'],
]

const ENVS = [
  { name: 'production', prefix: '', applied: PRODUCTION_HISTORY },
  // ww-proxy-beta is a new Worker, so its history is production's, tag for tag.
  { name: 'beta', prefix: 'env.beta.', applied: PRODUCTION_HISTORY },
  {
    name: 'dev (local)',
    prefix: 'env.dev.',
    // What local `wrangler dev --env dev` state has applied (the old deployed
    // dev Worker's order, v12 since 2026-11-04). Nothing is deployed from it.
    applied: [
      ...SHARED_HISTORY,
      ['v10', 'AccountRateCounter'],
      ['v11', 'AccountApproval'],
      ['v12', 'SharedSpace'],
    ],
  },
]

describe('wrangler.toml Durable Object migrations', () => {
  it('gives Beta production’s list, tag for tag', () => {
    expect(migrations('env.beta.')).toEqual(migrations(''))
    expect(migrations('env.beta.').length).toBeGreaterThanOrEqual(PRODUCTION_HISTORY.length)
  })

  it('binds the same classes in every environment', () => {
    const production = [...boundClasses('')].sort()
    expect(production.length).toBeGreaterThan(0)
    expect([...boundClasses('env.beta.')].sort()).toEqual(production)
    expect([...boundClasses('env.dev.')].sort()).toEqual(production)
  })

  for (const env of ENVS) {
    describe(env.name, () => {
      const list = migrations(env.prefix)

      it('keeps the tags the Worker has applied, in order', () => {
        expect(
          list.slice(0, env.applied.length).map(({ tag, classes }) => [tag, ...classes])
        ).toEqual(env.applied)
      })

      it('numbers tags v1, v2, … with no repeats', () => {
        expect(list.map(({ tag }) => tag)).toEqual(list.map((_, i) => `v${i + 1}`))
      })

      it('creates every bound class exactly once', () => {
        expect(list.some(({ other }) => other)).toBe(false)
        const created = list.flatMap(({ classes }) => classes)
        expect(new Set(created).size).toBe(created.length)
        expect([...created].sort()).toEqual([...boundClasses(env.prefix)].sort())
      })
    })
  }
})
