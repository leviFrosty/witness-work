import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  applyPerfProbe,
  forwardAndroidBackend,
  loadLocalEnv,
  validateLocalEnv,
} from '../with-local-env.mjs'

const directories = []
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-env-test-'))
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

test('development stays selected when a build tool switches NODE_ENV and exports reach children', () => {
  const root = fixture()
  write(
    root,
    '.env',
    'EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY=test_dev\nGOOGLE_MAPS_ANDROID_API_KEY=dev_maps\nEXPO_PUBLIC_API_BASE_URL=http://localhost:8787\n'
  )
  write(
    root,
    '.env.production',
    'EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY=goog_prod\n'
  )
  write(root, '.env.local', 'EXPO_PUBLIC_SILENT=true\n')
  const { env } = loadLocalEnv(root, 'development', {
    NODE_ENV: 'production',
    EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY: 'goog_shell',
    EXPO_PUBLIC_API_DEV_BYPASS: 'stale',
    PATH: process.env.PATH,
  })
  assert.equal(env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY, 'test_dev')
  assert.equal(env.EXPO_PUBLIC_API_DEV_BYPASS, undefined)
  assert.equal(env.EXPO_PUBLIC_SILENT, 'true')
  assert.equal(env.NODE_ENV, 'development')
  assert.equal(env.EXPO_NO_DOTENV, '1')
  assert.equal(validateLocalEnv(env, 'android').port, '8787')
  const child = spawnSync(
    process.execPath,
    [
      '-e',
      'process.stdout.write(process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY)',
    ],
    { env, encoding: 'utf8' }
  )
  assert.equal(child.status, 0)
  assert.equal(child.stdout, 'test_dev')
})

test('production never merges development files, overrides or inherited bypass tokens', () => {
  const root = fixture()
  write(root, '.env', 'EXPO_PUBLIC_API_DEV_BYPASS=dev_secret\n')
  write(root, '.env.local', 'EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY=test_local\n')
  write(
    root,
    '.env.production',
    'EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY=appl_prod\nEXPO_PUBLIC_API_BASE_URL=\n'
  )
  const { env } = loadLocalEnv(root, 'production', {
    EXPO_PUBLIC_API_DEV_BYPASS: 'stale',
    POSTHOG_CLI_API_KEY: 'stale',
    POSTHOG_DISABLE_UPLOAD: 'true',
  })
  assert.equal(env.EXPO_PUBLIC_API_DEV_BYPASS, undefined)
  assert.equal(env.POSTHOG_CLI_API_KEY, undefined)
  assert.equal(env.POSTHOG_DISABLE_UPLOAD, 'true')
  assert.equal(
    validateLocalEnv(env, 'ios').hostname,
    'ww-proxy.leviwilkerson.com'
  )
  write(root, '.env.production.local', 'EXPO_PUBLIC_API_DEV_BYPASS=bad\n')
  assert.throws(() => loadLocalEnv(root, 'production', {}), /DEV_BYPASS/)
})

test('missing platform keys, placeholder Maps keys and store test keys stop before builds', () => {
  const env = { APP_VARIANT: 'development' }
  assert.throws(() => validateLocalEnv(env, 'android'), /REVENUECAT_GOOGLE/)
  env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY = 'test_dev'
  for (const value of [undefined, '', 'YOUR_GOOGLE_MAPS_ANDROID_API_KEY']) {
    env.GOOGLE_MAPS_ANDROID_API_KEY = value
    assert.throws(() => validateLocalEnv(env, 'android'), /GOOGLE_MAPS_ANDROID/)
  }
  env.APP_VARIANT = 'production'
  assert.throws(() => validateLocalEnv(env, 'android'), /store SDK key/)
})

test('worktrees use the main checkout env and allow an override in their own directory', () => {
  const root = fixture()
  const worktree = `${root}-worktree`
  directories.push(worktree)
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
  }
  git('init', '-q')
  git(
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.invalid',
    'commit',
    '--allow-empty',
    '-qm',
    'initial'
  )
  git('worktree', 'add', '-qb', 'env-test', worktree)
  write(root, '.env', 'EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY=test_main\n')
  write(
    worktree,
    '.env.local',
    'EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY=test_override\n'
  )
  const { env, files } = loadLocalEnv(worktree, 'development', {})
  assert.equal(env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY, 'test_override')
  assert.equal(files.length, 2)
})

