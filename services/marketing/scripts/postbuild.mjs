#!/usr/bin/env node
// Finishes the static build in dist/<env>/client (pnpm build runs it last):
//
// - Drops the router's state script from every page. Pages are static HTML;
//   nothing loads the router in the browser, so the script would only be an
//   inline script for the Content-Security-Policy to allow.
// - Deletes the router's unused client chunks (the islands bundle stays).
// - Fails if a page still has an inline script (JSON-LD is data, not code),
//   or if the build wrote a path ww-api serves on the same host.
import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { buildDir, SITE } from '../src/lib/site.ts'

const out = path.resolve(import.meta.dirname, '..', buildDir(SITE), 'client')

/**
 * Paths ww-api serves on the site's host
 * (docs/adr/0042-witnesswork-app-domain.md §3).
 */
const RESERVED = [
  '.well-known',
  'accounts/handoff',
  'accounts/handoff.html',
  'contacts',
  'contacts.html',
  'buddies/invite',
  'buddies/invite.html',
]

const ROUTER_STATE =
  /<script>\(self\.\$R=self\.\$R\|\|\{\}\)\["tsr"\][\s\S]*?<\/script>/g
const INLINE_SCRIPT =
  /<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>/g

async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* files(full)
    else yield full
  }
}

const problems = []
let pages = 0
for await (const file of files(out)) {
  if (!file.endsWith('.html')) continue
  pages++
  const html = await readFile(file, 'utf8')
  const stripped = html.replace(ROUTER_STATE, '')
  const inline = stripped.match(INLINE_SCRIPT)
  if (inline)
    problems.push(`${path.relative(out, file)}: inline script ${inline[0]}`)
  if (stripped !== html) await writeFile(file, stripped)
}

const assets = path.join(out, 'assets')
for (const name of await readdir(assets)) {
  if (name.endsWith('.js') && !name.startsWith('islands-')) {
    await rm(path.join(assets, name))
  }
}
try {
  await stat(path.join(out, 'islands.js'))
} catch {
  problems.push('islands.js is missing (vite build -c vite.islands.config.ts)')
}

for (const reserved of RESERVED) {
  try {
    await stat(path.join(out, reserved))
    problems.push(`${reserved}: ww-api serves this path; the site must not`)
  } catch {}
}

if (problems.length) {
  console.error(`Build check failed:\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
console.log(
  `Static build OK (${SITE.env}): ${pages} pages in ${path.relative(process.cwd(), out)}.`
)
