#!/usr/bin/env node
// Agent verification harness for WitnessWork. Usage and the proof standards
// live in .agents/skills/verify-witnesswork/SKILL.md; `ww-verify help` prints
// the command list.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readFlow, runSteps } from './flows.mjs'

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(
  /\/$/,
  ''
)
const STATE_DIR = path.join(ROOT, '.verify')
const STATE_FILE = path.join(STATE_DIR, 'state.json')
const GLOBAL_DIR = path.join(os.homedir(), '.ww-verify')
const LOCK_DIR = path.join(GLOBAL_DIR, 'locks')
const BUILD_DIR = path.join(GLOBAL_DIR, 'builds')
const BUILD_INDEX = path.join(GLOBAL_DIR, 'builds.json')
const INSTALLS = path.join(GLOBAL_DIR, 'installs.json')

const BUNDLE_ID = 'com.leviwilkerson.jwtimedev'
const AGENT_DEVICE_VERSION = '0.21.12'
const METRO_PORTS = [8090, 8091, 8092, 8093, 8094, 8095, 8096, 8097, 8098, 8099]
const ANDROID_HOME =
  process.env.ANDROID_HOME || path.join(os.homedir(), 'Library/Android/sdk')
const ANDROID_AVD_HOME =
  process.env.ANDROID_AVD_HOME || path.join(os.homedir(), '.android/avd')
const LOCK_STALE_MS = 24 * 60 * 60 * 1000
const KEEP_BUILDS = 3

const SLUG = path
  .basename(ROOT)
  .replace(/[^a-zA-Z0-9]+/g, '-')
  .toLowerCase()

// ---------- small utilities ----------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function fail(message) {
  console.error(`ww-verify: ${message}`)
  process.exit(1)
}

function log(message) {
  console.error(`[ww-verify] ${message}`)
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
    env: { ...toolEnv(), ...options.env },
  })
  if (options.check !== false && result.status !== 0) {
    const output = `${result.stderr || ''}${result.stdout || ''}`.trim()
    fail(
      `${cmd} ${args.join(' ')} failed (${result.status}): ${output.slice(-1500)}`
    )
  }
  return result
}

// The newest installed Xcode, so builds target the newest simulator runtime
// even when xcode-select still points at an older Xcode.
let developerDir
function newestDeveloperDir() {
  if (developerDir !== undefined) return developerDir
  const apps = fs.existsSync('/Applications')
    ? fs.readdirSync('/Applications').filter((a) => /^Xcode.*\.app$/.test(a))
    : []
  const versioned = apps
    .map((app) => {
      const plist = path.join('/Applications', app, 'Contents/version.plist')
      const version = spawnSync(
        'plutil',
        ['-extract', 'CFBundleShortVersionString', 'raw', plist],
        { encoding: 'utf8' }
      ).stdout.trim()
      return {
        dir: path.join('/Applications', app, 'Contents/Developer'),
        version,
      }
    })
    .filter((x) => x.version)
    .sort((a, b) =>
      a.version.localeCompare(b.version, undefined, { numeric: true })
    )
  developerDir = versioned.pop()?.dir ?? null
  return developerDir
}

function toolEnv() {
  const env = { ...process.env, ANDROID_HOME, ANDROID_AVD_HOME }
  if (!env.DEVELOPER_DIR && newestDeveloperDir())
    env.DEVELOPER_DIR = newestDeveloperDir()
  const paths = [
    path.join(ANDROID_HOME, 'platform-tools'),
    path.join(ANDROID_HOME, 'emulator'),
    path.join(ANDROID_HOME, 'cmdline-tools/latest/bin'),
    path.join(os.homedir(), '.maestro/bin'),
  ]
  env.PATH = [...paths, env.PATH].join(':')
  if (!env.JAVA_HOME) {
    const jdks = path.join(os.homedir(), '.jdks')
    const jdk = fs.existsSync(jdks)
      ? fs
          .readdirSync(jdks)
          .filter((d) => d.startsWith('jdk-'))
          .sort()
          .pop()
      : undefined
    if (jdk) env.JAVA_HOME = path.join(jdks, jdk, 'Contents/Home')
  }
  return env
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

const readState = () => readJson(STATE_FILE, {})
const writeState = (state) => writeJson(STATE_FILE, state)

function parseFlags(argv) {
  const flags = {}
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const [key, inline] = arg.slice(2).split('=')
      const next = argv[i + 1]
      if (inline !== undefined) flags[key] = inline
      else if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next
        i++
      } else flags[key] = true
    } else positional.push(arg)
  }
  return { flags, positional }
}

function pidAlive(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function freeDiskGb() {
  const out = run('df', ['-k', '/System/Volumes/Data'], { check: false }).stdout
  const fields = out.trim().split('\n').pop()?.split(/\s+/) ?? []
  return Math.floor(Number(fields[3]) / 1024 / 1024)
}

async function httpText(url, timeoutMs = 3000) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
    })
    return { status: response.status, text: await response.text() }
  } catch (error) {
    return { status: 0, text: String(error.message || error) }
  }
}

function runId() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

