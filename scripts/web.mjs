import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { promisify } from 'node:util'
import zlib from 'node:zlib'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { loadLocalEnv } from './with-local-env.mjs'
import { PRECOMPRESSED_TYPES } from '../web/host/src/headers.ts'

export const environments = JSON.parse(
  fs.readFileSync(
    new URL('../config/web-environments.json', import.meta.url),
    'utf8'
  )
)

export const associatedApps = JSON.parse(
  fs.readFileSync(
    new URL('../config/web-associations.json', import.meta.url),
    'utf8'
  )
)

export const AASA = '.well-known/apple-app-site-association'
export const ASSET_LINKS = '.well-known/assetlinks.json'

export function developmentOnly() {
  const release = Object.entries(associatedApps)
    .filter(([variant]) => variant !== 'development')
    .flatMap(([, app]) => [
      app.apple,
      app.android?.package,
      ...(app.android?.sha256CertFingerprints ?? []),
    ])
  const { apple, android } = associatedApps.development
  return [apple, android.package, ...android.sha256CertFingerprints].filter(
    (value) => !release.includes(value)
  )
}

export function associationFiles(profile) {
  const environment = environments[profile]
  if (!environment) throw new Error(`Unknown web profile ${profile}`)
  const apps = environment.associatedApps.map((variant) => {
    const app = associatedApps[variant]
    if (!app) throw new Error(`Unknown associated app ${variant}`)
    return app
  })
  const json = (value) => `${JSON.stringify(value, null, 2)}\n`
  const files = {
    [AASA]: json({ webcredentials: { apps: apps.map((app) => app.apple) } }),
    [ASSET_LINKS]: json(
      apps
        .filter((app) => app.android)
        .map(({ android }) => ({
          relation: ['delegate_permission/common.get_login_creds'],
          target: {
            namespace: 'android_app',
            package_name: android.package,
            sha256_cert_fingerprints: android.sha256CertFingerprints,
          },
        }))
    ),
  }
  if (environment.variant !== 'development') {
    const leaked = developmentOnly().filter((value) =>
      Object.values(files).some((contents) => contents.includes(value))
    )
    if (leaked.length)
      throw new Error(
        `The ${profile} association files would list the development app (${leaked.join(', ')})`
      )
  }
  return files
}

export function writeAssociationFiles(directory, profile) {
  const files = associationFiles(profile)
  fs.rmSync(path.join(directory, '.well-known'), {
    recursive: true,
    force: true,
  })
  for (const [file, contents] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true })
    fs.writeFileSync(path.join(directory, file), contents)
  }
}

export function checkAssociationFiles(directory, profile) {
  const expected = associationFiles(profile)
  const wellKnown = path.join(directory, '.well-known')
  const present = fs.existsSync(wellKnown)
    ? listFiles(wellKnown).map((file) => `.well-known/${file}`)
    : []
  const wrong = [...new Set([...present, ...Object.keys(expected)])].filter(
    (file) =>
      !present.includes(file) ||
      expected[file] === undefined ||
      fs.readFileSync(path.join(directory, file), 'utf8') !== expected[file]
  )
  if (wrong.length)
    throw new Error(
      `${path.basename(directory)}/ doesn't hold the ${profile} association files: ${wrong.join(', ')}`
    )
}

export const WEB_EXCLUDED_KEYS = [
  'EXPO_PUBLIC_API_DEV_BYPASS',
  'EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY',
  'EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY',
  'EXPO_PUBLIC_HOT_UPDATER_API_KEY',
  'GOOGLE_MAPS_ANDROID_API_KEY',
]

function developmentBypass(root, inherited) {
  try {
    return loadLocalEnv(root, 'development', inherited).env
      .EXPO_PUBLIC_API_DEV_BYPASS
  } catch {
    return undefined
  }
}

