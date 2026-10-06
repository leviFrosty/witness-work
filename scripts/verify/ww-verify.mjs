#!/usr/bin/env node
// Agent verification harness for WitnessWork. Usage and the proof standards
// live in .agents/skills/verify-witnesswork/SKILL.md; `ww-verify help` prints
// the command list.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readFlow, runSteps } from './flows.mjs'
import {
  CONFIG,
  HOME as GLOBAL_DIR,
  POLICY,
  RAM_GB,
  acquireBuild,
  claimLease,
  gc,
  heartbeat,
  killTree,
  readLeases,
  reapBuilds,
  release,
  releaseBuild,
  removeDirs,
  reservePort,
  setBuildGroup,
  snapshot,
  updateLeases,
  withMutex,
} from './leases.mjs'

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(
  /\/$/,
  ''
)
const STATE_DIR = path.join(ROOT, '.verify')
const STATE_FILE = path.join(STATE_DIR, 'state.json')
const BUILD_DIR = path.join(GLOBAL_DIR, 'builds')
const BUILD_INDEX = path.join(GLOBAL_DIR, 'builds.json')
const INSTALLS = path.join(GLOBAL_DIR, 'installs.json')

const BUNDLE_ID = 'com.leviwilkerson.jwtimedev'
const AGENT_DEVICE_VERSION = '0.21.12'
const METRO_WORKERS = process.env.WW_VERIFY_METRO_WORKERS || '2'
const GRADLE_WORKERS = process.env.WW_VERIFY_GRADLE_WORKERS || '2'
const EMULATOR_MEMORY_MB = 2048
const ANDROID_HOME =
  process.env.ANDROID_HOME || path.join(os.homedir(), 'Library/Android/sdk')
const ANDROID_AVD_HOME =
  process.env.ANDROID_AVD_HOME || path.join(os.homedir(), '.android/avd')
const KEEP_BUILDS = 3

const slugOf = (root) =>
  path
    .basename(root)
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase()

// ---------- small utilities ----------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Throws, so `finally` blocks (build slots, build dirs) still clean up; the
// top-level handler prints the message and exits 1.
class Failure extends Error {}
function fail(message) {
  throw new Failure(message)
}

function log(message) {
  console.error(`[ww-verify] ${message}`)
}