function artifactsDir(state) {
  const dir = path.join(STATE_DIR, 'artifacts', state.runId || 'adhoc')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

// ---------- device locks (one worktree per device) ----------

function lockFile(deviceKey) {
  return path.join(LOCK_DIR, `${deviceKey.replace(/[^a-zA-Z0-9-]/g, '_')}.json`)
}

function lockOwner(deviceKey) {
  const lock = readJson(lockFile(deviceKey), null)
  if (!lock) return null
  const stale =
    !fs.existsSync(lock.worktree) || Date.now() - lock.at > LOCK_STALE_MS
  return stale ? null : lock
}

function canTake(deviceKey) {
  const owner = lockOwner(deviceKey)
  return !owner || owner.worktree === ROOT
}

function takeLock(deviceKey) {
  writeJson(lockFile(deviceKey), { worktree: ROOT, at: Date.now() })
}

function releaseLock(deviceKey) {
  const owner = lockOwner(deviceKey)
  if (owner?.worktree === ROOT) fs.rmSync(lockFile(deviceKey), { force: true })
}

// ---------- agent-device ----------

function agentDeviceBin() {
  if (process.env.AGENT_DEVICE_BIN) return [process.env.AGENT_DEVICE_BIN]
  const pinned = path.join(
    os.homedir(),
    `.t3/tools/agent-device/${AGENT_DEVICE_VERSION}/node_modules/.bin/agent-device`
  )
  if (fs.existsSync(pinned)) return [pinned]
  return ['npx', '-y', `agent-device@${AGENT_DEVICE_VERSION}`]
}

function sessionName(platform) {
  return `wwv-${SLUG}-${platform}`.slice(0, 60)
}

function agentDevice(args, options = {}) {
  const [bin, ...prefix] = agentDeviceBin()
  return run(bin, [...prefix, ...args], {
    check: false,
    timeout: 180_000,
    ...options,
  })
}

// ---------- iOS ----------

function simctlDevices() {
  const out = run('xcrun', [
    'simctl',
    'list',
    'devices',
    'available',
    '-j',
  ]).stdout
  return Object.entries(JSON.parse(out).devices).flatMap(([runtime, devices]) =>
    devices.map((device) => ({ ...device, runtime }))
  )
}

function newestIosRuntime() {
  const out = run('xcrun', [
    'simctl',
    'list',
    'runtimes',
    'available',
    '-j',
  ]).stdout
  const runtimes = JSON.parse(out).runtimes.filter((r) => r.platform === 'iOS')
  if (!runtimes.length)
    fail('No iOS simulator runtime installed (Xcode > Settings > Components)')
  return runtimes
    .sort((a, b) =>
      a.version.localeCompare(b.version, undefined, { numeric: true })
    )
    .pop()
}

function pickDeviceType(runtime, kind) {
  const types = runtime.supportedDeviceTypes ?? []
  const pattern = kind === 'ipad' ? /^iPad Pro 13-inch/ : /^iPhone \d+ Pro$/
  const match = types.filter((t) => pattern.test(t.name)).pop()
  if (!match) fail(`No ${kind} device type for ${runtime.name}`)
  return match.identifier
}

function ensureIosDevice(kind) {
  const label = kind === 'ipad' ? 'iPad' : 'iPhone'
  const pattern = new RegExp(`^WW Verify ${label} (\\d+)$`)
  const pool = simctlDevices()
    .filter((d) => pattern.test(d.name))
    .sort(
      (a, b) =>
        Number(a.name.match(pattern)[1]) - Number(b.name.match(pattern)[1])
    )
  let device = pool.find((d) => canTake(d.udid))
  if (!device) {
    const next = pool.length
      ? Math.max(...pool.map((d) => Number(d.name.match(pattern)[1]))) + 1
      : 1
    const runtime = newestIosRuntime()
    const name = `WW Verify ${label} ${next}`
    log(`creating simulator "${name}" (${runtime.name})`)
    const udid = run('xcrun', [
      'simctl',
      'create',
      name,
      pickDeviceType(runtime, kind),
      runtime.identifier,
    ]).stdout.trim()
    device = { udid, name, state: 'Shutdown' }
  }
  takeLock(device.udid)
  if (device.state !== 'Booted') {
    log(`booting ${device.name}`)
    run('xcrun', ['simctl', 'boot', device.udid], { check: false })
  }
  run('xcrun', ['simctl', 'bootstatus', device.udid, '-b'], {
    timeout: 300_000,
  })
  return {
    platform: 'ios',
    id: device.udid,
    name: device.name,
    lockKey: device.udid,
  }
}

function iosAppInstalled(udid) {
  return (
    run('xcrun', ['simctl', 'get_app_container', udid, BUNDLE_ID], {
      check: false,
    }).status === 0
  )
}

function iosDerivedDataApp() {
  const base = path.join(os.homedir(), 'Library/Developer/Xcode/DerivedData')
  const workspace = path.join(ROOT, 'ios/WitnessWorkDev.xcworkspace')
  if (!fs.existsSync(base)) return null
  for (const dir of fs
    .readdirSync(base)
    .filter((d) => d.startsWith('WitnessWorkDev-'))) {
    const info = path.join(base, dir, 'info.plist')
    const owner = run('plutil', ['-extract', 'WorkspacePath', 'raw', info], {
      check: false,
    }).stdout.trim()
    const app = path.join(
      base,
      dir,
      'Build/Products/Debug-iphonesimulator/WitnessWorkDev.app'
    )
    if (owner === workspace && fs.existsSync(app)) return app
  }
  return null
}

// ---------- Android ----------

function adbDevices() {
  return run('adb', ['devices'], { check: false })
    .stdout.split('\n')
    .map((line) => line.match(/^(emulator-\d+)\s+device$/)?.[1])
    .filter(Boolean)
}

function runningAvds() {
  return Object.fromEntries(
    adbDevices().map((serial) => [
      run('adb', ['-s', serial, 'emu', 'avd', 'name'], { check: false })
        .stdout.split('\n')[0]
        .trim(),
      serial,
    ])
  )
}

function newestSystemImage() {
  const base = path.join(ANDROID_HOME, 'system-images')
  if (!fs.existsSync(base))
    fail(`No Android system images in ${base}; install one with sdkmanager`)
  const images = fs
    .readdirSync(base)
    .filter((api) =>
      fs.existsSync(path.join(base, api, 'google_apis/arm64-v8a'))
    )
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  if (!images.length)
    fail('No google_apis arm64-v8a Android system image installed')
  return `system-images;${images.pop()};google_apis;arm64-v8a`
}

async function ensureAndroidDevice() {
  const pattern = /^ww-verify-(\d+)$/
  const avds = run('emulator', ['-list-avds'], { check: false })
    .stdout.split('\n')
    .map((s) => s.trim())
    .filter((s) => pattern.test(s))
    .sort((a, b) => Number(a.match(pattern)[1]) - Number(b.match(pattern)[1]))
  let name = avds.find((avd) => canTake(`avd-${avd}`))
  if (!name) {
    const next = avds.length
      ? Math.max(...avds.map((a) => Number(a.match(pattern)[1]))) + 1
      : 1
    name = `ww-verify-${next}`
    log(`creating emulator ${name} (needs ~6 GB)`)
    run(
      'avdmanager',
      ['create', 'avd', '-n', name, '-k', newestSystemImage(), '-d', 'pixel_8'],
      { input: 'no\n' }
    )
  }
  takeLock(`avd-${name}`)
  let serial = runningAvds()[name]
  if (!serial) {
    const port = 5580 + 2 * (Number(name.match(pattern)[1]) - 1)
    serial = `emulator-${port}`
    log(`booting ${name} headless on ${serial}`)
    const logFile = fs.openSync(
      path.join(STATE_DIR, `emulator-${name}.log`),
      'a'
    )
    spawn(
      'emulator',
      [
        '-avd',
        name,
        '-port',
        String(port),
        '-no-window',
        '-no-audio',
        '-no-boot-anim',
        '-no-snapshot-save',
      ],
      { detached: true, stdio: ['ignore', logFile, logFile], env: toolEnv() }
    ).unref()
    run('adb', ['-s', serial, 'wait-for-device'], { timeout: 240_000 })
    for (let i = 0; ; i++) {
      const booted = run(
        'adb',
        ['-s', serial, 'shell', 'getprop', 'sys.boot_completed'],
        { check: false }
      ).stdout.trim()
      if (booted === '1') break
      if (i > 120)
        fail(`${name} did not finish booting; see .verify/emulator-${name}.log`)
      await sleep(2000)
    }
  }
  return { platform: 'android', id: serial, name, lockKey: `avd-${name}` }
}

function androidAppInstalled(serial) {
  return run('adb', ['-s', serial, 'shell', 'pm', 'path', BUNDLE_ID], {
    check: false,
  }).stdout.includes('package:')
}

// ---------- native builds, cached by fingerprint ----------

async function nativeFingerprint(platform) {
  const require = createRequire(path.join(ROOT, 'package.json'))
  const { createFingerprintAsync } = require('@expo/fingerprint')
  const fingerprint = await createFingerprintAsync(ROOT, {
    platforms: [platform],
  })
  return fingerprint.hash
}

function cachedBuild(platform, fingerprint) {
  const entry = readJson(BUILD_INDEX, {})[`${platform}-${fingerprint}`]
  return entry && fs.existsSync(entry.path) ? entry : null
}

function cacheBuild(platform, fingerprint, artifact) {
  fs.mkdirSync(BUILD_DIR, { recursive: true })
  const ext = platform === 'ios' ? 'app' : 'apk'
  const target = path.join(BUILD_DIR, `${platform}-${fingerprint}.${ext}`)
  fs.rmSync(target, { recursive: true, force: true })
  run('ditto', [artifact, target])
  const index = readJson(BUILD_INDEX, {})
  index[`${platform}-${fingerprint}`] = {
    path: target,
    builtAt: Date.now(),
    worktree: ROOT,
  }
  const stale = Object.entries(index)
    .filter(([key]) => key.startsWith(`${platform}-`))
    .sort((a, b) => b[1].builtAt - a[1].builtAt)
    .slice(KEEP_BUILDS)
  for (const [key, entry] of stale) {
    fs.rmSync(entry.path, { recursive: true, force: true })
    delete index[key]
  }
  writeJson(BUILD_INDEX, index)
  return target
}

function buildNative(device, metroPort) {
  const logPath = path.join(STATE_DIR, `build-${device.platform}.log`)
  log(
    `building ${device.platform} dev client (several minutes); log: ${path.relative(ROOT, logPath)}`
  )
  const out = fs.openSync(logPath, 'w')
  const step = (args, env = {}) => {
    const result = spawnSync('pnpm', args, {
      cwd: ROOT,
      stdio: ['ignore', out, out],
      env: { ...toolEnv(), ...env },
    })
    if (result.status !== 0)
      fail(`pnpm ${args.join(' ')} failed; tail ${logPath}`)
  }
  if (device.platform === 'ios') {
    if (!fs.existsSync(path.join(ROOT, 'ios'))) step(['run', 'prebuild'])
    // --port with this worktree's Metro already running makes Expo reuse it
    // (no second bundler) and open the dev client on it, never on 8081.
    step(['run', 'ios', '--device', device.id, '--port', String(metroPort)])
    const app = iosDerivedDataApp()
    if (!app)
      fail(
        'Build finished but no WitnessWorkDev.app was found for this worktree'
      )
    return app
  }
  step(
    ['run', 'android', '--device', device.name, '--port', String(metroPort)],
    { ANDROID_SERIAL: device.id }
  )
  const apk = path.join(
    ROOT,
    'android/app/build/outputs/apk/debug/app-debug.apk'
  )
  if (!fs.existsSync(apk)) fail('Build finished but app-debug.apk is missing')
  return apk
}

function install(device, artifact) {
  log(`installing ${path.basename(artifact)} on ${device.name}`)
  if (device.platform === 'ios')
    run('xcrun', ['simctl', 'install', device.id, artifact])
  else
    run('adb', ['-s', device.id, 'install', '-r', '-g', artifact], {
      timeout: 300_000,
    })
}

function appInstalled(device) {
  return device.platform === 'ios'
    ? iosAppInstalled(device.id)
    : androidAppInstalled(device.id)
}

/**
 * Returns 'verified' when the installed binary matches this tree's native
 * fingerprint.
 */
async function ensureApp(device, flags, metroPort) {
  const installs = readJson(INSTALLS, {})
  if (flags['accept-stale-native']) {
    if (!appInstalled(device)) {
      const fallback =
        device.platform === 'ios'
          ? iosDerivedDataApp()
          : [
              path.join(
                ROOT,
                'android/app/build/outputs/apk/debug/app-debug.apk'
              ),
            ].find((p) => fs.existsSync(p))
      if (!fallback)
        fail(
          'No installed or built app to accept; drop --accept-stale-native to build'
        )
      install(device, fallback)
    }
    installs[device.lockKey] = { fingerprint: 'unverified', at: Date.now() }
    writeJson(INSTALLS, installs)
    return 'UNVERIFIED (--accept-stale-native)'
  }
  const fingerprint = await nativeFingerprint(device.platform)
  if (
    !flags.rebuild &&
    installs[device.lockKey]?.fingerprint === fingerprint &&
    appInstalled(device)
  )
    return 'verified'
  let cached = flags.rebuild ? null : cachedBuild(device.platform, fingerprint)
  if (!cached) {
    const artifact = buildNative(device, metroPort)
    cached = { path: cacheBuild(device.platform, fingerprint, artifact) }
  }
  install(device, cached.path)
  installs[device.lockKey] = { fingerprint, at: Date.now() }
  writeJson(INSTALLS, installs)
  return 'verified'
}

// ---------- Metro ----------

async function metroRunning(port) {
  return (await httpText(`http://127.0.0.1:${port}/status`)).text.includes(
    'packager-status:running'
  )
}

function portOwner(port) {
  const pid = run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
    check: false,
  })
    .stdout.trim()
    .split('\n')[0]
  if (!pid) return null
  const cwd = run('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn'], {
    check: false,
  }).stdout.match(/^n(.+)$/m)?.[1]
  return { pid: Number(pid), cwd }
}

