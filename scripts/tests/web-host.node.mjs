import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { unstable_readConfig } from 'wrangler'
import {
  INTEGRATION_BRANCH,
  PRODUCTION_TOKEN_ITEM,
  STAMP,
  WRANGLER_CONFIG,
  checkStamp,
  deployPlan,
  missingOrigins,
  deployTokenRead,
  prepareAssets,
  profiles,
  wranglerEnv,
  writeStamp,
} from '../web-host.mjs'
import { environments } from '../web.mjs'
import { headersFile } from '../../web/host/src/headers.ts'

const root = fileURLToPath(new URL('../../', import.meta.url))
const version = JSON.parse(
  fs.readFileSync(new URL('../../package.json', import.meta.url))
).version
const keyword = { WW_RELEASE_CONFIRM: `SHIP-PROD-${version}` }
const HEAD = 'a'.repeat(40)
const integration = {
  clean: true,
  head: HEAD,
  integrationHead: HEAD,
  onMain: false,
  tags: [],
}
const release = { ...integration, onMain: true, tags: [`v${version}`] }
const plan = (target, args = ['--dry-run'], env = {}, git = integration) =>
  deployPlan(target, args, { env, git })

const fixtures = []
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-web-host-test-'))
  fixtures.push(dir)
  return dir
}
afterEach(() =>
  fixtures
    .splice(0)
    .forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }))
)

function exportFixture() {
  const dir = fixture()
  const write = (file, contents) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    fs.writeFileSync(path.join(dir, file), contents)
  }
  write('index.html', '<!doctype html>')
  write('_expo/static/js/web/index-8ee1e5e4af138582a02721ff781b6161.js', '1')
  write(
    '_expo/static/js/web/index-8ee1e5e4af138582a02721ff781b6161.js.map',
    '{}'
  )
  write('canvaskit.wasm', '\0asm')
  return { dir, write }
}

test('production refuses without the keyword for exactly this version, dry runs included', () => {
  for (const value of [
    undefined,
    '',
    'go ahead',
    'SHIP-PROD-0.0.0',
    `SHIP-PROD-${version}.1`,
  ])
    for (const args of [[], ['--dry-run']])
      assert.throws(
        () => plan('production', args, { WW_RELEASE_CONFIRM: value }, release),
        /go-ahead/
      )
  const confirmed = plan('production', ['--dry-run'], keyword, release)
  assert.equal(confirmed.worker, 'ww-web')
  assert.equal(confirmed.host, 'app.witnesswork.app')
  assert.deepEqual(confirmed.blocked, [])
})

test('production deploys only the tagged release commit on origin/main', () => {
  const offMain = plan('production', ['--dry-run'], keyword, {
    ...release,
    onMain: false,
  })
  assert.match(offMain.blocked.join('\n'), /origin\/main/)
  const untagged = plan('production', ['--dry-run'], keyword, {
    ...release,
    tags: ['v0.0.1'],
  })
  assert.match(untagged.blocked.join('\n'), new RegExp(`v${version}`))
  const dirty = plan('production', [], keyword, { ...release, clean: false })
  assert.match(dirty.blocked.join('\n'), /Commit all changes/)
})

test('dev deploys only a clean checkout of the integration branch head', () => {
  assert.deepEqual(plan('dev').blocked, [])
  const dirty = plan('dev', [], {}, { ...integration, clean: false })
  assert.match(dirty.blocked.join('\n'), /Commit all changes/)
  for (const git of [
    { ...integration, head: 'b'.repeat(40) },
    { ...integration, integrationHead: undefined },
  ]) {
    const refused = plan('dev', [], {}, git)
    assert.equal(refused.blocked.length, 1)
    assert.match(refused.blocked[0], new RegExp(INTEGRATION_BRANCH))
  }
})

test('a deploy builds through web:build, which refreshes the Help Center first', () => {
  for (const target of ['dev', 'beta', 'production'])
    assert.match(
      plan(target, ['--dry-run'], keyword, release).build,
      new RegExp(`^pnpm run web:build --env ${target}: sync:help, then export$`)
    )
  assert.match(plan('dev', ['--prebuilt']).build, /as stamped/)
})

