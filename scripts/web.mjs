import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { loadLocalEnv } from './with-local-env.mjs'

/**
 * The web profiles, `local|dev|beta|production`: each one's native env files
 * (`variant`), host, Worker, ww-api, PostHog and maps frame origins, Help
 * Center manifest, and CSP mode. This script, the web host's deploys
 * (`scripts/web-host.mjs`) and its Worker (`web/host`) all read this one file.
 */
export const environments = JSON.parse(
  fs.readFileSync(
    new URL('../config/web-environments.json', import.meta.url),
    'utf8'
  )
)

/**
 * Values a native build may carry that a web bundle must not: everyone can read
 * a web bundle. The web build has no dev bypass, no RevenueCat store keys and
 * no OTA updates; the Android Maps key never leaves Android.
 */
export const WEB_EXCLUDED_KEYS = [
  'EXPO_PUBLIC_API_DEV_BYPASS',
  'EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY',
  'EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY',
  'EXPO_PUBLIC_HOT_UPDATER_API_KEY',
  'GOOGLE_MAPS_ANDROID_API_KEY',
]

/**
 * This checkout's development bypass, which no web build may carry whatever its
 * profile: release variants' env files don't hold it.
 */
function developmentBypass(root, inherited) {
  try {
    return loadLocalEnv(root, 'development', inherited).env
      .EXPO_PUBLIC_API_DEV_BYPASS
  } catch {
    // No `.env` anywhere, so no bypass this checkout could leak.
    return undefined
  }
}

/**
 * The environment for a web build or dev server of `profile`
 * (`config/web-environments.json`). Public values such as PostHog's come from
 * the native variant's env files; the API comes from the profile, or with
 * `apiFromEnv` (`local`) from `.env` (or a verification run's own ww-api).
 * `excluded` lists the values cleared from it, and the development bypass, so
 * the export can be checked for them.
 */
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
    // `app.config.ts`: the web block, and no OTA key required.
    WW_WEB_BUILD: '1',
    // Source maps and native symbols upload only from native release builds.
    POSTHOG_DISABLE_UPLOAD: 'true',
  })
  return { env, files, excluded, api, host: environment.host }
}

/** Workers Static Assets limits: bytes per file, and files per version. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024
export const MAX_FILES = 20_000

/** Every file under `directory`, relative to it, with `/` separators. */
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

/**
 * The files the host serves. Source maps go to error tracking, not the public
 * origin (the web host's `.assetsignore`).
 */
export const servedFiles = (directory) =>
  listFiles(directory).filter((file) => !file.endsWith('.map'))

/** Served files under `directory` larger than the host serves. */
export function oversizedFiles(directory, maxBytes = MAX_FILE_BYTES) {
  return servedFiles(directory).filter(
    (file) => fs.statSync(path.join(directory, file)).size > maxBytes
  )
}

/**
 * Files under `directory`, source maps included, that contain any of `values`.
 * Values under 8 characters are too short to tell apart from code.
 */
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

// A file the export's code loads by URL: Expo's assets and script chunks, in
// quotes or a CSS `url()`.
const REFERENCED =
  /(?:["'`]|url\()(\/(?:assets|_expo\/static)\/[^"'`?#\s)]*\.[A-Za-z0-9]+)(?=["'`?#)])/g

/**
 * Files the export's scripts, styles and HTML load by URL but the host wouldn't
 * serve: missing, or left out of the upload like source maps. URLs are compared
 * decoded, as the host matches them.
 */
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
      } catch {
        // Kept as written, so it's reported.
      }
      if (!served.has(decoded)) missing.add(url)
    }
  }
  return [...missing].sort()
}

/**
 * Refuses an export that carries a value web builds must not (`excluded`, from
 * `loadWebEnv`), that the host can't serve, or that loads a file it wouldn't
 * upload. `web:build` runs it after each export, and the web host's deploys
 * again right before uploading.
 */
export function checkExport(
  directory,
  excluded,
  { maxFiles = MAX_FILES, maxBytes = MAX_FILE_BYTES } = {}
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
}

/**
 * What `web:build` runs, in order. The Help Center snapshot comes first, from
 * the profile's copy of the website: the export bundles it, and the committed
 * one can predate the web, which would leave the Help Center empty offline
 * (docs/help-center.md).
 */
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
      // A cleared cache keeps another profile's inlined values out of the
      // bundle.
      args: ['export', '--platform', 'web', '--output-dir', 'dist', '--clear'],
      failure: `The ${profile} web export failed`,
    },
  ]
}

/**
 * Skia's CanvasKit, which `src/app/launch/beforeAppLoads.web.ts` loads from the
 * web root. Expo serves and exports `public/` there; the 8 MB file is copied
 * from the installed package rather than checked in.
 */
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

/**
 * SQLite's wasm for MyTime import (`readMytimeSqlite`), served from the web
 * root like CanvasKit so no third-party origin is involved. The 0.7 MB file is
 * copied from the installed `sql.js`, not checked in.
 */
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

/** Where `sync:help` writes the Help Center snapshot the export bundles. */
export const HELP_SNAPSHOT = 'src/assets/help-center'

/**
 * Runs `build`, then puts `directory` back as it was, whether or not `build`
 * succeeded. A web build bundles the Help Center it just fetched, but the
 * checkout keeps its own snapshot: the native apps' changes only at release
 * prep, and deploys and Beta builds need a clean tree.
 */
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

/** Runs `steps` in order, through `run`, and stops at the first that fails. */
export function runBuildSteps(steps, run) {
  for (const step of steps) if (run(step) !== 0) throw new Error(step.failure)
}

function main() {
  const [command, ...args] = process.argv.slice(2)
  const envFlag = args.indexOf('--env')
  const profile =
    envFlag === -1 ? (command === 'build' ? 'dev' : 'local') : args[envFlag + 1]
  if (!['start', 'build'].includes(command))
    throw new Error(
      'Usage: node scripts/web.mjs <start|build> [--env local|dev|beta|production]'
    )
  const root = fileURLToPath(new URL('../', import.meta.url))
  const { env, files, excluded, api, host } = loadWebEnv(root, profile)
  console.log(
    `[web] ${profile}: ${files.map((file) => path.relative(root, file)).join(', ')}; API: ${api.origin}; host: ${host}`
  )
  copyCanvasKit(root)
  copySqlWasm(root)
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
    const result = spawn('expo', ['start', '--web'])
    if (result.signal) process.kill(process.pid, result.signal)
    process.exitCode = result.status ?? 1
    return
  }

  env.NODE_ENV = 'production'
  const output = path.join(root, 'dist')
  // An interrupted step fails the build too, so the snapshot is restored.
  restoringFiles(path.join(root, HELP_SNAPSHOT), () =>
    runBuildSteps(
      buildSteps(profile),
      (step) => spawn(step.command, step.args).status ?? 1
    )
  )
  try {
    checkExport(output, excluded)
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
  try {
    main()
  } catch (error) {
    console.error(`[web] ${error.message}`)
    process.exitCode = 1
  }
}