async function ensureMetro(state, api) {
  const apiUrl = api?.url
  const current = state.metro
  if (
    current &&
    pidAlive(current.pid) &&
    (await metroRunning(current.port)) &&
    (current.apiUrl ?? undefined) === apiUrl
  ) {
    return current
  }
  if (current && pidAlive(current.pid)) stopProcessGroup(current.pid)
  let port
  for (const candidate of METRO_PORTS) {
    if (!portOwner(candidate)) {
      port = candidate
      break
    }
  }
  if (!port)
    fail(
      `All Metro ports ${METRO_PORTS[0]}-${METRO_PORTS.at(-1)} are busy; run ww-verify down in idle worktrees`
    )
  const logPath = path.join(STATE_DIR, 'metro.log')
  const out = fs.openSync(logPath, 'w')
  const env = { ...toolEnv(), EXPO_NO_TELEMETRY: '1' }
  delete env.CI
  if (apiUrl) {
    env.WW_VERIFY_API_BASE_URL = apiUrl
    env.WW_VERIFY_API_DEV_BYPASS = api.devBypass ?? ''
  }
  log(`starting Metro on ${port}`)
  const child = spawn(
    'pnpm',
    [
      'exec',
      'node',
      'scripts/with-local-env.mjs',
      'development',
      'ios',
      '--',
      'expo',
      'start',
      '--dev-client',
      '--port',
      String(port),
    ],
    { cwd: ROOT, detached: true, stdio: ['ignore', out, out], env }
  )
  child.unref()
  for (let i = 0; !(await metroRunning(port)); i++) {
    if (i > 90 || !pidAlive(child.pid))
      fail(`Metro did not start; tail ${logPath}`)
    await sleep(1000)
  }
  return {
    pid: child.pid,
    port,
    apiUrl: apiUrl ?? null,
    log: path.relative(ROOT, logPath),
  }
}

