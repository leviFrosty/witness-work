import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  MAX_FILES,
  WEB_EXCLUDED_KEYS,
  buildSteps,
  checkExport,
  environments,
  filesContaining,
  loadWebEnv,
  oversizedFiles,
  restoringFiles,
  runBuildSteps,
} from '../web.mjs'

const directories = []
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-web-env-test-'))
  directories.push(root)
  return root
}
const write = (root, name, contents) =>
  fs.writeFileSync(path.join(root, name), contents)
afterEach(() =>
  directories
    .splice(0)
    .forEach((root) => fs.rmSync(root, { recursive: true, force: true }))
)

/** Every variant's files, holding every value a web build must drop. */
function nativeEnvFiles() {
  const root = fixture()
  const secrets = [
    'EXPO_PUBLIC_API_DEV_BYPASS=dev_bypass_secret',
    'EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY=appl_secret',
    'EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY=goog_secret',
    'EXPO_PUBLIC_HOT_UPDATER_API_KEY=ota_secret',
    'GOOGLE_MAPS_ANDROID_API_KEY=maps_secret',
    'POSTHOG_CLI_API_KEY=posthog_cli_secret',
  ]
  write(
    root,
    '.env',
    [
      ...secrets,
      'EXPO_PUBLIC_API_BASE_URL=http://localhost:8787',
      'POSTHOG_PROJECT_TOKEN=phc_dev',
    ].join('\n')
  )
  for (const variant of ['beta', 'production'])
    write(
      root,
      `.env.${variant}`,
      [
        // Release variants refuse a bypass outright.
        ...secrets.slice(1),
        'EXPO_PUBLIC_API_BASE_URL=https://ww-proxy.example',
        `POSTHOG_PROJECT_TOKEN=phc_${variant}`,
      ].join('\n')
    )
  return root
}

test('every web profile drops the dev bypass, store keys, OTA key and Maps key', () => {
  const root = nativeEnvFiles()
  for (const profile of ['local', 'dev', 'beta', 'production']) {
    const { env, excluded } = loadWebEnv(root, profile, {
      PATH: process.env.PATH,
      EXPO_PUBLIC_API_DEV_BYPASS: 'inherited',
      WW_VERIFY_API_DEV_BYPASS: 'verify_secret',
    })
    for (const key of WEB_EXCLUDED_KEYS) assert.equal(env[key], '', key)
    assert.equal(env.POSTHOG_CLI_API_KEY, undefined)
    assert.ok(excluded.includes('appl_secret'))
    assert.ok(excluded.includes('ota_secret'))
    assert.equal(env.WW_WEB_BUILD, '1')
    assert.equal(env.POSTHOG_DISABLE_UPLOAD, 'true')
    assert.equal(env.EXPO_NO_DOTENV, '1')
  }
})

test('the API comes from the profile; public values from its native variant', () => {
  const root = nativeEnvFiles()
  const dev = loadWebEnv(root, 'dev', {})
  assert.equal(
    dev.env.EXPO_PUBLIC_API_BASE_URL,
    'https://api-dev.witnesswork.app'
  )
  assert.equal(dev.env.POSTHOG_PROJECT_TOKEN, 'phc_dev')
  assert.equal(dev.host, 'app-dev.witnesswork.app')
  const beta = loadWebEnv(root, 'beta', {})
  assert.equal(beta.env.EXPO_PUBLIC_API_BASE_URL, 'https://api.witnesswork.app')
  assert.equal(beta.env.POSTHOG_PROJECT_TOKEN, 'phc_beta')
  assert.equal(beta.host, 'beta.app.witnesswork.app')
  const production = loadWebEnv(root, 'production', {})
  assert.equal(production.env.APP_VARIANT, 'production')
  assert.equal(production.env.POSTHOG_PROJECT_TOKEN, 'phc_production')
  assert.equal(production.host, 'app.witnesswork.app')
})

test('local uses .env, or a verification run’s own ww-api', () => {
  const root = nativeEnvFiles()
  assert.equal(
    loadWebEnv(root, 'local', {}).env.EXPO_PUBLIC_API_BASE_URL,
    'http://localhost:8787'
  )
  assert.equal(
    loadWebEnv(root, 'local', {
      WW_VERIFY_API_BASE_URL: 'http://127.0.0.1:8791',
    }).env.EXPO_PUBLIC_API_BASE_URL,
    'http://127.0.0.1:8791'
  )
})

test('release profiles also refuse the development bypass from .env', () => {
  const root = nativeEnvFiles()
  for (const profile of ['beta', 'production'])
    assert.ok(
      loadWebEnv(root, profile, {}).excluded.includes('dev_bypass_secret'),
      profile
    )
})

