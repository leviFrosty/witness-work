import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { loadLocalEnv } from './with-local-env.mjs'

const environments = JSON.parse(
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
 * The environment for a web build or dev server of `profile`
 * (`config/web-environments.json`). Public values such as PostHog's come from
 * the native variant's env files; the API comes from the profile, or for
 * `local` from `.env` (or a verification run's own ww-api). `excluded` lists
 * the values cleared from it, so the export can be checked for them.
 */
export function loadWebEnv(root, profile, inherited = process.env) {
  const environment = environments[profile]
  if (!environment)
    throw new Error(
      `Expected --env ${Object.keys(environments).join('|')}, got ${profile}`
    )
  const { env, files } = loadLocalEnv(root, environment.variant, inherited)
  const excluded = WEB_EXCLUDED_KEYS.map((key) => env[key]?.trim()).filter(
    Boolean
  )
  for (const key of WEB_EXCLUDED_KEYS) env[key] = ''
  for (const key of Object.keys(env))
    if (key.startsWith('POSTHOG_CLI_')) delete env[key]
  if (environment.apiBaseURL)
    env.EXPO_PUBLIC_API_BASE_URL = environment.apiBaseURL
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

/** Cloudflare Workers Static Assets serves no file larger than this. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024

/** Files under `directory` larger than the host serves. */
export function oversizedFiles(directory, maxBytes = MAX_FILE_BYTES) {
  return fs
    .readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => fs.statSync(file).size > maxBytes)
}

/** Files under `directory` that contain any of `values`. */
export function filesContaining(directory, values) {
  const found = []
  for (const entry of fs.readdirSync(directory, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) continue
    const file = path.join(entry.parentPath, entry.name)
    const contents = fs.readFileSync(file)
    if (values.some((value) => contents.includes(value))) found.push(file)
  }
  return found
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
  const run = (argv) => {
    const result = spawnSync('expo', argv, { cwd: root, env, stdio: 'inherit' })
    if (result.error) throw result.error
    if (result.signal) process.kill(process.pid, result.signal)
    if (result.status !== 0) process.exit(result.status ?? 1)
  }
  if (command === 'start') return run(['start', '--web'])

  env.NODE_ENV = 'production'
  const output = path.join(root, 'dist')
  // A cleared cache keeps another profile's inlined values out of the bundle.
  run(['export', '--platform', 'web', '--output-dir', 'dist', '--clear'])
  const leaks = filesContaining(output, excluded)
  if (leaks.length > 0) {
    fs.rmSync(output, { recursive: true, force: true })
    throw new Error(
      `A value web builds must not carry reached ${leaks.map((file) => path.relative(root, file)).join(', ')}; removed dist/`
    )
  }
  const oversized = oversizedFiles(output)
  if (oversized.length > 0)
    throw new Error(
      `Over the host's 25 MiB file limit: ${oversized.map((file) => path.relative(root, file)).join(', ')}`
    )
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
