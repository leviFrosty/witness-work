import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deploymentPlan, signingKeyItem, signingKeyRead } from '../ota.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { prepareHermesMaps } from '../ota-source-maps.mjs'
import { isIgnoredPath } from '@expo/fingerprint/build/utils/Path.js'
import { buildPathMatchObjects } from '@expo/fingerprint/build/utils/Path.js'
import { DEFAULT_IGNORE_PATHS } from '@expo/fingerprint/build/Options.js'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import vm from 'node:vm'

const version = JSON.parse(
  fs.readFileSync(new URL('../../package.json', import.meta.url))
).version

test('fingerprints include native sources but exclude later build-output rules', () => {
  const patterns = [
    '**/*',
    '!**/*.h',
    '!**/*.c',
    '**/build/**',
    '**/expo-sqlite/ios/sqlite3.c',
  ]
  for (const prefix of [
    'node_modules/',
    '../../node_modules/.pnpm/pkg/node_modules/',
  ]) {
    assert.equal(
      isIgnoredPath(`${prefix}library/src/native.h`, patterns),
      false
    )
    assert.equal(
      isIgnoredPath(`${prefix}library/build/generated.h`, patterns),
      true
    )
    assert.equal(
      isIgnoredPath(`${prefix}expo-sqlite/ios/sqlite3.c`, patterns),
      true
    )
    assert.equal(
      isIgnoredPath(`${prefix}expo-sqlite/vendor/sqlite3/sqlite3.c`, patterns),
      false
    )
    assert.equal(
      isIgnoredPath(`${prefix}library/javascript.js`, patterns),
      true
    )
  }
})