test('every profile names its host, origins and CSP mode; deployed ones a Worker', () => {
  for (const [name, profile] of Object.entries(environments)) {
    for (const key of ['variant', 'host', 'apiOrigin', 'posthogOrigin'])
      assert.ok(profile[key], `${name}.${key}`)
    assert.match(profile.mapsOrigin, /^https:\/\/maps/)
    assert.ok(['report-only', 'enforce'].includes(profile.csp), name)
    assert.equal(new URL(profile.apiOrigin).origin, profile.apiOrigin)
    assert.equal(Boolean(profile.worker), name !== 'local', name)
  }
  // Release builds bundle the published Help Center; dev builds the dev
  // website's copy.
  for (const name of ['beta', 'production'])
    assert.equal(
      environments[name].helpManifest,
      'https://witnesswork.app/help/bundle/manifest.json'
    )
  for (const name of ['local', 'dev'])
    assert.equal(
      environments[name].helpManifest,
      'https://dev.witnesswork.app/help/bundle/manifest.json'
    )
})

test('a build refreshes the Help Center snapshot before it exports', () => {
  for (const profile of Object.keys(environments)) {
    const steps = buildSteps(profile)
    assert.deepEqual(
      steps.map((step) => step.name),
      ['sync:help', 'export']
    )
    assert.deepEqual(steps[0].args, [
      'scripts/sync-help-center.mjs',
      '--manifest',
      environments[profile].helpManifest,
    ])
    assert.match(steps[0].failure, /Help Center/)
    assert.deepEqual(steps[1].args.slice(0, 3), ['export', '--platform', 'web'])
  }
})

test('a failed Help Center refresh fails the build before it exports', () => {
  const ran = []
  const run = (status) => (step) => {
    ran.push(step.name)
    return step.name === 'sync:help' ? status : 0
  }
  // `sync:help` with no connection exits 1.
  assert.throws(
    () => runBuildSteps(buildSteps('dev'), run(1)),
    /Couldn't refresh the Help Center snapshot/
  )
  assert.deepEqual(ran, ['sync:help'])
  ran.length = 0
  runBuildSteps(buildSteps('dev'), run(0))
  assert.deepEqual(ran, ['sync:help', 'export'])
})

test('the Help Center snapshot a build fetched leaves the checkout as it was', () => {
  const snapshot = fixture()
  write(snapshot, 'en-US.json', 'committed')
  write(snapshot, 'ar.json', 'edited, not committed')
  const sync = () => {
    write(snapshot, 'en-US.json', 'live')
    write(snapshot, 'fr-FR.json', 'live')
  }
  assert.equal(
    restoringFiles(snapshot, () => {
      sync()
      assert.equal(
        fs.readFileSync(path.join(snapshot, 'en-US.json'), 'utf8'),
        'live'
      )
      return 'built'
    }),
    'built'
  )
  const files = () =>
    Object.fromEntries(
      fs
        .readdirSync(snapshot)
        .map((file) => [
          file,
          fs.readFileSync(path.join(snapshot, file), 'utf8'),
        ])
    )
  const before = {
    'ar.json': 'edited, not committed',
    'en-US.json': 'committed',
  }
  assert.deepEqual(files(), before)
  // A failed export too.
  assert.throws(
    () =>
      restoringFiles(snapshot, () => {
        sync()
        throw new Error('export failed')
      }),
    /export failed/
  )
  assert.deepEqual(files(), before)
})

test('an unknown profile fails clearly', () => {
  assert.throws(() => loadWebEnv(nativeEnvFiles(), 'staging', {}), /--env/)
})

test('the export check finds an excluded value in any file, source maps too', () => {
  const root = fixture()
  fs.mkdirSync(path.join(root, '_expo'))
  write(root, 'index.html', '<html></html>')
  write(root, '_expo/bundle.js', 'const key = "appl_secret"')
  write(root, '_expo/bundle.js.map', '{"x":"ota_secret"}')
  assert.deepEqual(filesContaining(root, ['appl_secret']), ['_expo/bundle.js'])
  assert.deepEqual(filesContaining(root, ['ota_secret', undefined, '']), [
    '_expo/bundle.js.map',
  ])
  assert.deepEqual(filesContaining(root, ['maps_secret']), [])
  assert.deepEqual(filesContaining(root, []), [])
  // Too short to tell apart from code.
  assert.deepEqual(filesContaining(root, ['key']), [])
  assert.throws(
    () => checkExport(root, ['appl_secret']),
    /must not carry.*_expo\/bundle\.js/
  )
})

test('the export check finds served files over the host limits', () => {
  const root = fixture()
  fs.mkdirSync(path.join(root, '_expo'))
  write(root, 'index.html', 'x'.repeat(10))
  write(root, '_expo/bundle.js', 'x'.repeat(11))
  write(root, '_expo/bundle.js.map', 'x'.repeat(12))
  assert.deepEqual(oversizedFiles(root, 10), ['_expo/bundle.js'])
  assert.deepEqual(oversizedFiles(root), [])
  checkExport(root, [])
  const big = path.join(root, '_expo/big.js')
  fs.writeFileSync(big, '')
  fs.truncateSync(big, 26 * 1024 * 1024)
  assert.throws(() => checkExport(root, []), /25 MiB.*_expo\/big\.js/)
  // Source maps aren't uploaded.
  fs.renameSync(big, `${big}.map`)
  checkExport(root, [])
  assert.equal(MAX_FILES, 20_000)
  checkExport(root, [], { maxFiles: 2 })
  write(root, '_expo/other.js', '')
  assert.throws(() => checkExport(root, [], { maxFiles: 2 }), /allows 2$/)
})