export function loadWebEnv(root, profile, inherited = process.env) {
  const environment = environments[profile]
  if (!environment)
    throw new Error(
      `Expected --env ${Object.keys(environments).join('|')}, got ${profile}`
    )
  const { env, files } = loadLocalEnv(root, environment.variant, inherited)
  const excluded = [
    ...new Set(
      [
        ...WEB_EXCLUDED_KEYS.map((key) => env[key]),
        developmentBypass(root, inherited),
      ]
        .map((value) => value?.trim())
        .filter(Boolean)
    ),
  ]
  for (const key of WEB_EXCLUDED_KEYS) env[key] = ''
  for (const key of Object.keys(env))
    if (key.startsWith('POSTHOG_CLI_')) delete env[key]
  if (!environment.apiFromEnv)
    env.EXPO_PUBLIC_API_BASE_URL = environment.apiOrigin
  const api = new URL(env.EXPO_PUBLIC_API_BASE_URL || 'invalid:')
  if (!['http:', 'https:'].includes(api.protocol))
    throw new Error('EXPO_PUBLIC_API_BASE_URL must be an HTTP(S) URL')
  Object.assign(env, {
    WW_WEB_BUILD: '1',

    POSTHOG_DISABLE_UPLOAD: 'true',
  })
  return { env, files, excluded, api, host: environment.host }
}

const REVENUECAT_WEB_KEY = 'EXPO_PUBLIC_REVENUECAT_WEB_API_KEY'
const REVENUECAT_WEB_LINKS = 'EXPO_PUBLIC_REVENUECAT_WEB_PURCHASE_LINKS'

const ONE_PASSWORD_VAULT = 'Agents'