/** Logs a wait message when it changes, and at most once a minute otherwise. */
function waitLogger() {
  let last = ''
  let at = 0
  return (message) => {
    if (message === last && Date.now() - at < 60_000) return
    last = message
    at = Date.now()
    log(message)
  }
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

// ---------- device leases (scripts/verify/leases.mjs) ----------

const idleMin = (lease) => Math.round(lease.idleMs / 60_000)

function describeHolder(lease) {
  return `${path.basename(lease.worktree)} (${lease.legacy ? 'old harness' : `idle ${idleMin(lease)}m`})`
}

/** The device a lease points at; old-harness locks only carry the key. */
function leaseDevice(lease) {
  const android = lease.platform === 'android'
  const name =
    lease.deviceName ?? (android ? lease.key.replace(/^avd-/, '') : lease.key)
  const id = lease.deviceId ?? (android ? emulatorSerial(name) : lease.key)
  return {
    platform: lease.platform,
    kind: lease.kind,
    id,
    name,
    lockKey: lease.key,
  }
}

async function takeLease(platform, kind, flags) {
  const waitMin = Number(flags.wait ?? 30)
  const waitLog = waitLogger()
  const result = await claimLease(
    {
      worktree: ROOT,
      platform,
      kind,
      pool: platform === 'ios' ? () => iosPool(kind) : androidPool,
      create:
        platform === 'ios' ? (pool) => createIosDevice(kind, pool) : createAvd,
      busyPorts: () => new Set(listeningPorts().keys()),
    },
    {
      waitMs: waitMin * 60_000,
      beforeTry: reapExpired,
      onWait: (r) =>
        waitLog(
          `waiting for a ${platform} device (#${r.position} of ${r.queued} waiting): ${r.wait}${r.holders.length ? `; ${platform} leases held by ${r.holders.map(describeHolder).join(', ')}` : ''} (see wwv status)`
        ),
    }
  )
  if (result.lease) return result
  if (result.impossible)
    fail(
      `No ${platform} device can ever fit: ${result.wait}. Raise the budget or lower the WW_VERIFY_EST_* estimates (see wwv status).`
    )
  fail(
    `No ${platform} device after ${waitMin} min: ${result.wait}.${result.holders.length ? ` ${platform} leases held by ${result.holders.map(describeHolder).join(', ')}; idle leases expire after ${CONFIG.idleMin} min.` : ''} Run wwv status to see leases, builds and both queues.`
  )
}

let heartbeatTimer
function startHeartbeat() {
  heartbeatTimer ??= setInterval(() => {
    try {
      heartbeat(ROOT)
    } catch {
      // the next command retries
    }
  }, 5 * 60_000)
  heartbeatTimer.unref()
}

/** Fails unless this worktree still holds the platform's lease; refreshes it. */
function holdLease(state, platform) {
  const key = state.devices?.[platform]?.lockKey
  if (key && !heartbeat(ROOT).includes(key))
    fail(
      `This worktree no longer holds its ${platform} lease (${state.reapedReason ?? `expired after ${CONFIG.idleMin} min idle, or reaped`}); run ww-verify up --platform ${platform}`
    )
  startHeartbeat()
}

const simState = (udid) => simctlDevices().find((d) => d.udid === udid)?.state

/** Polls until the simulator leaves `states`; returns the state it settled in. */
function waitSimLeaves(udid, states, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  let state = simState(udid)
  while (states.includes(state) && Date.now() < deadline) {
    sleepSync(1000)
    state = simState(udid)
  }
  return state
}

const sleepSync = (ms) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

/**
 * Agent-device's XCUITest runner (`xcodebuild test-without-building ...
 * id=<UDID>`) can outlive `close` and keep the simulator half-booted. Kills it
 * by the exact UDID in its command line, never by name.
 */
function killIosRunner(udid) {
  const runners = () =>
    run('ps', ['-axww', '-o', 'pid=,command='], { check: false })
      .stdout.split('\n')
      .map((line) => line.trim().match(/^(\d+)\s+(.*)$/))
      .filter(
        (m) =>
          m &&
          /\bxcodebuild\b/.test(m[2]) &&
          new RegExp(`id=${udid}(?![0-9A-Fa-f-])`).test(m[2])
      )
      .map((m) => Number(m[1]))
  for (let i = 0; i < 5 && runners().length; i++) sleepSync(1000)
  for (const pid of runners()) {
    try {
      process.kill(pid, 'SIGTERM')
      log(`stopped agent-device runner ${pid} for ${udid}`)
    } catch {
      // already gone
    }
  }
}

/** Shuts down a harness device; never touches devices outside the pool. */
function shutdownDevice(device, { keepDevice = false } = {}) {
  if (device.platform === 'ios') {
    const sim = simctlDevices().find((d) => d.udid === device.id)
    if (!sim || !/^WW Verify /.test(sim.name)) return
    killIosRunner(device.id)
    if (keepDevice) return
    if (sim.state !== 'Shutdown')
      run('xcrun', ['simctl', 'shutdown', device.id], { check: false })
    // `simctl shutdown` returns while the device is still Booted, then
    // "Shutting Down"; a quick `up` would install onto a dying simulator.
    const state = waitSimLeaves(device.id, ['Booted', 'Shutting Down'])
    if (state !== 'Shutdown')
      log(`${device.name} is still ${state} after 60 s of shutting down`)
  } else if (keepDevice) return
  else if (AVD_PATTERN.test(device.name)) {
    const serial = runningAvds()[device.name]
    if (serial) run('adb', ['-s', serial, 'emu', 'kill'], { check: false })
  }
}

const worktreeState = (worktree) =>
  readJson(path.join(worktree, '.verify/state.json'), null)

function localApiInUse(except) {
  return readLeases().some(
    (l) =>
      !l.expired &&
      l.worktree !== except &&
      worktreeState(l.worktree)?.api?.mode === 'local'
  )
}

function stopLocalApi(worktree) {
  if (localApiInUse(worktree)) return
  run('node', [path.join(apiDir(), 'scripts/verify/dev.mjs'), 'down'], {
    cwd: apiDir(),
    check: false,
  })
}

/**
 * Stops another worktree's Metro (and local API) only when its state recorded
 * the pid and the port's listener runs from that worktree.
 */
function stopWorktreeServices(worktree, reason) {
  const file = path.join(worktree, '.verify/state.json')
  const state = worktreeState(worktree)
  if (!state) return
  const metro = state.metro
  if (
    metro?.pid &&
    CONFIG.metroPorts.includes(metro.port) &&
    pidAlive(metro.pid) &&
    portOwner(metro.port)?.cwd === worktree
  ) {
    stopProcessGroup(metro.pid)
    log(`stopped Metro ${metro.port} of ${path.basename(worktree)}`)
  }
  if (state.api?.mode === 'local') stopLocalApi(worktree)
  delete state.metro
  state.devices = {}
  state.reapedAt = Date.now()
  state.reapedReason = reason
  writeJson(file, state)
}

/** Closes the session, shuts the device down, and drops the lease. */
function releasePlatform(state, platform, flags) {
  const own = readLeases().filter(
    (l) => l.worktree === ROOT && l.platform === platform
  )
  const device = state.devices?.[platform] ?? (own[0] && leaseDevice(own[0]))
  if (!device) return
  agentDevice(['close', '--session', sessionName(platform)])
  shutdownDevice(device, { keepDevice: Boolean(flags['keep-device']) })
  release(ROOT, (l) => l.platform === platform || l.key === device.lockKey)
  delete state.devices?.[platform]
  log(`released ${device.name}`)
}

/** Releases every lease of this worktree and stops its Metro; keeps state. */
function standDown(state) {
  const platforms = new Set([
    ...Object.keys(state.devices ?? {}),
    ...readLeases()
      .filter((l) => l.worktree === ROOT)
      .map((l) => l.platform),
  ])
  for (const platform of platforms) releasePlatform(state, platform, {})
  stopOwnMetro(state)
  writeState(state)
}

function stopOwnMetro(state) {
  if (state.metro?.pid && pidAlive(state.metro.pid)) {
    stopProcessGroup(state.metro.pid)
    log(`stopped Metro ${state.metro.port}`)
  }
  delete state.metro
}

function printTable(title, headers, rows) {
  console.log(title)
  if (!rows.length) {
    console.log('  (none)\n')
    return
  }
  const all = [headers, ...rows.map((row) => row.map(String))]
  const widths = headers.map((_, i) => Math.max(...all.map((r) => r[i].length)))
  for (const row of all)
    console.log(
      `  ${row.map((cell, i) => cell.padEnd(widths[i])).join('  ')}`.trimEnd()
    )
  console.log('')
}

async function reapExpired() {
  await reapBuilds({ log })
  return gc(async (lease) => {
    const device = leaseDevice(lease)
    const gone = !fs.existsSync(lease.worktree)
    const reason = gone
      ? 'worktree deleted'
      : lease.legacy
        ? 'old lock over 24 h'
        : `idle ${idleMin(lease)} min, limit ${CONFIG.idleMin}`
    log(
      `reaping ${device.name} from ${path.basename(lease.worktree)} (${reason})`
    )
    agentDevice([
      'close',
      '--session',
      sessionName(lease.platform, lease.worktree),
    ])
    shutdownDevice(device)
    const others = readLeases().some(
      (l) => l.worktree === lease.worktree && l.key !== lease.key && !l.expired
    )
    if (!others && !gone) stopWorktreeServices(lease.worktree, reason)
  })
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

function sessionName(platform, root = ROOT) {
  return `wwv-${slugOf(root)}-${platform}`.slice(0, 60)
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

const iosPattern = (kind) =>
  new RegExp(`^WW Verify ${kind === 'ipad' ? 'iPad' : 'iPhone'} (\\d+)$`)

/** The fixed-size simulator pool for a kind (iphone | ipad). */
function iosPool(kind) {
  const pattern = iosPattern(kind)
  return simctlDevices()
    .filter((d) => pattern.test(d.name))
    .map((d) => ({
      key: d.udid,
      id: d.udid,
      name: d.name,
      n: Number(d.name.match(pattern)[1]),
    }))
    .sort((a, b) => a.n - b.n)
}

function createIosDevice(kind, pool) {
  const next = pool.length ? Math.max(...pool.map((d) => d.n)) + 1 : 1
  const runtime = newestIosRuntime()
  const name = `WW Verify ${kind === 'ipad' ? 'iPad' : 'iPhone'} ${next}`
  log(`creating simulator "${name}" (${runtime.name})`)
  const udid = run('xcrun', [
    'simctl',
    'create',
    name,
    pickDeviceType(runtime, kind),
    runtime.identifier,
  ]).stdout.trim()
  return { key: udid, id: udid, name, n: next }
}

function bootIos(device) {
  if (!simState(device.id))
    fail(`Simulator ${device.name} (${device.id}) no longer exists`)
  // A device still shutting down from the last `down` looks Booted, then
  // refuses installs with SimError 405; wait it out before booting again.
  const state = waitSimLeaves(device.id, ['Shutting Down'])
  if (state !== 'Booted') {
    log(`booting ${device.name}`)
    run('xcrun', ['simctl', 'boot', device.id], { check: false })
  }
  run('xcrun', ['simctl', 'bootstatus', device.id, '-b'], {
    timeout: 300_000,
  })
}

function iosAppInstalled(udid) {
  return (
    run('xcrun', ['simctl', 'get_app_container', udid, BUNDLE_ID], {
      check: false,
    }).status === 0
  )
}

/** Resolves symlinks (Xcode records /private/tmp for /tmp); keeps missing paths. */
function realPath(p) {
  try {
    return fs.realpathSync(p)
  } catch {
    return path.join(realPath(path.dirname(p)), path.basename(p))
  }
}

// Builds use a worktree-local DerivedData, so ownership and cleanup are just
// this folder (and android/app/build).
const DERIVED_DATA = path.join(STATE_DIR, 'DerivedData')
const IOS_PRODUCT = path.join(
  DERIVED_DATA,
  'Build/Products/Debug-iphonesimulator/WitnessWorkDev.app'
)
const ANDROID_BUILD = path.join(ROOT, 'android/app/build')
const ANDROID_PRODUCT = path.join(
  ANDROID_BUILD,
  'outputs/apk/debug/app-debug.apk'
)
const buildDirs = (platform) =>
  platform === 'ios' ? [DERIVED_DATA] : [ANDROID_BUILD]

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

const AVD_PATTERN = /^ww-verify-(\d+)$/
const avdNumber = (name) => Number(name.match(AVD_PATTERN)[1])
const emulatorSerial = (name) => `emulator-${5580 + 2 * (avdNumber(name) - 1)}`

/** The fixed-size `ww-verify-N` AVD pool. */
function androidPool() {
  return run('emulator', ['-list-avds'], { check: false })
    .stdout.split('\n')
    .map((s) => s.trim())
    .filter((s) => AVD_PATTERN.test(s))
    .map((name) => ({
      key: `avd-${name}`,
      id: emulatorSerial(name),
      name,
      n: avdNumber(name),
    }))
    .sort((a, b) => a.n - b.n)
}

function createAvd(pool) {
  const next = pool.length ? Math.max(...pool.map((d) => d.n)) + 1 : 1
  const name = `ww-verify-${next}`
  log(`creating emulator ${name} (needs ~6 GB disk)`)
  run(
    'avdmanager',
    ['create', 'avd', '-n', name, '-k', newestSystemImage(), '-d', 'pixel_8'],
    { input: 'no\n' }
  )
  const config = path.join(ANDROID_AVD_HOME, `${name}.avd/config.ini`)
  const lines = fs
    .readFileSync(config, 'utf8')
    .split('\n')
    .filter((line) => !line.startsWith('hw.ramSize='))
  fs.writeFileSync(
    config,
    [...lines, `hw.ramSize=${EMULATOR_MEMORY_MB}`].join('\n')
  )
  return { key: `avd-${name}`, id: emulatorSerial(name), name, n: next }
}

/** Boots the leased AVD headless and lean; returns its adb serial. */
async function bootAndroid(device) {
  const name = device.name
  let serial = runningAvds()[name]
  if (!serial) {
    const port = 5580 + 2 * (avdNumber(name) - 1)
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
        '-memory',
        String(EMULATOR_MEMORY_MB),
        '-cores',
        '2',
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
  return serial
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

/**
 * Copies the artifact to a temp path, then renames it into the cache and
 * updates the index under the machine mutex.
 */
function cacheBuild(platform, fingerprint, artifact) {
  assertDevArtifact(artifact)
  fs.mkdirSync(BUILD_DIR, { recursive: true })
  const ext = platform === 'ios' ? 'app' : 'apk'
  const target = path.join(BUILD_DIR, `${platform}-${fingerprint}.${ext}`)
  const tmp = `${target}.tmp-${process.pid}`
  fs.rmSync(tmp, { recursive: true, force: true })
  run('ditto', [artifact, tmp])
  withMutex(() => {
    const old = `${target}.old-${process.pid}`
    if (fs.existsSync(target)) fs.renameSync(target, old)
    fs.renameSync(tmp, target)
    fs.rmSync(old, { recursive: true, force: true })
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
  })
  return target
}

/** Frees this worktree's build output (after caching, or after a failure). */
function removeBuildDirs(platform) {
  removeDirs(buildDirs(platform), (message) =>
    log(`${message} (keep build dirs with --keep-build-dirs)`)
  )
}

/** The bundle id (iOS) or application id (Android) an artifact was built with. */
function artifactId(artifact) {
  if (artifact.endsWith('.app'))
    return run('plutil', [
      '-extract',
      'CFBundleIdentifier',
      'raw',
      path.join(artifact, 'Info.plist'),
    ]).stdout.trim()
  const tools = path.join(ANDROID_HOME, 'build-tools')
  const version = fs.existsSync(tools)
    ? fs
        .readdirSync(tools)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .pop()
    : undefined
  if (!version) fail(`No Android build-tools in ${tools} to read ${artifact}`)
  return run(path.join(tools, version, 'aapt2'), [
    'dump',
    'packagename',
    artifact,
  ]).stdout.trim()
}

/** Never cache or install anything but the development variant. */
export function assertDevArtifact(artifact) {
  const id = artifactId(artifact)
  if (id !== BUNDLE_ID)
    fail(
      `${path.basename(artifact)} is ${id || 'unidentified'}, not ${BUNDLE_ID}; refusing to cache or install a non-development build`
    )
}

/**
 * The build steps; run by `_build` inside the detached build process group,
 * never against a device (the artifact is installed after a lease).
 */
function buildSteps(platform) {
  const env = (variant) => [
    'pnpm',
    'exec',
    'node',
    'scripts/with-local-env.mjs',
    'development',
    variant,
    '--',
  ]
  if (platform === 'ios')
    return [
      // A clean development prebuild: without APP_VARIANT=development,
      // app.config.ts builds the production app, and a stale ios/ would miss
      // config changes the fingerprint saw.
      [...env('ios'), 'pnpm', 'run', 'prebuild'],
      [
        ...env('ios'),
        'xcodebuild',
        '-workspace',
        'ios/WitnessWorkDev.xcworkspace',
        '-scheme',
        'WitnessWorkDev',
        '-configuration',
        'Debug',
        '-destination',
        'generic/platform=iOS Simulator',
        '-derivedDataPath',
        DERIVED_DATA,
        `ARCHS=${os.arch() === 'arm64' ? 'arm64' : 'x86_64'}`,
        'ONLY_ACTIVE_ARCH=YES',
        'COMPILER_INDEX_STORE_ENABLE=NO',
        'build',
      ],
    ]
  return [
    [
      ...env('android'),
      'expo',
      'prebuild',
      '--platform',
      'android',
      '--no-install',
    ],
    [
      ...env('android'),
      path.join(ROOT, 'android/gradlew'),
      '-p',
      'android',
      ':app:assembleDebug',
      '--no-daemon',
      `--max-workers=${GRADLE_WORKERS}`,
      `-PreactNativeArchitectures=${os.arch() === 'arm64' ? 'arm64-v8a' : 'x86_64'}`,
    ],
  ]
}

function buildEnv(platform) {
  return {
    ...toolEnv(),
    // with-local-env keeps POSTHOG_DISABLE_UPLOAD: belt and braces, since a
    // development config never adds PostHog's upload phases.
    POSTHOG_DISABLE_UPLOAD: 'true',
    ...(platform === 'android' && {
      // No resident Gradle or Kotlin daemon (~3 GB) after the build.
      GRADLE_OPTS: [
        process.env.GRADLE_OPTS,
        `-Dorg.gradle.workers.max=${GRADLE_WORKERS}`,
        '-Dorg.gradle.daemon=false',
        '-Dorg.gradle.project.kotlin.compiler.execution.strategy=in-process',
      ]
        .filter(Boolean)
        .join(' '),
    }),
  }
}

// Set while this `up` runs a build, so a signal can take the group down too.
let buildGroup = null

/**
 * Runs the build in its own detached process group and records the group with
 * the build slot. If this `up` dies, the reaper (`gc`, or the next `up`) kills
 * the orphaned group and removes its build dirs.
 */
async function buildNative(platform) {
  const logPath = path.join(STATE_DIR, `build-${platform}.log`)
  log(
    `building ${platform} dev client (several minutes); log: ${path.relative(ROOT, logPath)}`
  )
  if (
    platform === 'ios' &&
    fs.existsSync(path.join(ROOT, 'ios')) &&
    !fs.existsSync(path.join(ROOT, 'ios/WitnessWorkDev.xcworkspace'))
  )
    fail(
      'ios/ holds a non-development project (no WitnessWorkDev.xcworkspace). Delete ios/ and rerun up; the harness never overwrites another variant'
    )
  const out = fs.openSync(logPath, 'w')
  const child = spawn(
    process.execPath,
    [fileURLToPath(import.meta.url), '_build', platform, '--worktree', ROOT],
    {
      cwd: ROOT,
      detached: true,
      stdio: ['ignore', out, out],
      env: buildEnv(platform),
    }
  )
  buildGroup = child.pid
  setBuildGroup(child.pid, buildDirs(platform))
  const status = await new Promise((resolve) => {
    child.on('exit', (code, signal) => resolve(signal ? 1 : code))
    child.on('error', () => resolve(1))
  })
  // Anything the steps left behind goes with the build.
  killTree(child.pid)
  buildGroup = null
  if (status !== 0) fail(`${platform} build failed; tail ${logPath}`)
  const artifact = platform === 'ios' ? IOS_PRODUCT : ANDROID_PRODUCT
  if (!fs.existsSync(artifact))
    fail(`Build finished but ${path.relative(ROOT, artifact)} is missing`)
  return artifact
}

/** Installs a cached dev artifact; a dying simulator gets one more try. */
function install(device, artifact) {
  assertDevArtifact(artifact)
  log(`installing ${path.basename(artifact)} on ${device.name}`)
  if (device.platform === 'android') {
    run('adb', ['-s', device.id, 'install', '-r', '-g', artifact], {
      timeout: 300_000,
    })
    return
  }
  try {
    run('xcrun', ['simctl', 'install', device.id, artifact])
  } catch (error) {
    if (!/code=405/.test(error.message)) throw error
    log(`${device.name} was not ready (SimError 405); booting it and retrying`)
    bootIos(device)
    run('xcrun', ['simctl', 'install', device.id, artifact])
  }
}

function appInstalled(device) {
  return device.platform === 'ios'
    ? iosAppInstalled(device.id)
    : androidAppInstalled(device.id)
}

function sha256(files) {
  const hash = crypto.createHash('sha256')
  for (const file of files) hash.update(fs.readFileSync(file))
  return hash.digest('hex')
}

/** The iOS app's main executable plus its debug dylib (where the code is). */
function appBinaries(app) {
  const exe = run('plutil', [
    '-extract',
    'CFBundleExecutable',
    'raw',
    path.join(app, 'Info.plist'),
  ]).stdout.trim()
  return [exe, `${exe}.debug.dylib`]
    .map((f) => path.join(app, f))
    .filter((f) => fs.existsSync(f))
}

/** Identifies an artifact's code, to compare with what a device runs. */
function artifactHash(artifact) {
  return artifact.endsWith('.app')
    ? sha256(appBinaries(artifact))
    : sha256([artifact])
}

/** The same hash for what is installed on the device, or null. */
function installedHash(device) {
  if (device.platform === 'ios') {
    const app = run(
      'xcrun',
      ['simctl', 'get_app_container', device.id, BUNDLE_ID, 'app'],
      { check: false }
    ).stdout.trim()
    return app && fs.existsSync(app) ? sha256(appBinaries(app)) : null
  }
  const apk = run('adb', ['-s', device.id, 'shell', 'pm', 'path', BUNDLE_ID], {
    check: false,
  })
    .stdout.split('\n')
    .map((l) => l.trim().replace(/^package:/, ''))
    .find((l) => l.endsWith('base.apk'))
  if (!apk) return null
  return (
    run('adb', ['-s', device.id, 'shell', 'sha256sum', apk], {
      check: false,
    }).stdout.split(/\s+/)[0] || null
  )
}

function updateInstalls(fn) {
  withMutex(() => {
    const installs = readJson(INSTALLS, {})
    fn(installs)
    writeJson(INSTALLS, installs)
  })
}

/**
 * Resolves the artifact for this tree's native fingerprint before any device is
 * leased: the cache, or a build under a machine-wide build slot. A build waiter
 * holds no lease, so two worktrees waiting on each other's memory can't
 * deadlock.
 */
async function resolveNative(state, platform, flags) {
  if (flags['accept-stale-native']) return { stale: true }
  const fingerprint = await nativeFingerprint(platform)
  const cached = () =>
    flags.rebuild ? null : cachedBuild(platform, fingerprint)
  if (cached()) return { fingerprint, artifact: cached().path }
  const waitMs = Number(flags.wait ?? 30) * 60_000
  const waitLog = waitLogger()
  const options = { worktree: ROOT, platform, fingerprint }
  const handlers = {
    ready: cached,
    onWait: (r) =>
      waitLog(
        `waiting to build ${platform} ${fingerprint.slice(0, 12)} (#${r.position} of ${r.queued} build waiters, holding no device): ${r.wait} (see wwv status)`
      ),
  }
  // Keep this worktree's devices only if the build can start right now.
  let slot = await acquireBuild(options, { ...handlers, waitMs: 0 })
  if (!slot.ok && !slot.cached && !slot.impossible) {
    if (readLeases().some((l) => l.worktree === ROOT && !l.expired)) {
      log(
        `releasing this worktree's devices and Metro while it waits to build (a build waiter holds no lease); up leases again afterwards`
      )
      standDown(state)
    }
    slot = await acquireBuild(options, { ...handlers, waitMs })
  }
  if (slot.cached) {
    log('another worktree just built this fingerprint; reusing it')
    return { fingerprint, artifact: slot.cached.path }
  }
  if (!slot.ok)
    fail(
      `Could not start a ${platform} build${slot.impossible ? '' : ` after ${flags.wait ?? 30} min`}: ${slot.wait}. Run wwv status to see who holds the slot or memory; wait and rerun up, or pass --wait <minutes>.`
    )
  try {
    const hit = cached()
    if (hit) {
      log('another worktree just built this fingerprint; reusing it')
      return { fingerprint, artifact: hit.path }
    }
    const artifact = await buildNative(platform)
    return {
      fingerprint,
      artifact: cacheBuild(platform, fingerprint, artifact),
    }
  } finally {
    releaseBuild()
    // Also after a failure: a failed build leaves several GB of intermediates.
    if (!flags['keep-build-dirs']) removeBuildDirs(platform)
  }
}

/** The newest artifact on hand, for --accept-stale-native. */
function staleArtifact(platform) {
  const local = platform === 'ios' ? IOS_PRODUCT : ANDROID_PRODUCT
  if (fs.existsSync(local)) return local
  return Object.entries(readJson(BUILD_INDEX, {}))
    .filter(
      ([key, e]) => key.startsWith(`${platform}-`) && fs.existsSync(e.path)
    )
    .sort((a, b) => b[1].builtAt - a[1].builtAt)[0]?.[1].path
}

/**
 * Installs the resolved artifact unless the device already runs exactly that
 * binary. The install record is cleared first and written only after a
 * successful install, so it never vouches for a binary it didn't put there.
 */
function ensureApp(device, native, flags) {
  const key = device.lockKey
  if (native.stale) {
    if (!appInstalled(device)) {
      const fallback = staleArtifact(device.platform)
      if (!fallback)
        fail(
          'No installed or built app to accept; drop --accept-stale-native to build'
        )
      updateInstalls((i) => delete i[key])
      install(device, fallback)
    }
    updateInstalls(
      (i) => (i[key] = { fingerprint: 'unverified', at: Date.now() })
    )
    return 'UNVERIFIED (--accept-stale-native)'
  }
  const hash = artifactHash(native.artifact)
  const record = readJson(INSTALLS, {})[key]
  if (
    !flags.rebuild &&
    record?.fingerprint === native.fingerprint &&
    record.hash === hash &&
    installedHash(device) === hash
  )
    return 'verified'
  installRecorded(
    key,
    { ...native, hash },
    {
      install: () => install(device, native.artifact),
      installedHash: () => installedHash(device),
      name: device.name,
    }
  )
  return 'verified'
}

/**
 * Clears the device's install record, installs, checks the device now runs the
 * artifact's binary, and only then records the fingerprint.
 */
export function installRecorded(key, native, io) {
  updateInstalls((i) => delete i[key])
  io.install()
  if (io.installedHash() !== native.hash)
    fail(
      `${io.name} does not run the binary just installed (${path.basename(native.artifact)}); run wwv down, then wwv up`
    )
  updateInstalls(
    (i) =>
      (i[key] = {
        fingerprint: native.fingerprint,
        hash: native.hash,
        artifact: native.artifact,
        at: Date.now(),
      })
  )
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

/** Listening ports in the Metro range, port -> pid (one lsof call). */
function listeningPorts() {
  const range = `${CONFIG.metroPorts[0]}-${CONFIG.metroPorts.at(-1)}`
  const out = run('lsof', ['-nP', `-iTCP:${range}`, '-sTCP:LISTEN', '-Fpn'], {
    check: false,
  }).stdout
  const ports = new Map()
  let pid
  for (const line of out.split('\n')) {
    if (line[0] === 'p') pid = Number(line.slice(1))
    else if (line[0] === 'n') ports.set(Number(line.split(':').pop()), pid)
  }
  return ports
}

/**
 * Runs this worktree's Metro on its leased port. If another process wins the
 * port, it moves to a fresh reservation instead of adopting that server.
 */
async function ensureMetro(state, api, leasePort) {
  const apiUrl = api?.url
  const current = state.metro
  if (
    current &&
    pidAlive(current.pid) &&
    (await metroRunning(current.port)) &&
    portOwner(current.port)?.cwd === ROOT &&
    (current.apiUrl ?? undefined) === apiUrl
  ) {
    if (current.port !== leasePort)
      updateLeases(ROOT, { metroPort: current.port })
    return current
  }
  if (current && pidAlive(current.pid)) stopProcessGroup(current.pid)
  const tried = []
  let port = leasePort
  while (port && tried.length < 5) {
    const started = await startMetro(port, api)
    if (started) return started
    tried.push(port)
    port = reservePort(ROOT, tried, () => new Set(listeningPorts().keys()))
    if (port) log(`port ${tried.at(-1)} is taken; moving Metro to ${port}`)
  }
  fail(`No free Metro port (tried ${tried.join(', ')}); see ww-verify status`)
}

async function startMetro(port, api) {
  if (portOwner(port)) return null
  const apiUrl = api?.url
  const logPath = path.join(STATE_DIR, 'metro.log')
  const out = fs.openSync(logPath, 'w')
  const env = { ...toolEnv(), EXPO_NO_TELEMETRY: '1' }
  delete env.CI
  if (apiUrl) {
    env.WW_VERIFY_API_BASE_URL = apiUrl
    env.WW_VERIFY_API_DEV_BYPASS = api.devBypass ?? ''
  }
  log(`starting Metro on ${port} (${METRO_WORKERS} workers)`)
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
      '--max-workers',
      METRO_WORKERS,
    ],
    { cwd: ROOT, detached: true, stdio: ['ignore', out, out], env }
  )
  child.unref()
  for (let i = 0; !(await metroRunning(port)); i++) {
    if (!pidAlive(child.pid)) {
      if (portOwner(port)) return null
      fail(`Metro exited; tail ${logPath}`)
    }
    if (i > 90) fail(`Metro did not start; tail ${logPath}`)
    await sleep(1000)
  }
  // Another worktree's Metro may have bound the port first.
  if (portOwner(port)?.cwd !== ROOT) {
    stopProcessGroup(child.pid)
    return null
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

/** Resolves the platform and refreshes (or demands) this worktree's lease. */
function currentPlatform(state, flags) {
  const platforms = Object.keys(state.devices ?? {})
  const platform =
    flags.platform ?? (platforms.length === 1 ? platforms[0] : undefined)
  if (!platform && !platforms.length)
    fail('Nothing is up; run ww-verify up first')
  if (!platform)
    fail(`Several platforms are up (${platforms.join(', ')}); pass --platform`)
  holdLease(state, platform)
  return platform
}

function requireUp() {
  const state = readState()
  if (!state.metro || !state.devices)
    fail(
      state.reapedAt
        ? `This worktree's leases were reaped (${state.reapedReason ?? `idle over ${CONFIG.idleMin} min`}); run ww-verify up`
        : 'Nothing is up; run ww-verify up first'
    )
  return state
}

// ---------- evidence ----------

/**
 * Saves a screenshot into the run's artifacts and returns its repo-relative
 * path, or null (with the reason logged) when the device gave no image. The
 * capture lands in a temporary folder first: on iOS the file is written by
 * CoreSimulator, which macOS bars from volumes it has no access to, such as an
 * external drive holding the worktree ("Operation not permitted").
 */
function screenshot(state, platform, label) {
  const device = state.devices[platform]
  const name = `${Date.now()}-${platform}-${label.replace(/[^a-zA-Z0-9-]+/g, '-')}.png`
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-verify-shot-'))
  const capture = path.join(tmp, name)
  try {
    const result =
      platform === 'ios'
        ? run('xcrun', ['simctl', 'io', device.id, 'screenshot', capture], {
            check: false,
          })
        : run('adb', ['-s', device.id, 'exec-out', 'screencap', '-p'], {
            encoding: 'buffer',
            check: false,
          })
    if (platform === 'android' && result.status === 0 && result.stdout?.length)
      fs.writeFileSync(capture, result.stdout)
    if (result.status !== 0 || !fs.existsSync(capture)) {
      const reason = String(result.stderr || result.stdout || '').trim()
      log(
        `screenshot failed (${result.status}): ${reason.split('\n').slice(-3).join(' ') || 'no image'}`
      )
      return null
    }
    run('sips', ['-Z', '1400', capture], { check: false })
    const file = path.join(artifactsDir(state), name)
    fs.copyFileSync(capture, file)
    return path.relative(ROOT, file)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

/**
 * `ad record start|stop` on iOS. CoreSimulator writes the video itself and
 * can't write to every volume (an external drive holding the worktree fails
 * with "Operation not permitted"), so it records to a temporary file that
 * `record stop` copies to the path asked for, or into the run's artifacts.
 * Other commands, and Android, pass through untouched.
 */
function iosRecording(state, platform, args) {
  if (platform !== 'ios' || args[0] !== 'record') return null
  if (args[1] === 'start') {
    const asked = args[2] && !args[2].startsWith('-') ? args[2] : null
    const dest = asked
      ? path.resolve(asked)
      : path.join(artifactsDir(state), `${Date.now()}-ios-recording.mp4`)
    const tmp = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ww-verify-record-')),
      path.basename(dest)
    )
    return {
      args: ['record', 'start', tmp, ...args.slice(asked ? 3 : 2)],
      after: (ok) => {
        if (!ok) return fs.rmSync(path.dirname(tmp), { recursive: true })
        writeState({ ...readState(), recording: { tmp, dest } })
      },
    }
  }
  const pending = state.recording
  if (args[1] !== 'stop' || !pending) return null
  return {
    args,
    after: () => {
      const next = readState()
      delete next.recording
      writeState(next)
      if (fs.existsSync(pending.tmp)) {
        fs.mkdirSync(path.dirname(pending.dest), { recursive: true })
        fs.copyFileSync(pending.tmp, pending.dest)
        log(`recording saved to ${path.relative(ROOT, pending.dest)}`)
      } else log('recording stopped, but no video was written')
      fs.rmSync(path.dirname(pending.tmp), { recursive: true, force: true })
    },
  }
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
    delete state.reapedAt
    delete state.reapedReason
    const kind =
      platform === 'ios' ? (flags.ipad ? 'ipad' : 'iphone') : 'emulator'
    heartbeat(ROOT) // an idle agent coming back keeps its device
    await reapExpired()
    // Switching iPhone <-> iPad: hand back the other kind's lease first.
    const held = readLeases().find(
      (l) => l.worktree === ROOT && l.platform === platform && !l.expired
    )
    if (held?.kind && held.kind !== kind) releasePlatform(state, platform, {})

    // What this `up` took, so a failure or a signal hands it back.
    const took = { lease: null, metroPid: null }
    let done = false
    const cleanup = () => {
      if (done) return
      done = true
      if (buildGroup) {
        killTree(buildGroup)
        releaseBuild()
        if (!flags['keep-build-dirs']) removeBuildDirs(platform)
      }
      const undone = []
      if (took.lease) {
        releasePlatform(state, platform, {})
        undone.push(`released ${took.lease.deviceName}`)
      }
      if (
        took.metroPid &&
        state.metro?.pid === took.metroPid &&
        !readLeases().some((l) => l.worktree === ROOT)
      ) {
        stopOwnMetro(state)
        undone.push('stopped the Metro it started')
      }
      writeState(state)
      return undone
    }
    const onSignal = (signal) => {
      log(`${signal}: cleaning up`)
      cleanup()
      process.exit(130)
    }
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'])
      process.on(signal, onSignal)

    let device
    try {
      // Resolve (or build) the native artifact before leasing: a build needs
      // no device, and a build waiter must hold none.
      const native = await resolveNative(state, platform, flags)
      const claim = await takeLease(platform, kind, flags)
      if (!claim.existing) took.lease = claim.lease
      startHeartbeat()
      device = leaseDevice(claim.lease)
      state.devices = { ...state.devices, [platform]: device }
      writeState(state)
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
      const before = state.metro?.pid
      state.metro = await ensureMetro(
        state,
        state.api.mode === 'local' ? state.api : undefined,
        claim.lease.metroPort
      )
      if (state.metro.pid !== before) took.metroPid = state.metro.pid
      writeState(state)
      if (platform === 'ios') bootIos(device)
      else {
        device.id = await bootAndroid(device)
        updateLeases(ROOT, { deviceId: device.id }, [device.lockKey])
      }
      writeState(state)
      device.native = ensureApp(device, native, flags)
      state.devices[platform] = device
      writeState(state)
      await launch(state, device)
      if (flags.seed)
        await cdpEval(
          state,
          platform,
          `__WW_DEV__.seed(${JSON.stringify(flags.seed)})`
        )
      done = true
    } catch (error) {
      const undone = cleanup() ?? []
      const message = error instanceof Failure ? error.message : error.stack
      fail(
        `${message}\nup failed${undone.length ? `; ${undone.join(' and ')}` : ''}. Next: fix the cause above (or wait, pass --wait <minutes>, or keep working without a device) and rerun wwv up; wwv down drops everything this worktree still holds.`
      )
    } finally {
      for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'])
        process.off(signal, onSignal)
    }
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

  // Internal: the build steps, run detached in their own process group.
  async _build({ positional }) {
    const platform = positional[0]
    for (const [cmd, ...args] of buildSteps(platform)) {
      console.log(`$ ${cmd} ${args.join(' ')}`)
      const result = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' })
      if (result.status !== 0) process.exit(result.status ?? 1)
    }
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
      const lease = readLeases().find((l) => l.key === device.lockKey)
      check(
        `${platform}:lease`,
        lease?.worktree === ROOT && !lease.expired,
        !lease
          ? 'no lease; run ww-verify up'
          : lease.worktree !== ROOT
            ? `held by ${lease.worktree}`
            : `held by this worktree, idle ${idleMin(lease)} of ${CONFIG.idleMin} min${lease.expired ? ' (expired)' : ''}`
      )
      const booted =
        platform === 'ios'
          ? simctlDevices().find((d) => d.udid === device.id)?.state ===
            'Booted'
          : adbDevices().includes(device.id)
      check(`${platform}:booted`, booted, device.name)
      if (!booted) continue
      check(`${platform}:installed`, appInstalled(device), BUNDLE_ID)
      const record = readJson(INSTALLS, {})[device.lockKey]
      const installed = record?.fingerprint
      const current = await nativeFingerprint(platform)
      // The record must also match the binary on the device: a build or
      // install outside this harness can replace it.
      const onDevice = record?.hash ? installedHash(device) : null
      const ok =
        installed === current &&
        Boolean(record?.hash) &&
        onDevice === record.hash
      check(
        `${platform}:native`,
        ok,
        ok
          ? 'installed binary is the cached build for this native fingerprint'
          : installed !== current
            ? `installed ${installed ?? 'unknown'} != tree ${current}; run ww-verify up --platform ${platform}`
            : `the binary on ${device.name} is not the one up installed; run ww-verify up --platform ${platform}`
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
    const file = screenshot(
      state,
      currentPlatform(state, flags),
      positional[0] || 'screen'
    )
    if (!file) fail('No screenshot saved; see the reason above')
    console.log(file)
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
    const recording = iosRecording(state, platform, args)
    const [bin, ...prefix] = agentDeviceBin()
    const result = spawnSync(
      bin,
      [
        ...prefix,
        ...(recording?.args ?? args),
        ...deviceArgs(state, platform, args[0]),
        '--session',
        sessionName(platform),
      ],
      { stdio: 'inherit', env: toolEnv() }
    )
    process.exitCode = result.status ?? 1
    recording?.after(result.status === 0)
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
    const own = readLeases().filter((l) => l.worktree === ROOT)
    const platforms = flags.platform
      ? [flags.platform]
      : [
          ...new Set([
            ...Object.keys(state.devices ?? {}),
            ...own.map((l) => l.platform),
          ]),
        ]
    for (const platform of platforms) releasePlatform(state, platform, flags)
    if (readLeases().some((l) => l.worktree === ROOT)) {
      writeState(state)
      return
    }
    if (state.metro?.pid && pidAlive(state.metro.pid))
      stopProcessGroup(state.metro.pid)
    if (state.api?.mode === 'local') stopLocalApi(ROOT)
    const evidence = state.runId
      ? path.relative(ROOT, path.join(STATE_DIR, 'artifacts', state.runId))
      : null
    fs.rmSync(STATE_FILE, { force: true })
    log(`stopped Metro; evidence kept in ${evidence ?? '.verify/artifacts'}`)
  },

  async gc() {
    const builds = await reapBuilds({ log })
    const reaped = await reapExpired()
    const lines = [
      ...builds.map(
        (b) =>
          `reaped orphaned ${b.platform} build of ${b.worktree} (process group ${b.pgid ?? 'none'})`
      ),
      ...reaped.map((l) => `reaped ${leaseDevice(l).name} (${l.worktree})`),
    ]
    console.log(lines.length ? lines.join('\n') : 'nothing expired')
  },

  async status() {
    const { leases, builds, waiters, buildWaiters, usedGb } = snapshot()
    const names = Object.fromEntries(
      simctlDevices().map((d) => [d.udid, d.name])
    )
    const ago = (ms) => `${Math.round((Date.now() - ms) / 60_000)}m`
    console.log(`memory ${usedGb} / ${CONFIG.budgetGb} GB budgeted\n`)
    const policy = {
      WW_VERIFY_MEMORY_BUDGET_GB: CONFIG.budgetGb,
      WW_VERIFY_MAX_IOS: CONFIG.max.ios,
      WW_VERIFY_MAX_ANDROID: CONFIG.max.android,
      WW_VERIFY_MAX_BUILDS: CONFIG.maxBuilds,
      WW_VERIFY_LEASE_IDLE_MIN: CONFIG.idleMin,
      WW_VERIFY_EST_IOS_GB: CONFIG.est.ios,
      WW_VERIFY_EST_ANDROID_GB: CONFIG.est.android,
      WW_VERIFY_EST_METRO_GB: CONFIG.est.metro,
      WW_VERIFY_EST_IOS_BUILD_GB: CONFIG.est['build-ios'],
      WW_VERIFY_EST_ANDROID_BUILD_GB: CONFIG.est['build-android'],
    }
    printTable(
      `POLICY (${Math.round(RAM_GB)} GB RAM; auto = default for this machine)`,
      ['setting', 'value', 'from'],
      Object.entries(policy).map(([name, value]) => [name, value, POLICY[name]])
    )
    printTable(
      'LEASES',
      ['platform', 'device', 'worktree', 'metro', 'idle', 'state'],
      leases.map((l) => [
        l.platform,
        names[leaseDevice(l).id] ?? leaseDevice(l).name,
        path.basename(l.worktree),
        l.metroPort ?? '-',
        `${idleMin(l)}m`,
        l.reaping
          ? 'reaping'
          : l.expired
            ? 'expired'
            : l.legacy
              ? 'held (old harness)'
              : 'held',
      ])
    )
    printTable(
      'WAITING FOR A DEVICE',
      ['#', 'platform', 'worktree', 'waited', 'reason'],
      waiters.map((w, i) => [
        i + 1,
        w.platform,
        path.basename(w.worktree),
        ago(w.since),
        w.reason ?? '-',
      ])
    )
    printTable(
      'WAITING TO BUILD (no lease held)',
      ['#', 'platform', 'worktree', 'fingerprint', 'waited', 'reason'],
      buildWaiters.map((w, i) => [
        i + 1,
        w.platform,
        path.basename(w.worktree),
        String(w.fingerprint).slice(0, 12),
        ago(w.since),
        w.reason ?? '-',
      ])
    )
    printTable(
      'BUILDS',
      ['platform', 'worktree', 'fingerprint', 'running', 'group', 'state'],
      builds.map((b) => [
        b.platform,
        path.basename(b.worktree),
        String(b.fingerprint).slice(0, 12),
        ago(b.startedAt),
        b.pgid ?? '-',
        b.orphaned ? 'orphaned (wwv gc kills it)' : `building (up ${b.pid})`,
      ])
    )
    printTable(
      'METRO (listeners on 8090-8129)',
      ['port', 'pid', 'serving'],
      [...listeningPorts()]
        .sort((a, b) => a[0] - b[0])
        .map(([port, pid]) => [port, pid, portOwner(port)?.cwd ?? '?'])
    )
  },

  async help() {
    console.log(`ww-verify <command> [--platform ios|android]

  up [--platform ios|android] [--ipad] [--api local] [--seed <scenario>]
     [--rebuild] [--accept-stale-native] [--wait 30] [--keep-build-dirs]
                                           lease a device, start Metro, install, launch
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
  down [--platform p] [--keep-device]      release devices, stop Metro, keep evidence
  status                                   machine-wide leases, queue, builds, Metros, memory
  gc                                       reap expired leases (also runs on every up)`)
  },
}

const [command = 'help', ...rest] = process.argv.slice(2)
// Imported by tests: run a command only when executed directly.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realPath(process.argv[1])).href
) {
  if (!commands[command]) {
    console.error(`ww-verify: Unknown command "${command}"; run ww-verify help`)
    process.exit(1)
  }
  commands[command]({ ...parseFlags(rest), raw: rest }).catch((error) => {
    console.error(
      `ww-verify: ${error instanceof Failure ? error.message : error.stack || error.message}`
    )
    process.exit(1)
  })
}