test('a worktree holding a copied .env still layers over the main checkout .env.local', () => {
  const root = fixture()
  const worktree = `${root}-worktree`
  directories.push(worktree)
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
  }
  git('init', '-q')
  git(
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.invalid',
    'commit',
    '--allow-empty',
    '-qm',
    'initial'
  )
  git('worktree', 'add', '-qb', 'env-copy-test', worktree)
  write(root, '.env', 'EXPO_PUBLIC_API_BASE_URL=http://main\n')
  write(root, '.env.local', 'GOOGLE_MAPS_ANDROID_API_KEY=main_maps\n')
  write(worktree, '.env', 'EXPO_PUBLIC_API_BASE_URL=http://worktree\n')
  const { env, files } = loadLocalEnv(worktree, 'development', {})
  assert.equal(env.GOOGLE_MAPS_ANDROID_API_KEY, 'main_maps')
  assert.equal(env.EXPO_PUBLIC_API_BASE_URL, 'http://worktree')
  assert.equal(files.length, 3)
})

test('missing environment files and disabled runtime inlining fail clearly', () => {
  const root = fixture()
  assert.throws(
    () => loadLocalEnv(root, 'production', {}),
    /env.production missing/
  )
  write(root, '.env', '')
  assert.throws(
    () => loadLocalEnv(root, 'development', { EXPO_NO_CLIENT_ENV_VARS: '1' }),
    /EXPO_NO_CLIENT_ENV_VARS/
  )
})

test('Android localhost forwarding uses the configured port and requires explicit selection for multiple devices', () => {
  const calls = []
  const run = (command, args) => {
    calls.push([command, args])
    return args[0] === 'devices'
      ? {
          status: 0,
          stdout: 'List of devices attached\nfirst\tdevice\nsecond\tdevice\n',
        }
      : { status: 0, stdout: '' }
  }
  const api = new URL('http://localhost:8787')
  assert.throws(() => forwardAndroidBackend(api, {}, run), /ANDROID_SERIAL/)
  forwardAndroidBackend(api, { ANDROID_SERIAL: 'second' }, run)
  assert.deepEqual(calls.at(-1), [
    'adb',
    ['-s', 'second', 'reverse', 'tcp:8787', 'tcp:8787'],
  ])
  const count = calls.length
  forwardAndroidBackend(new URL('https://ww-proxy.leviwilkerson.com'), {}, run)
  assert.equal(calls.length, count)
})

test('a verification run can point development, and only development, at its own backend', () => {
  const root = fixture()
  write(root, '.env', 'EXPO_PUBLIC_API_BASE_URL=http://localhost:8787\n')
  write(root, '.env.production', 'EXPO_PUBLIC_API_BASE_URL=https://prod\n')
  const inherited = {
    WW_VERIFY_API_BASE_URL: 'http://127.0.0.1:8791',
    WW_VERIFY_API_DEV_BYPASS: 'isolated-token',
  }
  const { env } = loadLocalEnv(root, 'development', inherited)
  assert.equal(env.EXPO_PUBLIC_API_BASE_URL, 'http://127.0.0.1:8791')
  assert.equal(env.EXPO_PUBLIC_API_DEV_BYPASS, 'isolated-token')
  const production = loadLocalEnv(root, 'production', inherited).env
  assert.equal(production.EXPO_PUBLIC_API_BASE_URL, 'https://prod')
  assert.equal(production.EXPO_PUBLIC_API_DEV_BYPASS, undefined)
})

test('a profiling build turns the probe on in development only, and never inherits it', () => {
  const root = fixture()
  write(root, '.env', 'EXPO_PUBLIC_API_BASE_URL=http://localhost:8787\n')
  write(root, '.env.production', 'EXPO_PUBLIC_API_BASE_URL=https://prod\n')
  const leaked = loadLocalEnv(root, 'development', {
    EXPO_PUBLIC_PERF_PROBE: '1',
  }).env
  assert.equal(leaked.EXPO_PUBLIC_PERF_PROBE, undefined)
  const inherited = { WW_PERF_PROBE: '1' }
  const { env } = loadLocalEnv(root, 'development', inherited)
  assert.equal(env.EXPO_PUBLIC_PERF_PROBE, '1')
  const production = loadLocalEnv(root, 'production', inherited).env
  assert.equal(production.EXPO_PUBLIC_PERF_PROBE, undefined)
})

test('a profiling build leaves RevenueCat unconfigured on Android only', () => {
  const env = () => ({
    EXPO_PUBLIC_PERF_PROBE: '1',
    EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY: 'test_google',
    EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY: 'test_apple',
  })
  assert.equal(
    applyPerfProbe(env(), 'android').EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY,
    ''
  )
  assert.equal(
    applyPerfProbe(env(), 'ios').EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY,
    'test_apple'
  )
  const normal = { EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY: 'test_google' }
  assert.equal(
    applyPerfProbe(normal, 'android').EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY,
    'test_google'
  )
})
