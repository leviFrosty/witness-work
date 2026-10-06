import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

export function loadLocalEnv(root, variant, inherited = process.env) {
  const filenames = {
    development: ['.env', '.env.local'],
    production: ['.env.production', '.env.production.local'],
    beta: ['.env.beta', '.env.beta.local'],
  }[variant]
  if (!filenames) throw new Error('Expected development, production or beta')

  // Worktrees layer their own files over the main checkout's, so a worktree
  // that only received a copy of `.env` still sees the main `.env.local`.
  const worktrees = spawnSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: root,
    encoding: 'utf8',
  })
  const mainCheckout = worktrees.stdout?.match(/^worktree (.+)$/m)?.[1]
  const directories =
    mainCheckout && path.resolve(mainCheckout) !== path.resolve(root)
      ? [mainCheckout, root]
      : [root]
  if (!directories.some((d) => fs.existsSync(path.join(d, filenames[0])))) {
    throw new Error(
      `${filenames[0]} missing here and in the main checkout; see docs/build.md`
    )
  }

  // App configuration comes only from the selected files. Keep toolchain vars,
  // but don't inherit app keys or a dev bypass from another shell environment.
  const env = { ...inherited }
  for (const key of Object.keys(env)) {
    if (
      /^(EXPO_PUBLIC_|POSTHOG_|__EXPO_ENV_|__EXPO_CONFIG_MODE$)/.test(key) ||
      key === 'GOOGLE_MAPS_ANDROID_API_KEY'
    )
      delete env[key]
  }
  const files = []
  for (const directory of directories) {
    for (const filename of filenames) {
      const file = path.join(directory, filename)
      if (fs.existsSync(file)) {
        Object.assign(env, dotenv.parse(fs.readFileSync(file)))
        files.push(file)
      }
    }
  }
  // `scripts/verify` points a development run at its own isolated ww-api.
  if (variant === 'development' && inherited.WW_VERIFY_API_BASE_URL) {
    env.EXPO_PUBLIC_API_BASE_URL = inherited.WW_VERIFY_API_BASE_URL
    env.EXPO_PUBLIC_API_DEV_BYPASS = inherited.WW_VERIFY_API_DEV_BYPASS ?? ''
  }
  Object.assign(env, {
    APP_VARIANT: variant,
    NODE_ENV: variant === 'development' ? 'development' : 'production',
    EXPO_NO_DOTENV: '1',
  })
  if (env.EXPO_NO_CLIENT_ENV_VARS === '1') {
    throw new Error(
      'Unset EXPO_NO_CLIENT_ENV_VARS so Expo can inline runtime configuration'
    )
  }
  if (variant !== 'development' && env.EXPO_PUBLIC_API_DEV_BYPASS?.trim()) {
    throw new Error(
      'EXPO_PUBLIC_API_DEV_BYPASS must be empty outside development'
    )
  }
  return { env, files }
}

export function validateLocalEnv(env, platform) {
  if (!['ios', 'android'].includes(platform))
    throw new Error('Expected ios or android')
  const key =
    platform === 'android'
      ? 'EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY'
      : 'EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY'
  if (!env[key]?.trim())
    throw new Error(`${key} is missing in the selected environment`)
  if (env.APP_VARIANT !== 'development' && env[key].startsWith('test_')) {
    throw new Error(`${key} must use a store SDK key outside development`)
  }
  if (
    platform === 'android' &&
    (!env.GOOGLE_MAPS_ANDROID_API_KEY?.trim() ||
      env.GOOGLE_MAPS_ANDROID_API_KEY.startsWith('YOUR_'))
  ) {
    throw new Error(
      'GOOGLE_MAPS_ANDROID_API_KEY is missing or still a placeholder; configure it and rebuild Android'
    )
  }
  const api = new URL(
    env.EXPO_PUBLIC_API_BASE_URL || 'https://ww-proxy.leviwilkerson.com'
  )
  if (!['http:', 'https:'].includes(api.protocol))
    throw new Error('EXPO_PUBLIC_API_BASE_URL must be an HTTP(S) URL')
  return api
}

export function forwardAndroidBackend(api, env, run = spawnSync) {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(api.hostname)) return
  const port = api.port || (api.protocol === 'https:' ? '443' : '80')
  const devices = run('adb', ['devices'], { env, encoding: 'utf8' })
  if (devices.error || devices.status !== 0) {
    throw new Error('adb is required to forward the local backend to Android')
  }
  const serials = devices.stdout
    .split('\n')
    .map((line) => line.match(/^(\S+)\s+device$/)?.[1])
    .filter(Boolean)
  const serial =
    env.ANDROID_SERIAL || (serials.length === 1 ? serials[0] : undefined)
  if (!serial || !serials.includes(serial)) {
    throw new Error(
      'Boot/connect an Android device first; set ANDROID_SERIAL when multiple devices are connected'
    )
  }
  const result = run(
    'adb',
    ['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`],
    { env, encoding: 'utf8' }
  )
  if (result.error || result.status !== 0)
    throw new Error('Failed to forward the local backend with adb reverse')
  console.log(
    `[env] Forwarded Android localhost:${port} to the host backend (${serial})`
  )
}

function main() {
  const [variant, platform, separator, command, ...args] = process.argv.slice(2)
  const root = fileURLToPath(new URL('../', import.meta.url))
  const { env, files } = loadLocalEnv(root, variant)
  const api = validateLocalEnv(env, platform)
  if (separator !== '--check' && (separator !== '--' || !command)) {
    throw new Error(
      'Usage: node scripts/with-local-env.mjs <variant> <ios|android> <--check|-- command ...>'
    )
  }
  console.log(
    `[env] ${variant}/${platform}: ${files.map((file) => path.relative(root, file)).join(', ')}`
  )
  console.log(
    `[env] RevenueCat configured${platform === 'android' ? '; Maps key configured (native rebuild required after changes)' : ''}; API: ${api.origin}`
  )
  if (['localhost', '127.0.0.1', '[::1]'].includes(api.hostname)) {
    console.warn(
      `[env] Local backend must be running on port ${api.port || (api.protocol === 'https:' ? '443' : '80')}.${platform === 'android' ? ' Android dev commands forward this port using adb reverse.' : ''}`
    )
  }
  if (separator === '--check') return
  const run = (executable, argv) => {
    const result = spawnSync(executable, argv, {
      cwd: root,
      env,
      stdio: 'inherit',
    })
    if (result.error) throw result.error
    if (result.signal) process.kill(process.pid, result.signal)
    if (result.status !== 0) process.exit(result.status ?? 1)
  }
  // expo run skips prebuild when android/ already exists. Refresh config without
  // --clean so a previous placeholder/key can't remain in the installed binary.
  if (command === 'expo' && args[0] === 'run:android') {
    run('expo', ['prebuild', '--platform', 'android', '--no-install'])
  }
  if (
    platform === 'android' &&
    command === 'expo' &&
    ['start', 'run:android'].includes(args[0])
  ) {
    forwardAndroidBackend(api, env)
  }
  run(command, args)
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main()
  } catch (error) {
    console.error(`[env] ${error.message}`)
    process.exitCode = 1
  }
}