function stopProcessGroup(pid) {
  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      // already gone
    }
  }
}

// ---------- backend ----------

function apiDir() {
  return process.env.WW_API_DIR || path.join(os.homedir(), 'dev/ww-api')
}

function startLocalApi() {
  const script = path.join(apiDir(), 'scripts/verify/dev.mjs')
  if (!fs.existsSync(script))
    fail(
      `${script} not found; set WW_API_DIR to a ww-api checkout that has the verify-ww-api loop`
    )
  run('node', [script, 'up'], {
    cwd: apiDir(),
    stdio: ['ignore', 'inherit', 'inherit'],
    timeout: 180_000,
  })
  const url = run('node', [script, 'url'], { cwd: apiDir() }).stdout.trim()
  // The isolated worker mints its own dev-bypass token; the bundle must send it.
  const devBypass = readJson(path.join(apiDir(), '.verify/state.json'), {})
    .tokens?.devBypass
  return { url, devBypass }
}

function envApiUrl() {
  const result = run(
    'pnpm',
    [
      'exec',
      'node',
      '--input-type=module',
      '-e',
      "import('./scripts/with-local-env.mjs').then(({ loadLocalEnv }) => console.log(loadLocalEnv(process.cwd(), 'development').env.EXPO_PUBLIC_API_BASE_URL || 'https://ww-proxy.leviwilkerson.com'))",
    ],
    { cwd: ROOT, check: false }
  )
  return result.stdout.trim().split('\n').pop()
}

// ---------- launch + CDP ----------

async function cdpTargets(port) {
  const { text } = await httpText(`http://127.0.0.1:${port}/json/list`)
  try {
    return JSON.parse(text)
  } catch {
    return []
  }
}

// Each worktree's Metro serves at most one device per platform. Match by
// platform: Android runtimes report "<model> - <release> - API <n>", and an
// iOS runtime reports the simulator name, which can lag a rename until reboot.
async function cdpTarget(state, platform) {
  if (!state.devices?.[platform])
    fail(
      `No ${platform} device in .verify/state.json; run ww-verify up --platform ${platform}`
    )
  const targets = await cdpTargets(state.metro.port)
  const isAndroid = (t) => / - API \d+$/.test(t.deviceName ?? '')
  return targets.find(
    (t) =>
      t.title?.startsWith(BUNDLE_ID) &&
      isAndroid(t) === (platform === 'android')
  )
}

