import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  WEB_EXCLUDED_KEYS,
  filesContaining,
  loadWebEnv,
  oversizedFiles,
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

test('an unknown profile fails clearly', () => {
  assert.throws(() => loadWebEnv(nativeEnvFiles(), 'staging', {}), /--env/)
})

test('the export check finds an excluded value in any file', () => {
  const root = fixture()
  fs.mkdirSync(path.join(root, '_expo'))
  write(root, 'index.html', '<html></html>')
  write(root, '_expo/bundle.js', 'const key = "appl_secret"')
  assert.deepEqual(filesContaining(root, ['appl_secret']), [
    path.join(root, '_expo', 'bundle.js'),
  ])
  assert.deepEqual(filesContaining(root, ['ota_secret']), [])
  assert.deepEqual(filesContaining(root, []), [])
})

test('the export check finds files over the host limit', () => {
  const root = fixture()
  fs.mkdirSync(path.join(root, '_expo'))
  write(root, 'index.html', 'x'.repeat(10))
  write(root, '_expo/bundle.js', 'x'.repeat(11))
  assert.deepEqual(oversizedFiles(root, 10), [
    path.join(root, '_expo', 'bundle.js'),
  ])
  assert.deepEqual(oversizedFiles(root), [])
})