export function readOnePasswordFields(
  item,
  labels,
  { spawn = spawnSync, inherited = process.env } = {}
) {
  const values = {}
  for (const label of labels) {
    const read = spawn(
      'op',
      [
        'item',
        'get',
        item,
        '--vault',
        ONE_PASSWORD_VAULT,
        '--fields',
        `label=${label}`,
        '--format',
        'json',
        '--reveal',
      ],
      {
        env: inherited,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    )
    if (read.error?.code === 'ENOENT') throw new Error("op isn't installed")
    if (read.error) throw new Error("op couldn't run")
    if (read.status !== 0) throw new Error(`op exited with ${read.status}`)
    let value
    try {
      value = JSON.parse(read.stdout).value
    } catch {
      throw new Error("op's answer wasn't the field")
    }
    values[label] = typeof value === 'string' ? value : ''
  }
  return values
}

export function revenueCatWebProblems(env) {
  const key = env[REVENUECAT_WEB_KEY]?.trim()
  const links = env[REVENUECAT_WEB_LINKS]?.trim()
  const problems = []
  if (!key) problems.push(`${REVENUECAT_WEB_KEY} is empty`)
  else if (!key.startsWith('rcb_sb_'))
    problems.push(
      `${REVENUECAT_WEB_KEY} isn't a sandbox key (rcb_sb_…); development builds carry only the sandbox's`
    )
  if (!links) problems.push(`${REVENUECAT_WEB_LINKS} is empty`)
  else {
    let parsed
    try {
      parsed = JSON.parse(links)
    } catch {
      problems.push(`${REVENUECAT_WEB_LINKS} isn't valid JSON`)
    }
    if (parsed !== undefined) {
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        problems.push(`${REVENUECAT_WEB_LINKS} must be a JSON object`)
      else if (
        !Object.values(parsed).some(
          (link) => typeof link === 'string' && link.startsWith('sandbox/')
        )
      )
        problems.push(
          `${REVENUECAT_WEB_LINKS} has no sandbox/… link; development builds carry only the sandbox's`
        )
    }
  }
  return problems
}

export function fillRevenueCatWeb(
  env,
  profile,
  { op = readOnePasswordFields, inherited = process.env } = {}
) {
  const environment = environments[profile]
  const result = { fromOnePassword: [], problems: [] }

  if (environment?.variant !== 'development') return result
  const missing = [REVENUECAT_WEB_KEY, REVENUECAT_WEB_LINKS].filter(
    (key) => !env[key]?.trim()
  )
  let readError
  if (missing.length > 0 && environment.revenueCatWebItem)
    try {
      const values = op(environment.revenueCatWebItem, missing, { inherited })
      for (const key of missing)
        if (values[key]?.trim()) {
          env[key] = values[key].trim()
          result.fromOnePassword.push(key)
        }
    } catch (error) {
      readError = error.message
    }
  result.problems = revenueCatWebProblems(env)
  if (result.problems.length > 0) {
    const names = [REVENUECAT_WEB_KEY, REVENUECAT_WEB_LINKS].join(' and ')
    const source = environment.revenueCatWebItem
      ? `Set ${names} in .env.local, or in the 1Password Agents item "${environment.revenueCatWebItem}"${readError ? ` (reading it failed: ${readError})` : ''}`
      : `Set ${names} in .env.local`
    result.problems = [`${source}: ${result.problems.join('; ')}`]
  }
  return result
}

export const MAX_FILE_BYTES = 25 * 1024 * 1024
export const MAX_FILES = 20_000

export function listFiles(directory) {
  return fs
    .readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path
        .relative(directory, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join('/')
    )
    .sort()
}

export const servedFiles = (directory) =>
  listFiles(directory).filter((file) => !file.endsWith('.map'))

export function oversizedFiles(directory, maxBytes = MAX_FILE_BYTES) {
  return servedFiles(directory).filter(
    (file) => fs.statSync(path.join(directory, file)).size > maxBytes
  )
}

export function filesContaining(directory, values) {
  const needles = values
    .map((value) => value?.trim())
    .filter((value) => value?.length >= 8)
    .map((value) => Buffer.from(value))
  if (needles.length === 0) return []
  return listFiles(directory).filter((file) => {
    const contents = fs.readFileSync(path.join(directory, file))
    return needles.some((needle) => contents.includes(needle))
  })
}

const REFERENCED =
  /(?:["'`]|url\()(\/(?:assets|_expo\/static)\/[^"'`?#\s)]*\.[A-Za-z0-9]+)(?=["'`?#)])/g

export function unservedReferences(directory) {
  const served = new Set(servedFiles(directory).map((file) => `/${file}`))
  const missing = new Set()
  for (const file of served) {
    if (!/\.(js|css|html)$/.test(file)) continue
    const text = fs.readFileSync(path.join(directory, file), 'utf8')
    for (const [, url] of text.matchAll(REFERENCED)) {
      let decoded = url
      try {
        decoded = url.split('/').map(decodeURIComponent).join('/')
      } catch {}
      if (!served.has(decoded)) missing.add(url)
    }
  }
  return [...missing].sort()
}

export function checkExport(
  directory,
  excluded,
  {
    maxFiles = MAX_FILES,
    maxBytes = MAX_FILE_BYTES,
    serviceWorker = false,
  } = {}
) {
  const leaks = filesContaining(directory, excluded)
  if (leaks.length > 0)
    throw new Error(
      `A value web builds must not carry, such as the dev API bypass, reached ${leaks.slice(0, 5).join(', ')}`
    )
  const served = servedFiles(directory)
  if (served.length > maxFiles)
    throw new Error(
      `${served.length} files to serve; the host allows ${maxFiles}`
    )
  const oversized = oversizedFiles(directory, maxBytes)
  if (oversized.length > 0)
    throw new Error(
      `Over the host's ${(maxBytes / 1024 / 1024).toFixed(0)} MiB file limit: ${oversized.join(', ')}`
    )
  const unserved = unservedReferences(directory)
  if (unserved.length > 0)
    throw new Error(
      `The export loads files the host wouldn't serve: ${unserved.slice(0, 5).join(', ')}`
    )
  if (serviceWorker) checkServiceWorker(directory)
}

export function checkServiceWorker(directory) {
  const file = path.join(directory, 'sw.js')
  if (!fs.existsSync(file)) throw new Error('The export has no sw.js')
  const worker = fs.readFileSync(file, 'utf8')
  const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8')
  const entries = [...html.matchAll(/(?:src|href)="(\/_expo\/[^"]+)"/g)].map(
    (match) => match[1]
  )

  const assets = listFiles(path.join(directory, 'assets'))
    .filter((file) => !file.endsWith('.br'))
    .map((file) => `/assets/${file}`)
  const missing = ['/index.html', ...entries, ...assets].filter(
    (url) => !worker.includes(`"${url}"`)
  )
  if (missing.length > 0)
    throw new Error(`sw.js doesn't precache ${missing.slice(0, 5).join(', ')}`)
}

const brotli = promisify(zlib.brotliCompress)

