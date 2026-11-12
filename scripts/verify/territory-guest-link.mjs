#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { build } from 'esbuild'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const DEFAULT_STATE = path.join(ROOT, '.verify/territory-guest/link.json')

const USAGE = `Usage: node scripts/verify/territory-guest-link.mjs <command> [options]

Makes a scoped Territories space and a guest link, and acts as its owner.

Commands:
  fake      Serve an in-memory fake Shared Spaces API (stays running).
            --port 8796. Extra routes: POST /__fake/advance?ms=N moves its
            clock, POST /__fake/guests?on=0|1 flips the guest switch.
  create    Make a space with streets, records and a link; print the URL.
            --api <base>   ww-api base URL (fake, local or dev), required
            --web <origin> web app origin for the URL (default http://127.0.0.1:8130)
            --streets "Oak Street,Elm Street:odd,Pine Street"
            --link-streets 0,1   which streets the link covers (default all)
            --privacy      houseRecords false (owner's privacy mode)
            --hours 24     link lifetime
            --owner Anna   creator's name shown to guests
  door      Record a door as the owner: --label 14 [--street 0]
            [--outcome spoke|notHome|doNotCall] [--name Joe]
  end       End the link (link/end).
  records   Print the space's records, opened (owner's view).

Every command but fake takes --state <file> (default .verify/territory-guest/link.json)
and --bypass <token> (or WW_API_DEV_BYPASS), the API's dev-bypass token
(any value for the fake). Each request carries its own cf-connecting-ip.
`

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    api: { type: 'string' },
    web: { type: 'string', default: 'http://127.0.0.1:8130' },
    port: { type: 'string', default: '8796' },
    streets: {
      type: 'string',
      default: 'Oak Street,Elm Street:odd,Pine Street',
    },
    'link-streets': { type: 'string' },
    privacy: { type: 'boolean', default: false },
    hours: { type: 'string', default: '24' },
    owner: { type: 'string', default: 'Anna' },
    state: { type: 'string', default: DEFAULT_STATE },
    bypass: { type: 'string', default: process.env.WW_API_DEV_BYPASS ?? '' },
    label: { type: 'string' },
    street: { type: 'string', default: '0' },
    outcome: { type: 'string', default: 'spoke' },
    name: { type: 'string' },
    help: { type: 'boolean', default: false },
  },
})

const command = positionals[0]
if (values.help || !command) {
  process.stdout.write(USAGE)
  process.exit(command ? 0 : 1)
}

async function load() {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'territory-guest-'))
  const file = path.join(out, 'territoryGuestLink.mjs')
  await build({
    entryPoints: [path.join(ROOT, 'scripts/verify/territoryGuestLink.ts')],
    outfile: file,
    bundle: true,
    platform: 'node',
    format: 'esm',
    absWorkingDir: ROOT,
    alias: { '@': path.join(ROOT, 'src') },
    define: { __DEV__: 'false' },
    logLevel: 'error',
    banner: {
      js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
    },
    plugins: [
      {
        name: 'stub-expo-network',
        setup(b) {
          b.onResolve({ filter: /^expo-network$/ }, () => ({
            path: 'expo-network',
            namespace: 'stub',
          }))
          b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
            contents:
              'export const addNetworkStateListener = () => ({ remove() {} }); export const getNetworkStateAsync = async () => ({ isConnected: true, isInternetReachable: true });',
          }))
        },
      },
    ],
  })
  try {
    return await import(pathToFileURL(file).href)
  } finally {
    fs.rmSync(out, { recursive: true, force: true })
  }
}

const readState = () => JSON.parse(fs.readFileSync(values.state, 'utf8'))

const parseStreets = (text) =>
  text
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry, index) => {
      const [name, numbering = 'both'] = entry.split(':')
      return {
        name,
        numbering,
        doors:
          index === 0
            ? [
                { label: '2', outcome: 'notHome' },
                { label: '4', outcome: 'spoke', byName: 'Joe' },
              ]
            : [],
        doNotCalls: index === 0 ? [{ address: `8 ${name}`, label: '8' }] : [],
      }
    })

const lib = await load()

switch (command) {
  case 'fake': {
    const port = Number(values.port)
    await lib.serveFake(port)
    process.stdout.write(
      `${JSON.stringify({ api: `http://127.0.0.1:${port}` })}\n`
    )
    break
  }
  case 'create': {
    if (!values.api) throw new Error('--api is required')
    const saved = await lib.createLink({
      api: values.api.replace(/\/$/, ''),
      web: values.web.replace(/\/$/, ''),
      bypass: values.bypass || 'fake',
      streets: parseStreets(values.streets),
      linkStreets: values['link-streets']
        ?.split(',')
        .map((index) => Number(index)),
      houseRecords: !values.privacy,
      hours: Number(values.hours),
      ownerName: values.owner,
    })
    fs.mkdirSync(path.dirname(values.state), { recursive: true })
    fs.writeFileSync(values.state, JSON.stringify(saved, null, 2), {
      mode: 0o600,
    })
    process.stdout.write(
      `${JSON.stringify({ url: saved.url, fragment: saved.fragment, linkId: saved.linkId, streetIds: saved.streetIds, state: values.state })}\n`
    )
    break
  }
  case 'door': {
    if (!values.label) throw new Error('--label is required')
    const recordId = await lib.putDoor(readState(), values.bypass || 'fake', {
      street: Number(values.street),
      label: values.label,
      outcome: values.outcome,
      byName: values.name,
    })
    process.stdout.write(`${JSON.stringify({ ok: true, recordId })}\n`)
    break
  }
  case 'end':
    await lib.endLink(readState(), values.bypass || 'fake')
    process.stdout.write(`${JSON.stringify({ ok: true })}\n`)
    break
  case 'records':
    process.stdout.write(
      `${JSON.stringify(await lib.readRecords(readState(), values.bypass || 'fake'), null, 2)}\n`
    )
    break
  default:
    process.stdout.write(USAGE)
    process.exit(1)
}