test('the deploy and the build read the same profiles', () => {
  assert.equal(profiles, environments)
  assert.deepEqual(Object.keys(profiles), [
    'local',
    'dev',
    'beta',
    'production',
  ])
})

test('a dev preview leaves app-dev alone, so any clean branch may upload one', () => {
  const branch = { ...integration, head: 'b'.repeat(40) }
  const preview = plan('dev', ['--preview'], {}, branch)
  assert.deepEqual(preview.blocked, [])
  assert.deepEqual(preview.command.slice(1, 3), ['versions', 'upload'])
  assert.match(preview.host, /workers\.dev/)
  assert.match(
    plan('dev', ['--preview'], {}, { ...branch, clean: false }).blocked[0],
    /Commit/
  )
  for (const target of ['beta', 'production'])
    assert.throws(
      () => plan(target, ['--preview'], keyword, release),
      /Only dev/
    )
})

test('beta needs only committed code, and nothing selects another environment', () => {
  assert.deepEqual(
    plan('beta', [], {}, { ...integration, head: 'c'.repeat(40) }).blocked,
    []
  )
  for (const target of [undefined, 'local', 'staging', 'prod', 'development'])
    assert.throws(() => plan(target), /Usage/)
  for (const args of [
    ['--env', 'production'],
    ['--force'],
    ['--config', 'x'],
    ['--yes'],
  ])
    assert.throws(() => plan('beta', args), /Unknown web deploy argument/)
})

test('each environment deploys its own Worker to its own host', () => {
  const workers = new Set()
  for (const target of ['dev', 'beta', 'production']) {
    const result = plan(target, ['--dry-run'], keyword, release)
    assert.deepEqual(result.command.slice(1, 6), [
      'deploy',
      '--config',
      WRANGLER_CONFIG,
      '--env',
      target,
    ])
    workers.add(result.worker)
    const config = unstable_readConfig({
      config: path.join(root, WRANGLER_CONFIG),
      env: target,
    })
    assert.equal(config.name, profiles[target].worker)
    assert.deepEqual(config.routes, [
      { pattern: profiles[target].host, custom_domain: true },
    ])
    assert.equal(config.workers_dev, false)
    assert.equal(config.preview_urls, target === 'dev')
    assert.equal(config.vars.WW_WEB_PROFILE, target)
    assert.equal(config.assets.not_found_handling, 'single-page-application')
    // `/.well-known/*` too: a missing file there must never be the app.
    for (const pattern of [
      '/_expo/*',
      '/assets/*',
      '/*.wasm',
      '/.well-known/*',
      '/_csp-report',
    ])
      assert.ok(config.assets.run_worker_first.includes(pattern), pattern)
  }
  assert.equal(workers.size, 3)
  const local = unstable_readConfig({
    config: path.join(root, WRANGLER_CONFIG),
  })
  assert.equal(local.vars.WW_WEB_PROFILE, 'local')
  assert.deepEqual(local.routes ?? [], [])
  assert.equal(local.workers_dev, false)
})

test('the production token is read through the 1Password app, never the service account', () => {
  const inherited = { OP_SERVICE_ACCOUNT_TOKEN: 'ops_token', PATH: '/bin' }
  const read = deployTokenRead(inherited)
  assert.equal(read.env.OP_SERVICE_ACCOUNT_TOKEN, undefined)
  assert.equal(read.env.PATH, '/bin')
  assert.ok(!read.args.includes('--vault'))
  assert.equal(read.args[2], PRODUCTION_TOKEN_ITEM)
  assert.equal(inherited.OP_SERVICE_ACCOUNT_TOKEN, 'ops_token')
})