const MIN_PRECOMPRESSED_BYTES = 1024

export async function precompressExport(directory, { quality = 11 } = {}) {
  const files = servedFiles(directory).filter((file) => {
    const extension = path.extname(file).slice(1).toLowerCase()
    return (
      PRECOMPRESSED_TYPES[extension] !== undefined &&
      !file.startsWith('.well-known/') &&
      fs.statSync(path.join(directory, file)).size >= MIN_PRECOMPRESSED_BYTES
    )
  })
  const totals = { files: 0, bytes: 0, compressed: 0 }

  const queue = [...files]
  const work = async () => {
    for (let file = queue.shift(); file; file = queue.shift()) {
      const contents = fs.readFileSync(path.join(directory, file))
      const compressed = await brotli(contents, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: quality,
          [zlib.constants.BROTLI_PARAM_SIZE_HINT]: contents.length,
        },
      })
      totals.bytes += contents.length
      if (compressed.length >= contents.length) {
        totals.compressed += contents.length
        continue
      }
      fs.writeFileSync(path.join(directory, `${file}.br`), compressed)
      totals.files += 1
      totals.compressed += compressed.length
    }
  }
  await Promise.all(Array.from({ length: 4 }, work))
  return totals
}

export function buildSteps(profile) {
  return [
    {
      name: 'sync:help',
      command: process.execPath,
      args: [
        'scripts/sync-help-center.mjs',
        '--manifest',
        environments[profile].helpManifest,
      ],
      failure:
        "Couldn't refresh the Help Center snapshot (pnpm sync:help); a web build needs the live Help Center, so connect and build again",
    },
    {
      name: 'export',
      command: 'expo',

      args: ['export', '--platform', 'web', '--output-dir', 'dist', '--clear'],
      failure: `The ${profile} web export failed`,
    },
  ]
}

export function copyCanvasKit(root) {
  const skia = createRequire(
    path.join(root, 'node_modules/@shopify/react-native-skia/package.json')
  )
  const source = skia.resolve('canvaskit-wasm/bin/full/canvaskit.wasm')
  const target = path.join(root, 'public', 'canvaskit.wasm')
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(source, target)
  return target
}

export function copySqlWasm(root) {
  const sqlJs = createRequire(
    path.join(root, 'node_modules/sql.js/package.json')
  )
  const source = sqlJs.resolve('sql.js/dist/sql-wasm-browser.wasm')
  const target = path.join(root, 'public', 'sql-wasm-browser.wasm')
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(source, target)
  return target
}

export const SPLASH_LABEL_KEY = 'common_loading'
export const SPLASH_LABELS_FILE = 'launch-splash.js'

export function splashLabels(root) {
  const directory = path.join(root, 'src', 'locales')
  return Object.fromEntries(
    fs
      .readdirSync(directory)
      .filter((file) => file.endsWith('.json'))
      .sort()
      .map((file) => [
        path.basename(file, '.json'),
        JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'))[
          SPLASH_LABEL_KEY
        ],
      ])
      .filter(([, label]) => typeof label === 'string' && label.trim())
  )
}

function nameSplashBar(labels) {
  const { document, navigator } = globalThis
  const bar = document.getElementById('launch-splash-progress')
  const tag = (navigator.languages?.[0] ?? navigator.language ?? '')
    .toLowerCase()
    .replace(/_/g, '-')
  const subtags = tag.split('-')
  const locales = Object.keys(labels)
  const sameLanguage = locales.filter(
    (locale) => locale.toLowerCase().split('-')[0] === subtags[0]
  )
  const traditional =
    subtags.includes('hant') ||
    (!subtags.includes('hans') &&
      ['tw', 'hk', 'mo'].some((region) => subtags.includes(region)))
  const locale =
    locales.find((locale) => locale.toLowerCase() === tag) ??
    (subtags[0] === 'zh'
      ? sameLanguage.find((locale) => /-tw$/i.test(locale) === traditional)
      : undefined) ??
    sameLanguage[0]
  if (!bar || !locale) return
  bar.setAttribute('aria-label', labels[locale])
  bar.setAttribute('lang', locale)
}

export const splashLabelScript = (labels) =>
  `(${nameSplashBar})(${JSON.stringify(labels)})\n`

