// Runs eval/queries.json against a help-search Worker and reports ranking
// quality. Uses the admin explain route, so it needs the admin token.
//
//   HELP_SEARCH_URL=http://localhost:8787 ADMIN_TOKEN=… pnpm eval
//   pnpm eval -- --scores scores.json   # also save every answer's raw scores
//
// A query is a hit when one of its expected answers is in the top 3. An
// unrelated query (no expected answers) passes when nothing comes back.

import { readFile, writeFile } from 'node:fs/promises'

const base = process.env.HELP_SEARCH_URL ?? 'http://localhost:8787'
const token = process.env.ADMIN_TOKEN
if (!token) throw new Error('ADMIN_TOKEN is required')
const scoresPath = process.argv.includes('--scores')
  ? process.argv[process.argv.indexOf('--scores') + 1]
  : undefined

const { queries } = JSON.parse(
  await readFile(new URL('./queries.json', import.meta.url), 'utf8')
)

const rows = []
for (const query of queries) {
  const url = new URL('/v1/admin/explain', base)
  url.searchParams.set('q', query.q)
  url.searchParams.set('locale', query.locale)
  const response = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  })
  if (!response.ok)
    throw new Error(`${query.locale} "${query.q}": ${response.status}`)
  const body = await response.json()
  const slugs = body.results.map((result) => result.slug)
  const rank = query.expect.length
    ? slugs.findIndex((slug) => query.expect.includes(slug)) + 1 || undefined
    : undefined
  const pass = query.expect.length
    ? rank !== undefined && rank <= 3
    : !slugs.length
  rows.push({
    ...query,
    rank,
    pass,
    slugs,
    embedded: body.embedded,
    ms: body.ms,
    scores: body.scores,
  })
  const mark = pass ? '✓' : '✗'
  const got = slugs.slice(0, 3).join(', ') || '(nothing)'
  console.log(
    `${mark} ${query.locale.padEnd(6)} ${query.q.padEnd(42)} ${rank ? `#${rank}` : '  '}  ${got}`
  )
}

const answered = rows.filter((row) => row.expect.length)
const unrelated = rows.filter((row) => !row.expect.length)
const mrr =
  answered.reduce((sum, row) => sum + (row.rank ? 1 / row.rank : 0), 0) /
  answered.length
const pct = (n, of) => `${n}/${of} (${Math.round((100 * n) / of)}%)`
console.log(`
top 1: ${pct(answered.filter((r) => r.rank === 1).length, answered.length)}
top 3: ${pct(answered.filter((r) => r.pass).length, answered.length)}
MRR:   ${mrr.toFixed(3)}
unrelated queries returning nothing: ${pct(unrelated.filter((r) => r.pass).length, unrelated.length)}
no embedding (keyword only): ${rows.filter((r) => !r.embedded).length}`)
if (scoresPath) await writeFile(scoresPath, JSON.stringify(rows, null, 2))