async function cdpEval(state, platform, expression, timeoutMs = 30_000) {
  const target = await cdpTarget(state, platform)
  if (!target)
    throw new Error(
      `No JS runtime for ${platform} on Metro ${state.metro.port}; is the app open?`
    )
  const require = createRequire(path.join(ROOT, 'package.json'))
  const WebSocket = require('ws')
  // Metro rejects debugger sockets without an Origin, and `localhost` can
  // resolve to ::1 and be dropped, so pin both to 127.0.0.1.
  const origin = `http://127.0.0.1:${state.metro.port}`
  const url = target.webSocketDebuggerUrl.replace(
    '//localhost:',
    '//127.0.0.1:'
  )
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { headers: { Origin: origin } })
    const timer = setTimeout(() => {
      socket.terminate()
      reject(new Error(`CDP eval timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    socket.on('open', () => {
      socket.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }))
      socket.send(
        JSON.stringify({
          id: 2,
          method: 'Runtime.evaluate',
          params: {
            expression: `JSON.stringify((() => { return (${expression}) })())`,
            returnByValue: true,
          },
        })
      )
    })
    socket.on('message', (raw) => {
      const message = JSON.parse(raw)
      if (message.id !== 2) return
      clearTimeout(timer)
      socket.close()
      const { result, exceptionDetails } = message.result ?? {}
      if (exceptionDetails) {
        reject(
          new Error(
            exceptionDetails.exception?.description || exceptionDetails.text
          )
        )
        return
      }
      resolve(
        result?.value === undefined ? undefined : JSON.parse(result.value)
      )
    })
    socket.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

async function waitForHarness(state, platform, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const ready = await cdpEval(
        state,
        platform,
        'typeof globalThis.__WW_DEV__ === "object" && __WW_DEV__.quietLogBox(true) && __WW_DEV__.version',
        5000
      )
      if (ready) return ready
    } catch (error) {
      lastError = error
    }
    await sleep(2000)
  }
  throw new Error(
    `App JS never became ready on ${platform}: ${lastError?.message ?? 'no __WW_DEV__'}`
  )
}

function devClientUrl(port) {
  return `exp+jw-time://expo-development-client/?url=${encodeURIComponent(`http://127.0.0.1:${port}`)}`
}

async function launch(state, device) {
  const port = state.metro.port
  const session = sessionName(device.platform)
  if (device.platform === 'ios') {
    for (const [key, type, value] of [
      ['RCT_jsLocation', '-string', `127.0.0.1:${port}`],
      ['EXDevMenuIsOnboardingFinished', '-bool', 'YES'],
      ['EXDevMenuShowsAtLaunch', '-bool', 'NO'],
      // The floating dev button overlaps the app's top-right header buttons,
      // and gestures could open the dev menu mid-drive.
      ['EXDevMenuShowFloatingActionButton', '-bool', 'NO'],
      ['EXDevMenuMotionGestureEnabled', '-bool', 'NO'],
      ['EXDevMenuTouchGestureEnabled', '-bool', 'NO'],
    ]) {
      run(
        'xcrun',
        [
          'simctl',
          'spawn',
          device.id,
          'defaults',
          'write',
          BUNDLE_ID,
          key,
          type,
          value,
        ],
        { check: false }
      )
    }
    for (const service of [
      'location-always',
      'calendar',
      'contacts',
      'photos',
    ]) {
      run(
        'xcrun',
        ['simctl', 'privacy', device.id, 'grant', service, BUNDLE_ID],
        { check: false }
      )
    }
  } else {
    ensureReverse(state, device)
    const prefs = `<?xml version='1.0' encoding='utf-8' standalone='yes' ?><map><boolean name="isOnboardingFinished" value="true" /><boolean name="showsAtLaunch" value="false" /><boolean name="showFab" value="false" /><boolean name="motionGestureEnabled" value="false" /><boolean name="touchGestureEnabled" value="false" /></map>`
    // Without the network provider, Google Play services interrupts location
    // requests with a "Location Accuracy" consent dialog outside the app.
    run(
      'adb',
      [
        '-s',
        device.id,
        'shell',
        'settings',
        'put',
        'secure',
        'location_providers_allowed',
        '+network',
      ],
      { check: false }
    )
    run(
      'adb',
      [
        '-s',
        device.id,
        'shell',
        'settings',
        'put',
        'global',
        'assisted_gps_enabled',
        '1',
      ],
      { check: false }
    )
    const local = path.join(STATE_DIR, 'devmenu-prefs.xml')
    fs.writeFileSync(local, prefs)
    // A running app rewrites its prefs on exit, so stop it before writing.
    run('adb', ['-s', device.id, 'shell', 'am', 'force-stop', BUNDLE_ID], {
      check: false,
    })
    run(
      'adb',
      ['-s', device.id, 'push', local, '/data/local/tmp/ww-devmenu.xml'],
      { check: false }
    )
    run(
      'adb',
      [
        '-s',
        device.id,
        'shell',
        'run-as',
        BUNDLE_ID,
        'cp',
        '/data/local/tmp/ww-devmenu.xml',
        'shared_prefs/expo.modules.devmenu.sharedpreferences.xml',
      ],
      { check: false }
    )
  }
  // Always open this Metro through the dev-client link. A plain relaunch lets
  // the dev launcher auto-open its last project, which on Xcode 27 builds
  // leaves the native splash covering the app.
  const target =
    device.platform === 'ios'
      ? ['--platform', 'ios', '--udid', device.id]
      : ['--platform', 'android', '--serial', device.id]
  agentDevice([
    'open',
    BUNDLE_ID,
    devClientUrl(port),
    ...target,
    '--session',
    session,
    '--relaunch',
  ])
  for (let i = 0; i < 10 && !(await cdpTarget(state, device.platform)); i++)
    await sleep(2000)
  if (device.platform === 'ios' && !(await cdpTarget(state, device.platform))) {
    agentDevice(['alert', 'accept', '--session', session])
  }
  await waitForHarness(state, device.platform, 300_000)
}

/**
 * Adb reverse rules can vanish (adb restarts, other tools); reapply before
 * driving.
 */
function ensureReverse(state, device) {
  if (device.platform !== 'android') return
  for (const port of [state.metro?.port, state.api?.port].filter(Boolean)) {
    run('adb', ['-s', device.id, 'reverse', `tcp:${port}`, `tcp:${port}`], {
      check: false,
    })
  }
}

/** Re-attaches the run's agent-device session to the running app (no relaunch). */
function ensureSession(state, platform) {
  ensureReverse(state, state.devices[platform])
  agentDevice([
    'open',
    BUNDLE_ID,
    ...deviceArgs(state, platform, 'test'),
    '--session',
    sessionName(platform),
  ])
}

/**
 * Scripted runs (replay/test) select a device explicitly; session commands
 * don't.
 */
function deviceArgs(state, platform, command) {
  if (!['replay', 'test'].includes(command)) return []
  const device = state.devices[platform]
  return platform === 'ios'
    ? ['--platform', 'ios', '--udid', device.id]
    : ['--platform', 'android', '--serial', device.id]
}

function currentPlatform(state, flags) {
  if (flags.platform) return flags.platform
  const platforms = Object.keys(state.devices ?? {})
  if (platforms.length === 1) return platforms[0]
  if (!platforms.length) fail('Nothing is up; run ww-verify up first')
  fail(`Several platforms are up (${platforms.join(', ')}); pass --platform`)
}

function requireUp() {
  const state = readState()
  if (!state.metro || !state.devices)
    fail('Nothing is up; run ww-verify up first')
  return state
}

// ---------- evidence ----------

function screenshot(state, platform, label) {
  const device = state.devices[platform]
  const file = path.join(
    artifactsDir(state),
    `${Date.now()}-${platform}-${label.replace(/[^a-zA-Z0-9-]+/g, '-')}.png`
  )
  if (platform === 'ios')
    run('xcrun', ['simctl', 'io', device.id, 'screenshot', file], {
      check: false,
    })
  else
    fs.writeFileSync(
      file,
      run('adb', ['-s', device.id, 'exec-out', 'screencap', '-p'], {
        encoding: 'buffer',
      }).stdout
    )
  run('sips', ['-Z', '1400', file], { check: false })
  return path.relative(ROOT, file)
}

// ---------- commands ----------

const commands = {
  async up({ flags }) {
    const platform = flags.platform || 'ios'
    if (!['ios', 'android'].includes(platform))
      fail('--platform must be ios or android')
    const disk = freeDiskGb()
    if (disk < 8)
      fail(
        `Only ${disk} GB free; clean DerivedData/worktrees first (see AGENTS.md "Clean up large artifacts")`
      )
    fs.mkdirSync(STATE_DIR, { recursive: true })
    const state = readState()
    state.runId ??= runId()
    if (flags.api === 'local') {
      const { url, devBypass } = startLocalApi()
      state.api = {
        mode: 'local',
        url,
        port: Number(new URL(url).port),
        devBypass,
      }
    } else if (!state.api) {
      state.api = { mode: 'env', url: envApiUrl(), port: null }
      const parsed = new URL(state.api.url)
      if (['localhost', '127.0.0.1'].includes(parsed.hostname))
        state.api.port = Number(parsed.port || 80)
    }
    state.metro = await ensureMetro(
      state,
      state.api.mode === 'local' ? state.api : undefined
    )
    writeState(state)
    const device =
      platform === 'ios'
        ? ensureIosDevice(flags.ipad ? 'ipad' : 'iphone')
        : await ensureAndroidDevice()
    state.devices = { ...state.devices, [platform]: device }
    writeState(state)
    device.native = await ensureApp(device, flags, state.metro.port)
    state.devices[platform] = device
    writeState(state)
    await launch(state, device)
    if (flags.seed)
      await cdpEval(
        state,
        platform,
        `__WW_DEV__.seed(${JSON.stringify(flags.seed)})`
      )
    console.log(
      JSON.stringify(
        {
          platform,
          device: device.name,
          id: device.id,
          native: device.native,
          metroPort: state.metro.port,
          api: state.api,
          session: sessionName(platform),
          artifacts: path.relative(ROOT, artifactsDir(state)),
        },
        null,
        2
      )
    )
  },

  async doctor({ flags }) {
    const state = readState()
    const checks = []
    const check = (name, ok, detail) => checks.push({ name, ok, detail })
    const disk = freeDiskGb()
    check('disk', disk >= 8, `${disk} GB free`)
    check(
      'state',
      Boolean(state.metro),
      state.metro
        ? path.relative(ROOT, STATE_FILE)
        : 'missing; run ww-verify up'
    )
    if (state.metro) {
      const owner = portOwner(state.metro.port)
      check(
        'metro',
        (await metroRunning(state.metro.port)) && owner?.cwd === ROOT,
        `port ${state.metro.port}, served from ${owner?.cwd ?? 'nothing'}`
      )
    }
    if (state.api) {
      const health = await httpText(
        new URL('/health', state.api.url).toString()
      )
      check(
        'api',
        health.status === 200,
        `${state.api.mode} ${state.api.url} -> ${health.status} ${health.text.slice(0, 120)}`
      )
    }
    const platforms = flags.platform
      ? [flags.platform]
      : Object.keys(state.devices ?? {})
    for (const platform of platforms) {
      const device = state.devices?.[platform]
      if (!device) {
        check(`${platform}:device`, false, 'not up')
        continue
      }
      const owner = lockOwner(device.lockKey)
      check(
        `${platform}:lock`,
        owner?.worktree === ROOT,
        owner ? `held by ${owner.worktree}` : 'unlocked'
      )
      const booted =
        platform === 'ios'
          ? simctlDevices().find((d) => d.udid === device.id)?.state ===
            'Booted'
          : adbDevices().includes(device.id)
      check(`${platform}:booted`, booted, device.name)
      if (!booted) continue
      check(`${platform}:installed`, appInstalled(device), BUNDLE_ID)
      const installed = readJson(INSTALLS, {})[device.lockKey]?.fingerprint
      const current = await nativeFingerprint(platform)
      check(
        `${platform}:native`,
        installed === current,
        installed === current
          ? 'binary matches native fingerprint'
          : `installed ${installed ?? 'unknown'} != tree ${current}; run ww-verify up --platform ${platform}`
      )
      try {
        const summary = await cdpEval(
          state,
          platform,
          '__WW_DEV__.state()',
          8000
        )
        check(
          `${platform}:js`,
          summary.errors === 0,
          `route ${summary.route?.name ?? '?'}, ${summary.errors} captured JS errors`
        )
        if (state.api) {
          const expected = new URL(state.api.url).origin.replace(
            '//localhost:',
            '//127.0.0.1:'
          )
          const actual = String(summary.apiBase).replace(
            '//localhost:',
            '//127.0.0.1:'
          )
          check(
            `${platform}:api-base`,
            actual === expected,
            `bundle calls ${summary.apiBase}`
          )
        }
      } catch (error) {
        check(`${platform}:js`, false, error.message)
      }
    }
    for (const c of checks)
      console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name.padEnd(18)} ${c.detail}`)
    if (checks.some((c) => !c.ok)) process.exitCode = 1
  },

  async eval({ positional, flags }) {
    const state = requireUp()
    const result = await cdpEval(
      state,
      currentPlatform(state, flags),
      positional.join(' ')
    )
    console.log(JSON.stringify(result, null, 2))
  },

  async seed({ positional, flags }) {
    const state = requireUp()
    const platform = currentPlatform(state, flags)
    const name = positional[0]
    if (!name)
      fail('Usage: ww-verify seed <fresh|onboarded|publisher|pioneer|busy>')
    console.log(
      JSON.stringify(
        await cdpEval(
          state,
          platform,
          `__WW_DEV__.seed(${JSON.stringify(name)})`
        ),
        null,
        2
      )
    )
  },

  async flag({ positional, flags }) {
    const state = requireUp()
    const [name, value] = positional
    const parsed = value === 'on' ? true : value === 'off' ? false : undefined
    if (!name || !['on', 'off', 'clear'].includes(value))
      fail('Usage: ww-verify flag <buddies|notes-import> <on|off|clear>')
    await cdpEval(
      state,
      currentPlatform(state, flags),
      `__WW_DEV__.setFlag(${JSON.stringify(name)}, ${JSON.stringify(parsed)})`
    )
    console.log(`${name} = ${value}`)
  },

  async nav({ positional, flags }) {
    const state = requireUp()
    const [route, params] = positional
    if (!route) fail('Usage: ww-verify nav "<Route Name>" [json-params]')
    const result = await cdpEval(
      state,
      currentPlatform(state, flags),
      `__WW_DEV__.navigate(${JSON.stringify(route)}, ${params ?? 'undefined'})`
    )
    console.log(JSON.stringify(result))
  },

  async link({ positional, flags }) {
    const state = requireUp()
    const platform = currentPlatform(state, flags)
    const url = positional[0]
    if (!url) fail('Usage: ww-verify link <url>')
    const device = state.devices[platform]
    if (platform === 'ios') {
      run('xcrun', ['simctl', 'openurl', device.id, url])
      await sleep(1500)
      agentDevice(['alert', 'accept', '--session', sessionName(platform)])
    } else {
      run('adb', [
        '-s',
        device.id,
        'shell',
        'am',
        'start',
        '-a',
        'android.intent.action.VIEW',
        '-d',
        `'${url}'`,
        BUNDLE_ID,
      ])
    }
    await sleep(1500)
    console.log(
      JSON.stringify(await cdpEval(state, platform, '__WW_DEV__.state().route'))
    )
  },

  async shot({ positional, flags }) {
    const state = requireUp()
    console.log(
      screenshot(
        state,
        currentPlatform(state, flags),
        positional[0] || 'screen'
      )
    )
  },

  async errors({ flags }) {
    const state = requireUp()
    const platform = currentPlatform(state, flags)
    const errors = await cdpEval(state, platform, '__WW_DEV__.errors()')
    if (flags.clear) await cdpEval(state, platform, '__WW_DEV__.clearErrors()')
    console.log(JSON.stringify(errors, null, 2))
    if (errors.length && !flags.clear) process.exitCode = 1
  },

  async ad({ raw }) {
    // Forward agent-device arguments verbatim; only --platform is ours.
    const platformIndex = raw.indexOf('--platform')
    const platformFlag = platformIndex >= 0 ? raw[platformIndex + 1] : undefined
    const args =
      platformIndex >= 0
        ? raw.filter((_, i) => i !== platformIndex && i !== platformIndex + 1)
        : raw
    const state = requireUp()
    const platform = currentPlatform(state, { platform: platformFlag })
    if (!['open', 'close'].includes(args[0])) ensureSession(state, platform)
    const [bin, ...prefix] = agentDeviceBin()
    const result = spawnSync(
      bin,
      [
        ...prefix,
        ...args,
        ...deviceArgs(state, platform, args[0]),
        '--session',
        sessionName(platform),
      ],
      { stdio: 'inherit', env: toolEnv() }
    )
    process.exitCode = result.status ?? 1
  },

  async flow({ positional, flags }) {
    const state = requireUp()
    const platform = currentPlatform(state, flags)
    const files = positional.length
      ? positional
      : [path.join(ROOT, 'e2e/maestro')]
    const flows = files.flatMap((file) =>
      fs.statSync(file).isDirectory()
        ? fs
            .readdirSync(file)
            .filter((f) => f.endsWith('.yaml') && !f.startsWith('_'))
            .sort()
            .map((f) => path.join(file, f))
        : [file]
    )
    const outDir = artifactsDir(state)
    const results = []
    ensureSession(state, platform)
    for (const flow of flows) {
      const source = fs.readFileSync(flow, 'utf8')
      const seed = source.match(/^# seed: (\S+)/m)?.[1]
      if (seed)
        await cdpEval(
          state,
          platform,
          `__WW_DEV__.seed(${JSON.stringify(seed)})`
        )
      await cdpEval(state, platform, '__WW_DEV__.clearErrors()')
      const name = path.basename(flow, '.yaml')
      const { steps } = readFlow(source)
      const result = runSteps(steps, (args) =>
        agentDevice([...args, '--session', sessionName(platform)])
      )
      if (!result.ok) screenshot(state, platform, `flow-${name}-failed`)
      const jsErrors = await cdpEval(
        state,
        platform,
        '__WW_DEV__.errors()'
      ).catch((error) => [{ kind: 'harness', message: error.message }])
      // `# assert: <js>` lines read app state back after the UI steps.
      const asserts = [...source.matchAll(/^# assert: (.+)$/gm)].map(
        (m) => m[1]
      )
      const failedAsserts = []
      for (const expression of asserts) {
        const value = await cdpEval(state, platform, expression).catch(
          (error) => error.message
        )
        if (value !== true) failedAsserts.push({ expression, value })
      }
      const ok =
        result.ok && jsErrors.length === 0 && failedAsserts.length === 0
      results.push({ flow: name, ok, steps: result, jsErrors, failedAsserts })
      console.log(
        `${ok ? 'PASS' : 'FAIL'} ${platform} ${name}${jsErrors.length ? ` (${jsErrors.length} JS errors)` : ''}${failedAsserts.length ? ` (failed: ${failedAsserts.map((a) => a.expression).join('; ')})` : ''}`
      )
      if (!result.ok)
        console.log(
          `  step ${result.step}: ${result.command}\n  ${result.output.replace(/\n/g, '\n  ')}`
        )
    }
    writeJson(path.join(outDir, `${platform}-flows.json`), results)
    console.log(`evidence: ${path.relative(ROOT, outDir)}`)
    if (results.some((r) => !r.ok)) process.exitCode = 1
  },

  async monkey({ flags }) {
    const state = requireUp()
    const platform = currentPlatform(state, flags)
    ensureSession(state, platform)
    const { runMonkey } = await import('./monkey.mjs')
    const report = await runMonkey({
      platform,
      device: state.devices[platform],
      steps: Number(flags.steps ?? 120),
      seed: Number(flags.seed ?? Date.now() % 100000),
      scenario: flags.scenario ?? 'pioneer',
      eval: (expression, timeout) =>
        cdpEval(state, platform, expression, timeout),
      agentDevice: (args) =>
        agentDevice([...args, '--session', sessionName(platform)]),
      shot: (label) => screenshot(state, platform, label),
      relaunch: () => launch(state, state.devices[platform]),
      beforeForeground: () => ensureReverse(state, state.devices[platform]),
      run,
      outDir: artifactsDir(state),
      root: ROOT,
    })
    console.log(JSON.stringify(report.summary, null, 2))
    if (!report.summary.ok) process.exitCode = 1
  },

  async down({ flags }) {
    const state = readState()
    const platforms = flags.platform
      ? [flags.platform]
      : Object.keys(state.devices ?? {})
    for (const platform of platforms) {
      const device = state.devices?.[platform]
      if (!device) continue
      agentDevice(['close', '--session', sessionName(platform)])
      if (!flags['keep-device']) {
        if (platform === 'ios')
          run('xcrun', ['simctl', 'shutdown', device.id], { check: false })
        else run('adb', ['-s', device.id, 'emu', 'kill'], { check: false })
      }
      releaseLock(device.lockKey)
      delete state.devices[platform]
      log(`released ${device.name}`)
    }
    if (!Object.keys(state.devices ?? {}).length) {
      if (state.metro?.pid && pidAlive(state.metro.pid))
        stopProcessGroup(state.metro.pid)
      if (state.api?.mode === 'local')
        run('node', [path.join(apiDir(), 'scripts/verify/dev.mjs'), 'down'], {
          cwd: apiDir(),
          check: false,
        })
      const evidence = state.runId
        ? path.relative(ROOT, path.join(STATE_DIR, 'artifacts', state.runId))
        : null
      fs.rmSync(STATE_FILE, { force: true })
      log(`stopped Metro; evidence kept in ${evidence ?? '.verify/artifacts'}`)
    } else writeState(state)
  },

  async help() {
    console.log(`ww-verify <command> [--platform ios|android]

  up [--platform ios|android] [--ipad] [--api local] [--seed <scenario>]
     [--rebuild] [--accept-stale-native]   claim a device, start Metro, install, launch
  doctor                                   read-only health check (exit 1 on failure)
  seed <fresh|onboarded|publisher|pioneer|busy>
  eval '<js expression>'                   run JS in the app, print JSON
  flag <buddies|notes-import> <on|off|clear>
  nav "<Route Name>" ['{"json":"params"}']
  link <url>                               open a deep link (accepts the iOS prompt)
  ad <agent-device args...>                agent-device with this run's session
  shot <label>                             screenshot into .verify/artifacts/<run>
  errors [--clear]                         JS errors captured since launch
  flow [files or dirs]                     Maestro flows (default e2e/maestro)
  monkey [--steps 120] [--seed N] [--scenario pioneer]
  down [--platform p] [--keep-device]      release devices, stop Metro, keep evidence`)
  },
}

const [command = 'help', ...rest] = process.argv.slice(2)
if (!commands[command]) fail(`Unknown command "${command}"; run ww-verify help`)
commands[command]({ ...parseFlags(rest), raw: rest }).catch((error) =>
  fail(error.stack || error.message)
)