test('authored module and target inputs are covered by the actual fingerprint configuration', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const loaded = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import {loadConfig} from '@hot-updater/cli-tools';
    console.log(JSON.stringify((await loadConfig(null)).fingerprint));
  `,
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        APP_VARIANT: 'development',
        WW_OTA_DEPLOY: '0',
        EXPO_PUBLIC_HOT_UPDATER_API_KEY: 'fingerprint-test',
        POSTHOG_DISABLE_UPLOAD: 'true',
      },
      encoding: 'utf8',
    }
  )
  assert.equal(loaded.status, 0, loaded.stderr)
  const config = JSON.parse(loaded.stdout.trim().split('\n').at(-1))
  const sdkDir = path.dirname(fileURLToPath(import.meta.resolve('hot-updater')))
  const sdk = fs.readFileSync(
    path.join(
      sdkDir,
      fs.readdirSync(sdkDir).find((file) => /^fingerprint-.*\.mjs$/.test(file))
    ),
    'utf8'
  )
  const extensions = sdk
    .match(/\.\.\.allowExtensions\(\[([\s\S]*?)\]\)/)[1]
    .match(/"[^"]+"/g)
    .map((value) => `!**/${JSON.parse(value)}`)
  const patterns = [
    ...DEFAULT_IGNORE_PATHS,
    '**/*',
    ...extensions,
    'android/**/*',
    'ios/**/*',
    ...config.ignorePaths,
  ]
  const extra = buildPathMatchObjects(config.extraSources.android)
  const trackedResult = spawnSync('git', ['ls-files', 'modules', 'targets'], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(trackedResult.status, 0, trackedResult.stderr)
  const tracked = trackedResult.stdout.trim().split('\n')
  assert.ok(tracked.length > 50, 'Native input inventory must not be empty')
  const uncovered = tracked.filter((file) => {
    if (
      file.startsWith('targets/wear-os/') ||
      file.startsWith('targets/widgets/Assets.xcassets/') ||
      file.startsWith('targets/watch/Assets.xcassets/') ||
      file.includes('/src/test/') ||
      /\.(md|tsx?|js)$/.test(file) ||
      file.endsWith('/tsconfig.json')
    )
      return false
    return (
      isIgnoredPath(file, patterns) &&
      !extra.some((pattern) => pattern.match(file))
    )
  })
  assert.deepEqual(uncovered, [])
  assert.equal(
    isIgnoredPath('modules/watch-bridge/android/build/generated.h', patterns),
    true
  )
  assert.equal(
    isIgnoredPath(
      'node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/common/build/ReactBuildConfig.kt',
      patterns
    ),
    false
  )
})

test('Expo signing validates the selected trust anchor and still refuses a mismatched signer', async () => {
  const sdkDir = path.dirname(fileURLToPath(import.meta.resolve('hot-updater')))
  const source = fs.readFileSync(path.join(sdkDir, 'index.mjs'), 'utf8')
  const section = source
    .split('//#region src/utils/signing/validateSigningConfig.ts')[1]
    .split('//#endregion')[0]
  const key = () =>
    crypto
      .generateKeyPairSync('rsa', { modulusLength: 2048 })
      .publicKey.export({ type: 'spki', format: 'pem' })
  const oldKey = key(),
    selectedKey = key()
  class GeneratedProject {
    async exists() {
      return true
    }
    async get() {
      return { value: oldKey, paths: ['previous-variant'] }
    }
  }

  const validate = vm.runInNewContext(section + '\nvalidateSigningConfig', {
    crypto,
    IosConfigParser: GeneratedProject,
    AndroidConfigParser: GeneratedProject,
  })
  const config = { signing: {}, platform: { ios: {}, android: {} } }
  assert.equal(
    (
      await validate(config, {
        platform: 'android',
        expectedPublicKey: selectedKey,
        nativePublicKey: selectedKey,
      })
    ).isValid,
    true
  )
  for (const options of [
    { nativePublicKey: oldKey },
    {},
    { nativePublicKey: null },
  ]) {
    const result = await validate(config, {
      platform: 'android',
      expectedPublicKey: selectedKey,
      ...options,
    })
    assert.equal(result.isValid, false)
    assert.equal(
      result.issues[0].code,
      options.nativePublicKey === null
        ? 'MISSING_PUBLIC_KEY'
        : 'PUBLIC_KEY_MISMATCH'
    )
  }
})

test('each platform deploys only into the selected environment', () => {
  const urls = new Set()
  const databases = new Set()
  const buckets = new Set()
  for (const variant of ['development', 'beta', 'production']) {
    for (const platform of ['ios', 'android']) {
      const plan = deploymentPlan(variant, platform, ['--dry-run'], {})
      assert.equal(plan.variant, variant)
      assert.equal(plan.platform, platform)
      assert.equal(plan.channel, variant === 'development' ? 'dev' : variant)
      urls.add(plan.baseURL)
      databases.add(plan.databaseId)
      buckets.add(plan.bucketName)
    }
  }
  assert.equal(urls.size, 3)
  assert.equal(databases.size, 3)
  assert.equal(buckets.size, 3)
})

test('production publishing requires the keyword for exactly this app version', () => {
  for (const value of [undefined, 'go ahead', 'SHIP-PROD-0.0.0'])
    assert.throws(
      () =>
        deploymentPlan('production', 'ios', [], { WW_RELEASE_CONFIRM: value }),
      /go-ahead/
    )
  assert.equal(
    deploymentPlan('production', 'android', [], {
      WW_RELEASE_CONFIRM: `SHIP-PROD-${version}`,
    }).channel,
    'production'
  )
})

test('channel and compatibility overrides cannot bypass the environment plan', () => {
  for (const args of [
    ['--channel', 'production'],
    ['--platform', 'android'],
    ['--force'],
    ['--message'],
  ])
    assert.throws(
      () => deploymentPlan('beta', 'ios', args, {}),
      /Unknown OTA argument/
    )
  assert.throws(() => deploymentPlan('preview', 'ios', [], {}), /Usage/)
})

test('the production signing key is read through the 1Password app, never the service account', () => {
  const inherited = { OP_SERVICE_ACCOUNT_TOKEN: 'ops_token', PATH: '/bin' }
  const production = signingKeyRead('production', inherited)
  assert.equal(production.env.OP_SERVICE_ACCOUNT_TOKEN, undefined)
  assert.equal(production.env.PATH, '/bin')
  assert.ok(!production.args.includes('--vault'))
  assert.equal(production.args[2], signingKeyItem('production'))
  assert.equal(inherited.OP_SERVICE_ACCOUNT_TOKEN, 'ops_token')
  for (const channel of ['beta', 'dev']) {
    const read = signingKeyRead(channel, inherited)
    assert.equal(read.env.OP_SERVICE_ACCOUNT_TOKEN, 'ops_token')
    assert.deepEqual(read.args.slice(3, 5), ['--vault', 'Agents'])
  }
})

test('publishing never reads a signing key kept on disk', () => {
  const script = fs.readFileSync(new URL('../ota.mjs', import.meta.url), 'utf8')
  assert.ok(!script.includes('.env.hotupdater-keys'))
})

test('publishing does not inject OTA fingerprints into existing native projects', () => {
  const script = fs.readFileSync(new URL('../ota.mjs', import.meta.url), 'utf8')
  assert.ok(script.includes('scripts/ota-fingerprint.mjs'))
  assert.ok(!script.includes("['fingerprint', 'create']"))
  const ignores = fs
    .readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8')
    .split('\n')
  assert.ok(ignores.includes('.hot-updater/output'))
  assert.ok(ignores.includes('.hot-updater/log'))
})

test('source map uploads pair shipped bytecode with composed mappings and its Expo debug ID', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-ota-maps-'))
  try {
    const input = path.join(temporary, 'index.android.bundle')
    fs.writeFileSync(`${input}.hbc`, 'shipped bytecode')
    fs.writeFileSync(
      `${input}.map`,
      JSON.stringify({ debugId: 'expo-debug-id', mappings: 'intermediate' })
    )
    fs.writeFileSync(
      `${input}.hbc.map`,
      JSON.stringify({
        mappings: 'composed',
        x_hermes_function_offsets: [0, 1],
      })
    )
    const output = path.join(temporary, 'upload')
    prepareHermesMaps(temporary, output, 'android')
    const map = JSON.parse(
      fs.readFileSync(path.join(output, 'index.android.bundle.map'))
    )
    assert.equal(map.debugId, 'expo-debug-id')
    assert.equal(map.mappings, 'composed')
    assert.equal(
      fs.readFileSync(path.join(output, 'index.android.bundle'), 'utf8'),
      'shipped bytecode'
    )
    assert.deepEqual(fs.readdirSync(output).sort(), [
      'index.android.bundle',
      'index.android.bundle.map',
    ])
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
})