test('wrangler runs with only the environment’s own credential', () => {
  const inherited = {
    CLOUDFLARE_API_TOKEN: 'leftover',
    OP_SERVICE_ACCOUNT_TOKEN: 'ops',
    PATH: '/bin',
  }
  for (const target of ['dev', 'beta']) {
    const env = wranglerEnv(target, inherited, 'ignored')
    assert.equal(env.CLOUDFLARE_API_TOKEN, undefined)
    assert.equal(env.OP_SERVICE_ACCOUNT_TOKEN, undefined)
  }
  assert.throws(() => wranglerEnv('production', inherited), /token/)
  assert.equal(
    wranglerEnv('production', inherited, ' prod-token\n').CLOUDFLARE_API_TOKEN,
    'prod-token'
  )
})

test('a production dry run with the keyword plans without reading any credential', () => {
  const bin = fixture()
  const marker = path.join(bin, 'op-was-called')
  fs.writeFileSync(path.join(bin, 'op'), `#!/bin/sh\ntouch ${marker}\n`, {
    mode: 0o755,
  })
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` }
  const run = (extra) =>
    spawnSync(
      process.execPath,
      ['scripts/web-host.mjs', 'deploy', 'production', '--dry-run'],
      { cwd: root, env: { ...env, ...extra }, encoding: 'utf8' }
    )
  const refused = run({ WW_RELEASE_CONFIRM: '' })
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /needs the user's go-ahead/)
  assert.equal(refused.stdout, '')
  const planned = run(keyword)
  const printed = JSON.parse(planned.stdout)
  assert.equal(printed.worker, 'ww-web')
  assert.equal(printed.dryRun, true)
  assert.equal(fs.existsSync(marker), false)
})

test('a prebuilt export must be this profile and commit, unchanged since its build', () => {
  const { dir, write } = exportFixture()
  assert.throws(() => checkStamp(dir, 'beta', HEAD), /no build stamp/)
  writeStamp(dir, 'beta', HEAD)
  checkStamp(dir, 'beta', HEAD)
  prepareAssets(dir, 'beta')
  checkStamp(dir, 'beta', HEAD)
  assert.throws(() => checkStamp(dir, 'production', HEAD), /holds beta/)
  assert.throws(() => checkStamp(dir, 'beta', 'b'.repeat(40)), /holds beta/)
  write('canvaskit.wasm', 'swapped')
  assert.throws(() => checkStamp(dir, 'beta', HEAD), /changed.*canvaskit/)
  write('canvaskit.wasm', '\0asm')
  write('hot-updater/bundle.zip', 'stray')
  assert.throws(() => checkStamp(dir, 'beta', HEAD), /changed.*hot-updater/)
})

test('the export gets the profile’s headers and skips source maps', () => {
  const { dir } = exportFixture()
  prepareAssets(dir, 'dev')
  assert.equal(
    fs.readFileSync(path.join(dir, '_headers'), 'utf8'),
    headersFile(profiles.dev)
  )
  const ignored = fs.readFileSync(path.join(dir, '.assetsignore'), 'utf8')
  assert.deepEqual(ignored.trim().split('\n'), ['*.map', STAMP])
  assert.throws(() => prepareAssets(fixture(), 'dev'), /index\.html is missing/)
})

test('a build must call the ww-api, PostHog and Help Center origins its CSP allows', () => {
  const { dir, write } = exportFixture()
  const chunk = '_expo/static/js/web/index-8ee1e5e4af138582a02721ff781b6161.js'
  assert.deepEqual(missingOrigins(dir, 'beta'), [
    profiles.beta.apiOrigin,
    profiles.beta.posthogOrigin,
    'https://witnesswork.app',
    profiles.beta.helpSearchOrigin,
  ])
  write(
    chunk,
    [
      profiles.dev.apiOrigin,
      profiles.dev.posthogOrigin,
      profiles.dev.helpManifest,
      `${profiles.dev.helpSearchOrigin}/v1/search`,
    ]
      .map((url) => `"${url}"`)
      .join(';')
  )
  assert.deepEqual(missingOrigins(dir, 'dev'), [])
  assert.deepEqual(missingOrigins(dir, 'beta'), [
    profiles.beta.apiOrigin,
    'https://witnesswork.app',
    profiles.beta.helpSearchOrigin,
  ])
})
