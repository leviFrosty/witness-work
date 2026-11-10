import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import fs from 'node:fs'
import zlib from 'node:zlib'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import {
  MAX_FILES,
  WEB_EXCLUDED_KEYS,
  buildSteps,
  checkExport,
  checkServiceWorker,
  environments,
  fillRevenueCatWeb,
  filesContaining,
  loadWebEnv,
  readOnePasswordFields,
  revenueCatWebProblems,
  oversizedFiles,
  precompressExport,
  restoringFiles,
  runBuildSteps,
  splashLabelScript,
  splashLabels,
  unservedReferences,
  writeSplashLabels,
} from '../web.mjs'
import { onDemandRevision, precachePatterns } from '../web-sw.mjs'

const directories = []
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-web-env-test-'))
  directories.push(root)
  return root
}
const write = (root, name, contents) => {
  fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
  fs.writeFileSync(path.join(root, name), contents)
}
afterEach(() =>
  directories
    .splice(0)
    .forEach((root) => fs.rmSync(root, { recursive: true, force: true }))
)

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
        ...secrets.slice(1),
        'EXPO_PUBLIC_API_BASE_URL=https://ww-proxy.example',
        `POSTHOG_PROJECT_TOKEN=phc_${variant}`,
      ].join('\n')
    )
  return root
}

test("every web profile keeps RevenueCat Billing's key and purchase links", () => {
  const root = nativeEnvFiles()
  const links = '{"Monthly $3.99":"sandbox/abc123"}'
  for (const file of ['.env', '.env.beta', '.env.production'])
    fs.appendFileSync(
      path.join(root, file),
      `\nEXPO_PUBLIC_REVENUECAT_WEB_API_KEY=rcb_test_key\nEXPO_PUBLIC_REVENUECAT_WEB_PURCHASE_LINKS='${links}'\n`
    )
  for (const profile of ['local', 'dev', 'beta', 'production']) {
    const { env, excluded } = loadWebEnv(root, profile, {
      PATH: process.env.PATH,
    })
    assert.equal(env.EXPO_PUBLIC_REVENUECAT_WEB_API_KEY, 'rcb_test_key')
    assert.equal(env.EXPO_PUBLIC_REVENUECAT_WEB_PURCHASE_LINKS, links)

    assert.ok(!excluded.includes('rcb_test_key'))
  }
})

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
    assert.match(
      profile.verifyOrigin,
      /^https:\/\/verify(-dev)?\.witnesswork\.app$/
    )
    assert.ok(['report-only', 'enforce'].includes(profile.csp), name)
    assert.equal(new URL(profile.apiOrigin).origin, profile.apiOrigin)
    assert.equal(Boolean(profile.worker), name !== 'local', name)
  }

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

  for (const name of ['beta', 'production'])
    assert.equal(
      environments[name].helpSearchOrigin,
      'https://help-search.witnesswork.app'
    )
  for (const name of ['local', 'dev'])
    assert.equal(
      environments[name].helpSearchOrigin,
      'https://help-search-dev.witnesswork.app'
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

  fs.renameSync(big, `${big}.map`)
  checkExport(root, [])
  assert.equal(MAX_FILES, 20_000)
  checkExport(root, [], { maxFiles: 2 })
  write(root, '_expo/other.js', '')
  assert.throws(() => checkExport(root, [], { maxFiles: 2 }), /allows 2$/)
})

