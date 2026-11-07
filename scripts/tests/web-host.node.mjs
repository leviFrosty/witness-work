import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import util from 'node:util'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { unstable_readConfig } from 'wrangler'
import {
  HOLDING_PAGE,
  INTEGRATION_BRANCH,
  PRODUCTION_TOKEN_ITEM,
  STAMP,
  WELL_KNOWN_CONFIG,
  WELL_KNOWN_DIR,
  WRANGLER_CONFIG,
  checkStamp,
  deployPlan,
  missingOrigins,
  deployTokenRead,
  prepareAssets,
  profiles,
  servesApp,
  wellKnownBundle,
  wranglerEnv,
  writeStamp,
  writeWellKnownBundle,
} from '../web-host.mjs'
import {
  AASA,
  ASSET_LINKS,
  associationFiles,
  checkAssociationFiles,
  environments,
  listFiles,
  writeAssociationFiles,
} from '../web.mjs'
import { HOLDING_CSP, headersFile } from '../../web/host/src/headers.ts'

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
const plan = (
  target,
  args = ['--dry-run'],
  env = {},
  git = integration,
  revenueCatProblems = []
) => deployPlan(target, args, { env, git, revenueCatProblems })

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

test('every environment serves the app on the link routes "Continue on the web" opens', () => {
  const glob = (pattern) =>
    new RegExp(
      `^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`
    )
  for (const target of [undefined, 'dev', 'beta', 'production']) {
    const config = unstable_readConfig({
      config: path.join(root, WRANGLER_CONFIG),
      env: target,
    })
    assert.equal(config.assets.not_found_handling, 'single-page-application')
    for (const route of ['/contacts', '/c', '/buddies/invite', '/b'])
      for (const pattern of config.assets.run_worker_first)
        assert.equal(glob(pattern).test(route), false, `${pattern} ${route}`)
  }
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

const PLAY_SIGNING =
  '4C:13:98:34:37:2C:85:5A:6E:A6:19:CF:AF:03:D4:6B:91:14:14:2D:EB:CB:CB:CB:F1:C1:C7:40:55:3E:1C:AC'
const UPLOAD =
  'C5:1E:FF:DC:9B:BF:6B:C0:2B:7B:4C:31:92:90:0B:AC:42:67:BD:6E:05:F4:CF:C5:21:77:E5:36:23:A4:75:EB'

const DEBUG =
  'FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C'
const loginCreds = (packageName, fingerprints) => ({
  relation: ['delegate_permission/common.get_login_creds'],
  target: {
    namespace: 'android_app',
    package_name: packageName,
    sha256_cert_fingerprints: fingerprints,
  },
})
const RELEASE_AASA = {
  webcredentials: {
    apps: [
      'Y3KE7B7AHJ.com.leviwilkerson.jwtime',
      'Y3KE7B7AHJ.com.leviwilkerson.jwtimebeta',
    ],
  },
}
const RELEASE_ASSET_LINKS = [
  loginCreds('com.leviwilkerson.jwtime', [PLAY_SIGNING, UPLOAD]),
]

const developmentLeaks = (dir) =>
  listFiles(dir).filter((file) => {
    const text = fs.readFileSync(path.join(dir, file), 'utf8')
    return text.includes('jwtimedev') || text.includes(DEBUG)
  })

test('production and beta builds never carry the development app or the debug key', () => {
  for (const target of ['production', 'beta']) {
    const { dir } = exportFixture()

    fs.mkdirSync(path.join(dir, '.well-known'))
    fs.writeFileSync(
      path.join(dir, ASSET_LINKS),
      JSON.stringify([loginCreds('com.leviwilkerson.jwtimedev', [DEBUG])])
    )
    writeAssociationFiles(dir, target)
    assert.deepEqual(developmentLeaks(dir), [], target)
    const holding = fixture()
    writeWellKnownBundle(holding, target)
    assert.deepEqual(developmentLeaks(holding), [], target)
  }
  const { dir } = exportFixture()
  writeAssociationFiles(dir, 'dev')
  assert.deepEqual(developmentLeaks(dir), [AASA, ASSET_LINKS])
})

test('each profile’s association files are valid JSON listing exactly its apps', () => {
  for (const target of ['production', 'beta']) {
    const files = associationFiles(target)
    assert.deepEqual(Object.keys(files), [AASA, ASSET_LINKS])
    assert.deepEqual(JSON.parse(files[AASA]), RELEASE_AASA, target)
    assert.deepEqual(JSON.parse(files[ASSET_LINKS]), RELEASE_ASSET_LINKS)
  }
  for (const target of ['dev', 'local']) {
    const files = associationFiles(target)
    assert.deepEqual(JSON.parse(files[AASA]), {
      webcredentials: {
        apps: [
          ...RELEASE_AASA.webcredentials.apps,
          'Y3KE7B7AHJ.com.leviwilkerson.jwtimedev',
        ],
      },
    })
    assert.deepEqual(JSON.parse(files[ASSET_LINKS]), [
      ...RELEASE_ASSET_LINKS,
      loginCreds('com.leviwilkerson.jwtimedev', [DEBUG, PLAY_SIGNING, UPLOAD]),
    ])
  }
})

test('a release profile refuses to list the development app', () => {
  const apps = profiles.production.associatedApps
  profiles.production.associatedApps = [...apps, 'development']
  try {
    assert.throws(
      () => associationFiles('production'),
      /would list the development app.*jwtimedev.*FA:C6:17/
    )
  } finally {
    profiles.production.associatedApps = apps
  }
})

test('a deploy refuses an export without exactly its profile’s association files', () => {
  const { dir, write } = exportFixture()
  assert.throws(() => checkAssociationFiles(dir, 'production'), /apple-app/)
  writeAssociationFiles(dir, 'dev')
  assert.throws(
    () => checkAssociationFiles(dir, 'production'),
    /production association files/
  )
  writeAssociationFiles(dir, 'production')
  checkAssociationFiles(dir, 'production')
  write('.well-known/webauthn', '{}')
  assert.throws(() => checkAssociationFiles(dir, 'production'), /webauthn/)
})

test('the holding bundle’s association files are byte-identical to the full build’s', () => {
  for (const target of ['dev', 'beta', 'production']) {
    const { dir: full } = exportFixture()
    writeAssociationFiles(full, target)
    const holding = fixture()
    writeWellKnownBundle(holding, target)
    for (const file of [AASA, ASSET_LINKS])
      assert.ok(
        fs
          .readFileSync(path.join(holding, file))
          .equals(fs.readFileSync(path.join(full, file))),
        `${target} ${file}`
      )
    assert.deepEqual(listFiles(holding), [
      '.well-known/apple-app-site-association',
      '.well-known/assetlinks.json',
      '_headers',
      'index.html',
    ])
  }
})

test('the holding page loads nothing, and its headers allow nothing', () => {
  assert.doesNotMatch(HOLDING_PAGE, /<(script|style|link|img|iframe|form)\b/i)
  assert.doesNotMatch(HOLDING_PAGE, /\s(src|style|on\w+)=/i)
  assert.deepEqual(
    [...HOLDING_PAGE.matchAll(/href="([^"]+)"/g)].map(
      ([, href]) => new URL(href).origin
    ),
    ['https://apps.apple.com', 'https://play.google.com']
  )
  for (const target of ['dev', 'beta', 'production']) {
    const headers = wellKnownBundle(target)._headers
    assert.match(headers, new RegExp(`Content-Security-Policy: ${HOLDING_CSP}`))
    assert.doesNotMatch(headers, /Report-Only|'self'|camera=\(self\)/)
    for (const name of [
      'Strict-Transport-Security',
      'X-Content-Type-Options: nosniff',
      'X-Frame-Options: DENY',
    ])
      assert.match(headers, new RegExp(name))
  }
  assert.match(HOLDING_CSP, /^default-src 'none'/)
})

test('--well-known-only needs no release tag, but a clean, landed commit and the keyword', () => {
  const landed = { ...integration, head: 'b'.repeat(40), onIntegration: true }
  const onMain = { ...landed, onIntegration: false, onMain: true }
  const args = ['--well-known-only', '--dry-run']
  assert.throws(() => plan('production', args, {}, landed), /go-ahead/)
  for (const target of ['beta', 'production']) {
    for (const git of [landed, onMain]) {
      const result = plan(target, args, keyword, git)
      assert.deepEqual(result.blocked, [], target)
      assert.equal(result.host, profiles[target].host)
      assert.deepEqual(result.command.slice(1, 6), [
        'deploy',
        '--config',
        WELL_KNOWN_CONFIG,
        '--env',
        target,
      ])
      assert.deepEqual(
        result.uploads.map(({ file }) => file),
        ['_headers', AASA, ASSET_LINKS, 'index.html']
      )
    }
    const unlanded = plan(target, args, keyword, {
      ...landed,
      onIntegration: false,
    })
    assert.match(unlanded.blocked.join('\n'), /must have landed/)
    const dirty = plan(target, args, keyword, { ...landed, clean: false })
    assert.match(dirty.blocked.join('\n'), /Commit all changes/)
  }

  assert.match(
    plan('dev', args, {}, landed).blocked.join('\n'),
    new RegExp(INTEGRATION_BRANCH)
  )
  assert.deepEqual(
    plan('dev', args, {}, { ...integration, onIntegration: true }).blocked,
    []
  )
  for (const extra of ['--prebuilt', '--preview'])
    assert.throws(
      () => plan('dev', ['--well-known-only', extra]),
      /builds its own bundle/
    )
  assert.throws(() => plan('dev', ['--replace-app']), /goes with/)
  assert.equal(
    plan('dev', [...args, '--replace-app'], {}, integration).replaceApp,
    true
  )
})

test('--well-known-only refuses to replace a web app the host already serves', () => {
  assert.equal(servesApp(undefined), false)
  assert.equal(servesApp({ status: 404, body: 'Not found\n' }), false)
  assert.equal(servesApp({ status: 522, body: '' }), false)
  assert.equal(servesApp({ status: 200, body: HOLDING_PAGE }), false)
  assert.equal(
    servesApp({ status: 200, body: '<!doctype html><div id="root">' }),
    true
  )
})

test('the well-known-only Workers are the app’s, and 404 anything without a file', () => {
  for (const target of [undefined, 'dev', 'beta', 'production']) {
    const read = (config) =>
      unstable_readConfig({ config: path.join(root, config), env: target })
    const app = read(WRANGLER_CONFIG)
    const holding = read(WELL_KNOWN_CONFIG)

    const differing = [
      ...new Set([...Object.keys(app), ...Object.keys(holding)]),
    ].filter((key) => !util.isDeepStrictEqual(app[key], holding[key]))
    assert.deepEqual(
      differing.sort(),
      ['assets', 'configPath', 'userConfigPath'],
      target
    )
    assert.equal(holding.assets.binding, app.assets.binding)
    assert.equal(
      path.resolve(root, 'web/host', holding.assets.directory),
      path.join(root, WELL_KNOWN_DIR)
    )
    assert.equal(holding.assets.not_found_handling, 'none')
    assert.deepEqual(holding.assets.run_worker_first, ['/.well-known/*'])
  }
})

test('a dev deploy refuses without usable RevenueCat sandbox values', () => {
  const problems = ['no key: set EXPO_PUBLIC_REVENUECAT_WEB_API_KEY']
  assert.deepEqual(plan('dev').blocked, [])
  assert.deepEqual(
    plan('dev', ['--dry-run'], {}, integration, problems).blocked,
    problems
  )

  assert.deepEqual(
    plan('dev', ['--preview'], {}, integration, problems).blocked,
    problems
  )

  assert.ok(
    !plan(
      'dev',
      ['--well-known-only'],
      {},
      { ...integration, onIntegration: true },
      problems
    ).blocked.includes(problems[0])
  )
  assert.deepEqual(
    plan('beta', ['--dry-run'], {}, integration, problems).blocked,
    []
  )
  assert.deepEqual(
    plan('production', ['--dry-run'], keyword, release, problems).blocked,
    []
  )
})
