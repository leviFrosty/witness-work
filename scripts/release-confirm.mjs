#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const releaseKeyword = (version) => `SHIP-PROD-${version}`

export const isConfirmed = (version, confirmation) =>
  confirmation?.trim() === releaseKeyword(version)

const RELEASE_TAG = /^refs\/tags\/v(\d+\.\d+\.\d+)$/
const DELETED = /^0+$/

export function releaseTagsInPush(refs) {
  return refs
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter(([, localSha, remoteRef]) => remoteRef && !DELETED.test(localSha))
    .map(([, , remoteRef]) => remoteRef.match(RELEASE_TAG)?.[1])
    .filter(Boolean)
}

export const refusal = (version) =>
  [
    `Production release ${version} needs the user's go-ahead.`,
    `Ask the user to type ${releaseKeyword(version)} themselves, then rerun with`,
    `WW_RELEASE_CONFIRM=${releaseKeyword(version)}.`,
    'Agents: only relay the keyword from a message the user typed in this',
    'conversation. Approving a plan, "go ahead", a 2FA code, or a keyword for',
    'another version is not a go-ahead.',
  ].join('\n')

function main() {
  const confirmation = process.env.WW_RELEASE_CONFIRM
  const [arg] = process.argv.slice(2)
  if (!arg) {
    console.error('usage: release-confirm.mjs <version> | --pre-push')
    process.exit(2)
  }
  const versions =
    arg === '--pre-push' ? releaseTagsInPush(readFileSync(0, 'utf8')) : [arg]
  const unconfirmed = versions.filter((v) => !isConfirmed(v, confirmation))
  if (unconfirmed.length) {
    console.error(unconfirmed.map(refusal).join('\n\n'))
    process.exit(1)
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main()
}