test('the export check finds files the export loads but the host would not serve', () => {
  const root = fixture()
  const font =
    'assets/node_modules/@expo-google-fonts/inter/Inter_400Regular.079af0e2936ccb99b391ddc0bbb73dcb.ttf'
  const chunk = '_expo/static/js/web/es-4f2b3c1d0e9a8b7c6d5e4f3a2b1c0d9e.js'
  write(
    root,
    'index.html',
    '<script src="/_expo/static/js/web/index.js"></script>'
  )
  write(
    root,
    '_expo/static/js/web/index.js',
    `a={uri:"/${font}"};b={"7":"/${chunk}"};c="/assets/icon.png?platform=web";d="/_expo/static/js/web/"`
  )
  write(root, font, 'ttf')
  write(root, chunk, '')
  write(root, 'assets/icon.png', 'png')
  write(root, 'style.css', 'a{background:url(/assets/icon.png)}')
  assert.deepEqual(unservedReferences(root), [])
  checkExport(root, [])

  fs.rmSync(path.join(root, font))
  write(root, `${chunk}.map`, '{}')
  fs.rmSync(path.join(root, chunk))
  write(root, 'other.css', 'a{background:url(/assets/gone.png)}')
  assert.deepEqual(unservedReferences(root), [
    `/${chunk}`,
    '/assets/gone.png',
    `/${font}`,
  ])
  assert.throws(() => checkExport(root, []), /wouldn't serve: \/_expo/)

  write(root, font, 'ttf')
  write(root, chunk, '')
  fs.rmSync(path.join(root, 'other.css'))
  write(root, 'other.js', `"/${font.replace('@', '%40')}"`)
  assert.deepEqual(unservedReferences(root), [])
})

test('an export whose service worker misses the shell, an entry chunk or an asset is refused', () => {
  const root = fixture()
  const entry = '_expo/static/js/web/index-1a2b.js'
  const font = 'assets/node_modules/@expo-google-fonts/inter/Inter.0f.ttf'
  write(root, 'index.html', `<script src="/${entry}" defer></script>`)
  write(root, entry, '')
  write(root, font, 'ttf')
  assert.throws(() => checkServiceWorker(root), /has no sw\.js/)
  write(root, 'sw.js', `[{"url":"/index.html"},{"url":"/${entry}"}]`)

  assert.throws(() => checkServiceWorker(root), /precache.*google-fonts/)
  write(
    root,
    'sw.js',
    `[{"url":"/index.html"},{"url":"/${entry}"},{"url":"/${font}"}]`
  )
  checkServiceWorker(root)

  write(root, `${font}.br`, 'br')
  checkServiceWorker(root)
  write(root, 'sw.js', `[{"url":"/${entry}"},{"url":"/${font}"}]`)
  assert.throws(() => checkServiceWorker(root), /precache \/index\.html/)
})

test('the worker precaches English and the on-demand chunks, not the other languages or the session replay recorder', () => {
  const root = fixture()
  const hash = (n) => String(n).repeat(32).slice(0, 32)
  const dir = '_expo/static/js/web'
  const entry = `${dir}/index-${hash(1)}.js`
  write(root, 'index.html', `<script src="/${entry}" defer></script>`)
  for (const name of [
    `index-${hash(1)}`,
    `index-${hash(2)}`,
    `sql-wasm-browser-${hash(3)}`,
    `en-US-${hash(4)}`,
    `de-DE-${hash(5)}`,
    `bem-ZM-${hash(6)}`,
    `ar-${hash(7)}`,
    `module.full.no-external-${hash(8)}`,
  ])
    write(root, `${dir}/${name}.js`, '')
  const chunks = precachePatterns(root)
    .filter((pattern) => pattern.startsWith(dir))
    .map((pattern) => path.basename(pattern).replace(/-[0-9a-f]{32}/, ''))
  assert.deepEqual([...new Set(chunks)].sort(), [
    'en-US.js',
    'index.js',
    'sql-wasm-browser.js',
  ])
})

test('the worker leaves the wasm files to download on demand, kept under their revision', () => {
  const root = fixture()
  write(root, 'index.html', '')
  write(root, '_expo/static/js/web/index.js', '')
  write(root, 'canvaskit.wasm', '\0asm')
  assert.ok(!precachePatterns(root).some((pattern) => pattern.includes('wasm')))
  const revision = onDemandRevision(root)
  assert.match(revision, /^[0-9a-f]{16}$/)
  assert.equal(onDemandRevision(root), revision)
  write(root, 'canvaskit.wasm', '\0asm, another build')
  assert.notEqual(onDemandRevision(root), revision)
})

test('the export precompresses what the Worker serves as brotli', async () => {
  const root = fixture()
  const script = 'console.log("WitnessWork");\n'.repeat(200)
  write(root, '_expo/static/js/web/index-1.js', script)
  write(root, 'canvaskit.wasm', Buffer.alloc(4096))
  write(root, 'tiny.js', 'x')
  write(root, 'index.html', script)
  write(root, '_expo/static/js/web/index-1.js.map', script)
  write(root, '.well-known/assetlinks.json', script)
  const totals = await precompressExport(root, { quality: 5 })
  assert.equal(totals.files, 2)
  assert.ok(totals.compressed < totals.bytes)
  assert.equal(
    zlib
      .brotliDecompressSync(
        fs.readFileSync(path.join(root, '_expo/static/js/web/index-1.js.br'))
      )
      .toString(),
    script
  )
  assert.ok(fs.existsSync(path.join(root, 'canvaskit.wasm.br')))
  for (const skipped of [
    'tiny.js.br',
    'index.html.br',
    '_expo/static/js/web/index-1.js.map.br',
    '.well-known/assetlinks.json.br',
  ])
    assert.ok(!fs.existsSync(path.join(root, skipped)), skipped)
})

function splashBarAfter(script, languages, { bar = true } = {}) {
  const attributes = {}
  vm.runInNewContext(script, {
    navigator: { languages, language: languages[0] },
    document: {
      getElementById: (id) =>
        bar && id === 'launch-splash-progress'
          ? { setAttribute: (name, value) => (attributes[name] = value) }
          : null,
    },
  })
  return attributes
}

test('the splash script names the progress bar in every translated language', () => {
  const root = fixture()
  write(root, 'src/locales/en-US.json', '{"common_loading":"Loading"}')
  write(root, 'src/locales/pt-BR.json', '{"common_loading":"Carregando"}')
  write(root, 'src/locales/pt-PT.json', '{"common_loading":"A carregar"}')
  write(root, 'src/locales/zh-CN.json', '{"common_loading":"正在加载"}')
  write(root, 'src/locales/zh-TW.json', '{"common_loading":"載入中"}')
  write(root, 'src/locales/ar.json', '{"common_loading":"جارٍ التحميل"}')
  write(root, 'src/locales/de-DE.json', '{"other":"Anderes"}')
  const script = fs.readFileSync(writeSplashLabels(root), 'utf8')
  assert.equal(
    path.relative(root, writeSplashLabels(root)),
    'public/launch-splash.js'
  )
  for (const [languages, locale, label] of [
    [['en-GB', 'pt-BR'], 'en-US', 'Loading'],
    [['pt'], 'pt-BR', 'Carregando'],
    [['pt-PT'], 'pt-PT', 'A carregar'],
    [['zh-HK'], 'zh-TW', '載入中'],
    [['zh-Hant-CN'], 'zh-TW', '載入中'],
    [['zh-Hans-TW'], 'zh-CN', '正在加载'],
    [['zh'], 'zh-CN', '正在加载'],
    [['ar-EG'], 'ar', 'جارٍ التحميل'],
  ])
    assert.deepEqual(
      splashBarAfter(script, languages),
      { 'aria-label': label, lang: locale },
      languages[0]
    )
  for (const languages of [['de-DE'], ['xx'], []])
    assert.deepEqual(splashBarAfter(script, languages), {}, languages[0])
  assert.deepEqual(splashBarAfter(script, ['pt-BR'], { bar: false }), {})
})

test('the splash script carries the app’s own Loading string, and a build needs the English one', () => {
  const project = new URL('../../', import.meta.url).pathname
  const labels = splashLabels(project)
  for (const file of fs.readdirSync(path.join(project, 'src/locales')))
    assert.equal(
      labels[path.basename(file, '.json')],
      JSON.parse(
        fs.readFileSync(path.join(project, 'src/locales', file), 'utf8')
      ).common_loading,
      file
    )
  assert.equal(
    splashBarAfter(splashLabelScript(labels), ['ja-JP'])['aria-label'],
    labels['ja-JP']
  )
  const root = fixture()
  write(root, 'src/locales/fr-FR.json', '{"common_loading":"Chargement"}')
  assert.throws(
    () => writeSplashLabels(root),
    /en-US\.json has no common_loading/
  )
})

const KEY = 'EXPO_PUBLIC_REVENUECAT_WEB_API_KEY'
const LINKS = 'EXPO_PUBLIC_REVENUECAT_WEB_PURCHASE_LINKS'
const sandboxKey = 'rcb_sb_testkey123'
const sandboxLinks = '{"Monthly $3.99":"sandbox/abc123"}'
const item = environments.dev.revenueCatWebItem

function fakeOp(vault, calls = []) {
  const op = (name, labels) => {
    calls.push({ name, labels })
    return Object.fromEntries(labels.map((label) => [label, vault[label]]))
  }
  return Object.assign(op, { calls })
}
const noOp = () => assert.fail('op must not be called')
const vault = { [KEY]: sandboxKey, [LINKS]: sandboxLinks }

test('only the dev profile names a 1Password item for its sandbox values', () => {
  assert.equal(item, 'RevenueCat web billing sandbox (Dev project)')
  for (const name of ['local', 'beta', 'production'])
    assert.equal(environments[name].revenueCatWebItem, undefined, name)
})

test('RevenueCat values in the env files are used, and 1Password is not asked', () => {
  const env = { [KEY]: sandboxKey, [LINKS]: sandboxLinks }
  const result = fillRevenueCatWeb(env, 'dev', { op: noOp })
  assert.deepEqual(result.problems, [])
  assert.deepEqual(result.fromOnePassword, [])
  assert.equal(env[KEY], sandboxKey)
  assert.equal(env[LINKS], sandboxLinks)
})

test('dev reads what the env files lack from the 1Password item', () => {
  const env = { [KEY]: '', [LINKS]: undefined }
  const op = fakeOp(vault)
  const result = fillRevenueCatWeb(env, 'dev', { op })
  assert.deepEqual(op.calls, [{ name: item, labels: [KEY, LINKS] }])
  assert.deepEqual(result.fromOnePassword, [KEY, LINKS])
  assert.deepEqual(result.problems, [])
  assert.equal(env[KEY], sandboxKey)
  assert.equal(env[LINKS], sandboxLinks)
})

test('dev asks 1Password only for the value the env files lack', () => {
  const env = { [KEY]: sandboxKey, [LINKS]: '  ' }
  const op = fakeOp(vault)
  const result = fillRevenueCatWeb(env, 'dev', { op })
  assert.deepEqual(op.calls, [{ name: item, labels: [LINKS] }])
  assert.deepEqual(result.fromOnePassword, [LINKS])
  assert.equal(env[LINKS], sandboxLinks)
})

test('local, beta and production never call op', () => {
  for (const profile of ['local', 'beta', 'production']) {
    const env = {}
    const result = fillRevenueCatWeb(env, profile, { op: noOp })
    assert.deepEqual(result.fromOnePassword, [], profile)
    assert.equal(env[KEY], undefined, profile)
  }

  const live = { [KEY]: 'rcb_live', [LINKS]: '{"A":"live/x"}' }
  assert.deepEqual(
    fillRevenueCatWeb({ ...live }, 'production', { op: noOp }).problems,
    []
  )
  assert.deepEqual(
    fillRevenueCatWeb({ ...live }, 'beta', { op: noOp }).problems,
    []
  )
})

test('without the values, dev reports what to set, whether op failed or lacks them', () => {
  const failing = () => {
    throw new Error('op exited with 1')
  }
  const failed = fillRevenueCatWeb({}, 'dev', { op: failing })
  assert.equal(failed.problems.length, 1)
  assert.match(failed.problems[0], new RegExp(KEY))
  assert.match(failed.problems[0], new RegExp(LINKS))
  assert.match(
    failed.problems[0],
    /RevenueCat web billing sandbox \(Dev project\)/
  )
  assert.match(failed.problems[0], /op exited with 1/)

  const empty = fillRevenueCatWeb({}, 'dev', {
    op: fakeOp({ [KEY]: sandboxKey, [LINKS]: '' }),
  })
  assert.equal(empty.problems.length, 1)
  assert.match(empty.problems[0], new RegExp(LINKS))

  const local = fillRevenueCatWeb({}, 'local', { op: noOp })
  assert.equal(local.problems.length, 1)
  assert.match(local.problems[0], new RegExp(KEY))
})

test('a key that is not a sandbox key, or links that are not sandbox links, are refused', () => {
  const problems = (key, links) =>
    revenueCatWebProblems({ [KEY]: key, [LINKS]: links })
  assert.deepEqual(problems(sandboxKey, sandboxLinks), [])
  assert.match(problems('rcb_live123', sandboxLinks)[0], /rcb_sb_/)
  assert.match(problems('appl_abc', sandboxLinks)[0], /rcb_sb_/)
  assert.match(problems(sandboxKey, '{not json')[0], /JSON/)
  assert.match(problems(sandboxKey, '[]')[0], /JSON object/)
  assert.match(problems(sandboxKey, '{}')[0], /sandbox\//)
  assert.match(problems(sandboxKey, '{"A":"live/x","B":3}')[0], /sandbox\//)

  assert.deepEqual(problems(sandboxKey, '{"A":"live/x","B":"sandbox/y"}'), [])

  const env = { [KEY]: 'rcb_live123', [LINKS]: sandboxLinks }
  const result = fillRevenueCatWeb(env, 'dev', { op: noOp })
  assert.match(result.problems[0], /rcb_sb_/)

  for (const message of [
    ...problems('rcb_live123', sandboxLinks),
    ...problems(sandboxKey, '{"Secret Plan":"live/zzz"}'),
  ]) {
    assert.ok(!message.includes('rcb_live123'))
    assert.ok(!message.includes('zzz'))
  }
})

test('op is asked for the item by title, in the Agents vault, as JSON', () => {
  const calls = []
  const spawn = (command, args, options) => {
    calls.push({ command, args, options })
    const label = args.find((arg) => arg.startsWith('label='))?.slice(6)
    return {
      status: 0,
      stdout: JSON.stringify({ label, value: `value of ${label}, "quoted"` }),
    }
  }
  const values = readOnePasswordFields(item, [KEY, LINKS], {
    spawn,
    inherited: { OP_SERVICE_ACCOUNT_TOKEN: 'token' },
  })
  assert.deepEqual(values, {
    [KEY]: `value of ${KEY}, "quoted"`,
    [LINKS]: `value of ${LINKS}, "quoted"`,
  })
  assert.equal(calls.length, 2)
  for (const { command, args, options } of calls) {
    assert.equal(command, 'op')
    assert.deepEqual(args.slice(0, 3), ['item', 'get', item])
    assert.ok(args.includes('--reveal'))
    assert.equal(args[args.indexOf('--vault') + 1], 'Agents')
    assert.equal(args[args.indexOf('--format') + 1], 'json')
    assert.equal(options.env.OP_SERVICE_ACCOUNT_TOKEN, 'token')

    assert.notEqual(options.stdio[2], 'inherit')
  }
})

test('a failed or missing op fails without printing what it answered', () => {
  const failing =
    (status, stdout = '', stderr = '') =>
    () => ({
      status,
      stdout,
      stderr,
    })
  assert.throws(
    () => readOnePasswordFields(item, [KEY], { spawn: failing(1, '', 'nope') }),
    /op exited with 1/
  )
  assert.throws(
    () =>
      readOnePasswordFields(item, [KEY], {
        spawn: () => ({
          error: Object.assign(new Error('x'), { code: 'ENOENT' }),
        }),
      }),
    /op isn't installed/
  )
  assert.throws(
    () =>
      readOnePasswordFields(item, [KEY], {
        spawn: failing(0, 'secret-not-json-value'),
      }),
    (error) => !error.message.includes('secret-not-json-value')
  )
})