export function writeSplashLabels(root) {
  const labels = splashLabels(root)
  if (!labels['en-US'])
    throw new Error(`src/locales/en-US.json has no ${SPLASH_LABEL_KEY}`)
  const target = path.join(root, 'public', SPLASH_LABELS_FILE)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, splashLabelScript(labels))
  return target
}

export const HELP_SNAPSHOT = 'src/assets/help-center'

export function restoringFiles(directory, build) {
  const saved = new Map(
    fs.existsSync(directory)
      ? listFiles(directory).map((file) => [
          file,
          fs.readFileSync(path.join(directory, file)),
        ])
      : []
  )
  try {
    return build()
  } finally {
    if (fs.existsSync(directory))
      for (const file of listFiles(directory))
        if (!saved.has(file)) fs.rmSync(path.join(directory, file))
    for (const [file, contents] of saved) {
      fs.mkdirSync(path.dirname(path.join(directory, file)), {
        recursive: true,
      })
      fs.writeFileSync(path.join(directory, file), contents)
    }
  }
}

export function runBuildSteps(steps, run) {
  for (const step of steps) if (run(step) !== 0) throw new Error(step.failure)
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  const envFlag = args.indexOf('--env')
  const profile =
    envFlag === -1 ? (command === 'build' ? 'dev' : 'local') : args[envFlag + 1]
  if (!['start', 'build'].includes(command))
    throw new Error(
      'Usage: node scripts/web.mjs <start|build> [--env local|dev|beta|production] [--port <port>]'
    )
  const root = fileURLToPath(new URL('../', import.meta.url))
  const { env, files, excluded, api, host } = loadWebEnv(root, profile)
  const revenueCat = fillRevenueCatWeb(env, profile)

  for (const problem of revenueCat.problems)
    console.warn(
      `[web] Warning: the paywall can't sell without the sandbox values. ${problem}`
    )
  console.log(
    `[web] ${profile}: ${files.map((file) => path.relative(root, file)).join(', ')}; API: ${api.origin}; host: ${host}`
  )
  copyCanvasKit(root)
  copySqlWasm(root)
  writeSplashLabels(root)
  const spawn = (executable, argv) => {
    const result = spawnSync(executable, argv, {
      cwd: root,
      env,
      stdio: 'inherit',
    })
    if (result.error) throw result.error
    return result
  }
  if (command === 'start') {
    const portFlag = args.indexOf('--port')
    const port = portFlag === -1 ? process.env.WW_WEB_PORT : args[portFlag + 1]
    const result = spawn('expo', [
      'start',
      '--web',
      ...(port ? ['--port', port] : []),
      ...(process.env.WW_WEB_MAX_WORKERS
        ? ['--max-workers', process.env.WW_WEB_MAX_WORKERS]
        : []),
    ])
    if (result.signal) process.kill(process.pid, result.signal)
    process.exitCode = result.status ?? 1
    return
  }

  env.NODE_ENV = 'production'
  const output = path.join(root, 'dist')

  restoringFiles(path.join(root, HELP_SNAPSHOT), () =>
    runBuildSteps(
      buildSteps(profile),
      (step) => spawn(step.command, step.args).status ?? 1
    )
  )
  try {
    writeAssociationFiles(output, profile)

    const { buildServiceWorker } = await import('./web-sw.mjs')
    const worker = await buildServiceWorker(output)
    console.log(
      `[web] Service worker precaches ${worker.count} files, ${(worker.size / 1024 / 1024).toFixed(1)} MiB`
    )

    const compressed = await precompressExport(output)
    console.log(
      `[web] Brotli: ${compressed.files} files, ${(compressed.bytes / 1024 / 1024).toFixed(1)} MiB to ${(compressed.compressed / 1024 / 1024).toFixed(1)} MiB`
    )
    checkExport(output, excluded, { serviceWorker: true })
  } catch (error) {
    fs.rmSync(output, { recursive: true, force: true })
    throw new Error(`${error.message}; removed dist/`, { cause: error })
  }
  console.log(`[web] Exported ${profile} to dist/`)
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(`[web] ${error.message}`)
    process.exitCode = 1
  })
}
