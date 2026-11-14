#!/usr/bin/env node

import { pathToFileURL } from 'node:url'

/**
 * Resets an account's Scribe AI usage windows (`POST /admin/scribe/reset`).
 * `--notes-import` resets the old Notes Import meter instead
 * (`POST /admin/notes-import/reset`), which answers only while KV
 * `scribe:legacy-notes-import` is on.
 */

// The old production host (ww-proxy.leviwilkerson.com) serves the same Worker
// for good; set WW_API_PROD_URL to use it. WW_API_BETA_URL overrides Beta's.
const PROD_URL = 'https://api.witnesswork.app'
const BETA_URL = 'https://api-beta.witnesswork.app'
const VALID_ID = /^[A-Za-z0-9_-]{8,64}$/
const FLAGS = new Set(['--beta', '--notes-import'])

export function resolveResetCommand(args, env) {
  const beta = args.includes('--beta')
  const notesImport = args.includes('--notes-import')
  const positional = args.filter((arg) => !FLAGS.has(arg))
  if (positional.length !== 1 || !VALID_ID.test(positional[0])) {
    throw new Error(
      'Usage: pnpm run admin:reset-usage [--beta] [--notes-import] <accountId> (8-64 letters, digits, _ or -)'
    )
  }

  const token = beta ? env.ADMIN_API_TOKEN_BETA : env.ADMIN_API_TOKEN
  if (!token) {
    throw new Error(
      `${beta ? 'ADMIN_API_TOKEN_BETA' : 'ADMIN_API_TOKEN'} is not set in .env`
    )
  }

  const rawBaseUrl = beta
    ? env.WW_API_BETA_URL || BETA_URL
    : env.WW_API_PROD_URL || PROD_URL

  return {
    path: notesImport ? '/admin/notes-import/reset' : '/admin/scribe/reset',
    body: notesImport ? { meterId: positional[0] } : { accountId: positional[0] },
    baseUrl: rawBaseUrl.replace(/\/+$/, ''),
    token,
    environment: beta ? 'beta' : 'production',
  }
}

async function main() {
  const command = resolveResetCommand(process.argv.slice(2), process.env)
  const response = await fetch(`${command.baseUrl}${command.path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ww-admin-token': command.token,
    },
    body: JSON.stringify(command.body),
  })
  const body = await response.text()
  if (!response.ok) {
    throw new Error(
      `${command.environment} reset failed (${response.status}): ${body}`
    )
  }
  process.stdout.write(`${body}\n`)
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
