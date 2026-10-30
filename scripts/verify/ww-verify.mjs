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
import {
  best,
  center,
  diffSnapshots,
  flatten,
  formatElement,
  formatSnapshot,
  matchesSelector,
  matchesText,
  parseSelector,
  snapshotJson,
  toScreen,
  windowOrigin,
} from './ax.mjs'
import { readFlow, runSteps, startFlow } from './flows.mjs'
import {
  CONFIG,
  HOME as GLOBAL_DIR,
  POLICY,
  RAM_GB,
  acquireBuild,
  belowFloor,
  claimLease,
  evictStaleWarm,
  gc,
  heartbeat,
  killTree,
  parkWarm,
  readLeases,
  reapBuilds,
  release,
  releaseBuild,
  removeDirs,
  reservePort,
  setBuildGroup,
  shutdownWarm,
  snapshot,
  updateLeases,
  withLock,
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
// Emulator GPU mode (`emulator -help-gpu`). Headless, `auto` picks ANGLE on
// SwiftShader, which renders every frame on the Mac's CPU: an animated screen
// such as Welcome keeps qemu near 1,200%. `host` renders on the Mac's GPU,
// headless too, and holds the same screen near 70%.
const EMULATOR_GPU =
  process.env.WW_VERIFY_ANDROID_GPU ||
  (process.platform === 'darwin' ? 'host' : 'auto')
const ANDROID_HOME =
  process.env.ANDROID_HOME || path.join(os.homedir(), 'Library/Android/sdk')
const ANDROID_AVD_HOME =
  process.env.ANDROID_AVD_HOME || path.join(os.homedir(), '.android/avd')
// Cached builds per platform (about 230 MB iOS, 130 MB Android). Worktrees on
// different native fingerprints evict each other's builds below ~6.
const KEEP_BUILDS = Number(process.env.WW_VERIFY_KEEP_BUILDS) || 6

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

/** Shuts down a warm device a lease or build needs the memory of. */
function shutdownWarmDevice(warm) {
  log(`shutting down warm ${warm.deviceName} to free memory`)
  shutdownDevice(
    leaseDevice({ ...warm, worktree: null }) // same shape as a lease
  )
}

async function takeLease(platform, kind, native, flags) {
  const waitMin = Number(flags.wait ?? 30)
  const waitLog = waitLogger()
  const installs = readJson(INSTALLS, {})
  const result = await claimLease(
    {
      worktree: ROOT,
      platform,
      kind,
      pool: platform === 'ios' ? () => iosPool(kind) : androidPool,
      create:
        platform === 'ios' ? (pool) => createIosDevice(kind, pool) : createAvd,
      busyPorts: () => new Set(listeningPorts().keys()),
      // A device that already runs this build skips the install.
      prefer: (d) =>
        !native.stale &&
        installs[d.key]?.fingerprint === native.fingerprint &&
        installs[d.key]?.artifact === native.artifact,
    },
    {
      waitMs: waitMin * 60_000,
      beforeTry: reapExpired,
      shutdown: shutdownWarmDevice,
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

function localApiInUse(dir, except) {
  return readLeases().some((l) => {
    if (l.expired || l.worktree === except) return false
    const api = worktreeState(l.worktree)?.api
    return api?.mode === 'local' && api.dir === dir
  })
}

/** Stops the worktree's local API unless another live lease still uses it. */
function stopLocalApi(worktree, api) {
  if (!api?.dir) return
  withLock('api', () => {
    if (localApiInUse(api.dir, worktree)) return
    run('node', [path.join(api.dir, 'scripts/verify/dev.mjs'), 'down'], {
      cwd: api.dir,
      check: false,
    })
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
  if (state.api?.mode === 'local') stopLocalApi(worktree, state.api)
  delete state.metro
  state.devices = {}
  state.reapedAt = Date.now()
  state.reapedReason = reason
  writeJson(file, state)
}

/**
 * Closes the session and drops the lease. The device stays booted (warm) for
 * the next `up` when the warm pool has room (`--keep-device` always keeps it,
 * `--shutdown` never does); otherwise it is shut down first.
 */
function releasePlatform(state, platform, flags) {
  const own = readLeases().filter(
    (l) => l.worktree === ROOT && l.platform === platform
  )
  const device = state.devices?.[platform] ?? (own[0] && leaseDevice(own[0]))
  if (!device) return
  agentDevice(['close', '--session', sessionName(platform)])
  const lease = own.find((l) => l.key === device.lockKey && !l.legacy)
  shutdownDevice(device, { keepDevice: true }) // stops the iOS runner
  const warm =
    !flags.shutdown &&
    lease &&
    parkWarm(lease, { force: Boolean(flags['keep-device']) })
  if (!warm) shutdownDevice(device)
  release(ROOT, (l) => l.platform === platform || l.key === device.lockKey)
  delete state.devices?.[platform]
  log(
    `released ${device.name}${warm ? '; it stays booted for the next up' : ''}`
  )
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
  await shutdownWarm(evictStaleWarm(), (w) => {
    log(`shutting down ${w.deviceName}, warm over ${CONFIG.warmHours} h`)
    shutdownDevice(leaseDevice({ ...w, worktree: null }))
  })
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
    shutdownDevice(device, { keepDevice: true }) // stops the iOS runner
    if (lease.legacy || !parkWarm(lease)) shutdownDevice(device)
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

// An accessibility capture that overruns agent-device's iOS watchdog keeps its
// runner busy for a few seconds, and every command in that window fails.
const RUNNER_BUSY = /still finishing a previous command/

/** Runs one session command, waiting out a runner still draining an earlier one. */
function sessionCommand(platform, args) {
  const command = [...args, '--session', sessionName(platform)]
  let result = agentDevice(command)
  for (let i = 0; i < 12 && RUNNER_BUSY.test(output(result)); i++) {
    sleepSync(1500)
    result = agentDevice(command)
  }
  // After a capture overruns, the next XCTest action can fail on the old
  // session without acting; the retry gets a fresh one.
  if (RUNNER_INVALIDATED.test(output(result))) {
    sleepSync(1500)
    result = agentDevice(command)
  }
  return result
}

const RUNNER_INVALIDATED = /runner session was invalidated/

const output = (result) => `${result.stdout ?? ''}${result.stderr ?? ''}`

// ---------- AXe: accessibility reads agent-device can't do on iPad ----------

// agent-device's snapshot reads only the app node on the iPad layout, and its
// semantic commands (selectors, find, wait, back, --settle) need that tree, so
// on iPad they read the screen with AXe (scripts/verify/ax.mjs) and tap through
// AXe at screen coordinates. iPhone keeps agent-device and falls back to AXe
// when its tree comes back sparse.
// "capture was truncated": agent-device can't prove a selector absent over a
// long tree (Home, the calendar), so `wait absent` asks AXe instead.
const SPARSE =
  /No snapshot backend could read|sparse accessibility snapshot|snapshot quality verdict is sparse|could not read the current accessibility tree|capture was truncated|could not read the screen/
// `find` reports its own miss ("find did not match any element") over a tree
// agent-device read only partly, such as the Help Center's results under the
// keyboard.
const NO_MATCH =
  /Selector did not match|No element matches|could not find|did not match any element/i
const BACK_LABELS = ['Go Back', 'Back', 'Close']
const AX_SETTLE_MS = 8000

function axeBin() {
  if (process.env.WW_VERIFY_AXE) return process.env.WW_VERIFY_AXE
  const found = ['/opt/homebrew/bin/axe', '/usr/local/bin/axe'].find((p) =>
    fs.existsSync(p)
  )
  if (found) return found
  const which = spawnSync('which', ['axe'], { encoding: 'utf8' })
  return which.status === 0 ? which.stdout.trim() : null
}

const AXE_MISSING =
  'AXe is needed to read iPad screens: brew install cameroncooke/axe/axe'

const axRefsFile = (platform) =>
  path.join(STATE_DIR, `ax-refs-${platform}.json`)
const axTapFile = (platform) =>
  path.join(STATE_DIR, `ax-last-tap-${platform}.json`)

/** Reads the screen with AXe and saves the elements so `@aN` refs resolve. */
function axRead(state, platform) {
  const bin = axeBin()
  if (!bin) fail(AXE_MISSING)
  const device = state.devices[platform]
  const result = run(bin, ['describe-ui', '--udid', device.id], {
    check: false,
    timeout: 30_000,
  })
  if (result.status !== 0)
    fail(`axe describe-ui failed: ${output(result).trim().slice(-400)}`)
  const elements = flatten(JSON.parse(result.stdout))
  writeJson(axRefsFile(platform), { device: device.id, elements })
  return elements
}

function axRef(state, platform, ref) {
  const saved = readJson(axRefsFile(platform), null)
  const element = saved?.elements.find((e) => `@${e.ref}` === ref)
  if (!element || saved.device !== state.devices[platform].id)
    return { error: `${ref} isn't in the last snapshot; run snapshot again` }
  return { element }
}

const done = (stdout, status = 0) => ({ status, stdout, stderr: '' })
const failed = (message) => ({ status: 1, stdout: '', stderr: `${message}\n` })

// Settling compares positions too: a sheet or a dock riding the keyboard moves
// without changing a label, and a tap resolved mid-move lands on its old spot.
const layoutKey = (elements) =>
  elements
    .map((e) => `${formatElement(e)} ${Math.round(e.x)},${Math.round(e.y)}`)
    .join('\n')

/** Polls AXe until two reads match, then lists what changed since `before`. */
function axSettle(state, platform, before) {
  const start = Date.now()
  sleepSync(300)
  let previous = null
  let current = axRead(state, platform)
  while (Date.now() - start < AX_SETTLE_MS) {
    const key = layoutKey(current)
    if (key === previous) break
    previous = key
    sleepSync(250)
    current = axRead(state, platform)
  }
  const lines = diffSnapshots(before, current)
  return `settled after ${Date.now() - start}ms (AXe)\n${lines.length ? lines.join('\n') : 'no change'}`
}

const SCREEN_ORIGIN = { x: 0, y: 0 }

/**
 * Where the app window sits on screen. AXe frames the app's elements relative
 * to its window, while taps and `--point` reads take screen coordinates, so in
 * a resized iPad window every tap at an element adds this. A point outside the
 * window reads SpringBoard, which frames each window (see `windowOrigin`). A
 * window that covers the screen's top-left corner starts there.
 */
function axWindowOrigin(state, platform) {
  const device = state.devices[platform]
  if (device.kind !== 'ipad') return SCREEN_ORIGIN
  const result = run(
    axeBin(),
    ['describe-ui', '--udid', device.id, '--point', '1,1'],
    { check: false, timeout: 15_000 }
  )
  if (result.status !== 0) return SCREEN_ORIGIN
  try {
    return windowOrigin(JSON.parse(result.stdout), BUNDLE_ID) ?? SCREEN_ORIGIN
  } catch {
    return SCREEN_ORIGIN
  }
}

/**
 * Taps, or fills, at a screen point through AXe. agent-device's XCTest taps
 * miss once an iPad window is resized (XCTest reports a 391 × 665 window as 70
 * × 367), so iPad taps at a point go through AXe, which taps in the same screen
 * coordinates its `--point` reads use. A fill focuses the field with that tap,
 * then lets agent-device replace the focused field's text.
 */
function axPointInput(state, platform, verb, x, y, rest) {
  const tapped = run(
    axeBin(),
    ['tap', '-x', x, '-y', y, '--udid', state.devices[platform].id],
    { check: false, timeout: 15_000 }
  )
  if (tapped.status !== 0)
    return failed(`axe tap failed: ${output(tapped).trim().slice(-400)}`)
  if (verb !== 'fill') return done(`Tapped (${x}, ${y})`)
  sleepSync(500)
  return sessionCommand(platform, ['fill', x, y, ...rest])
}

/**
 * Runs an input command; with --settle, waits for the screen through AXe. `tap`
 * is where a press or fill lands in window coordinates, for `type`.
 */
function axInput(state, platform, args, settle, before, tap) {
  const start = settle ? (before ?? axRead(state, platform)) : null
  const [verb, x, y, ...rest] = args
  const atPoint =
    state.devices[platform].kind === 'ipad' &&
    ['press', 'click', 'fill'].includes(verb) &&
    isNumber(x) &&
    isNumber(y) &&
    (verb === 'fill' || !rest.length)
  const result = atPoint
    ? axPointInput(state, platform, verb, x, y, rest)
    : sessionCommand(platform, args)
  if (tap) writeJson(axTapFile(platform), tap)
  if (!settle || result.status !== 0) return result
  return done(`${result.stdout.trim()}\n${axSettle(state, platform, start)}`)
}

/**
 * Resolves `@aN`, an agent-device selector, or text into one on-screen element.
 * Returns { element, elements } or { error }.
 */
function axTarget(
  state,
  platform,
  target,
  { text = false, first = false, origin = SCREEN_ORIGIN } = {}
) {
  if (/^@a\d+$/.test(target)) return axRef(state, platform, target)
  const selector = text ? null : parseSelector(target)
  if (!text && !selector) return { error: `can't resolve ${target} with AXe` }
  const elements = axRead(state, platform)
  const matches = elements.filter((e) =>
    selector ? matchesSelector(e, selector) : matchesText(e, target)
  )
  if (!matches.length)
    return {
      error: `No element matches ${target} on screen (AXe read ${elements.length}). Run snapshot -i to see what's there.`,
    }
  const visible =
    matches.length > 1 ? onTop(state, platform, matches, origin) : matches
  const pool = visible.length ? visible : matches
  return { element: first ? pool[0] : best(pool), elements }
}

/**
 * The matches a tap at their center would reach. A sheet or picker leaves the
 * screen under it in the accessibility tree, so the same label (a "5" on the
 * week strip and on a picker wheel) can match twice; hit-testing each center
 * with `axe describe-ui --point` tells which one is in front.
 */
function onTop(state, platform, matches, origin) {
  const device = state.devices[platform]
  return matches.slice(0, 6).filter((element) => {
    const { x, y } = toScreen(center(element), origin)
    const result = run(
      axeBin(),
      ['describe-ui', '--udid', device.id, '--point', `${x},${y}`],
      { check: false, timeout: 15_000 }
    )
    if (result.status !== 0) return true
    let hit
    try {
      hit = JSON.parse(result.stdout)
    } catch {
      return true
    }
    const found = (node) =>
      (element.label && node.AXLabel === element.label) ||
      (element.id && node.AXUniqueId === element.id) ||
      (element.value && node.AXValue === element.value) ||
      (node.children ?? []).some(found)
    return found(Array.isArray(hit) ? { children: hit } : hit)
  })
}

/**
 * Long-presses the element a target resolves to, for a context menu, when
 * agent-device can't find it (its XCTest reads back off after slow screens).
 */
function axLongPress(state, platform, target, rest) {
  const origin = axWindowOrigin(state, platform)
  const found = axTarget(state, platform, target, { origin })
  if (found.error) return failed(found.error)
  const { x, y } = toScreen(center(found.element), origin)
  const ms = Number(rest.find(isNumber) ?? 1000)
  const result = run(
    axeBin(),
    [
      'touch',
      '-x',
      String(x),
      '-y',
      String(y),
      '--down',
      '--up',
      '--delay',
      String(ms / 1000),
      '--udid',
      state.devices[platform].id,
    ],
    { check: false, timeout: 15_000 }
  )
  if (result.status !== 0)
    return failed(`axe touch failed: ${output(result).trim().slice(-400)}`)
  sleepSync(800)
  return done(`Long pressed ${formatElement(found.element)} at (${x}, ${y})`)
}

/**
 * `scroll <direction> --until <selector>` when agent-device can't read the
 * screen: scrolls a pass at a time until AXe finds the target on screen.
 */
function axScrollUntil(state, platform, direction, target) {
  for (let pass = 0; pass <= 8; pass++) {
    if (!axTarget(state, platform, target).error)
      return done(`${target} is on screen after ${pass} passes (AXe)`)
    if (pass === 8) break
    const result = sessionCommand(platform, ['scroll', direction, '0.5'])
    if (result.status !== 0) return result
    sleepSync(400)
  }
  return failed(`${target} didn't come on screen scrolling ${direction} (AXe)`)
}

/** Taps (or fills) the element a target resolves to. */
function axAct(state, platform, verb, target, rest, settle, options) {
  const origin = axWindowOrigin(state, platform)
  const found = axTarget(state, platform, target, { ...options, origin })
  if (found.error) return failed(found.error)
  const point = center(found.element)
  const { x, y } = toScreen(point, origin)
  const result = axInput(
    state,
    platform,
    [verb === 'fill' ? 'fill' : 'press', String(x), String(y), ...rest],
    settle,
    found.elements,
    point
  )
  if (result.status !== 0) return result
  return done(
    `${formatElement(found.element)} at (${x}, ${y}): ${result.stdout.trim()}`
  )
}

function axSnapshot(state, platform, json, note) {
  const elements = axRead(state, platform)
  if (json) return done(snapshotJson(elements))
  const lines = [formatSnapshot(elements, note)]
  if (splashCovers(state, platform))
    lines.unshift(
      'WARNING: the native splash covers the app, so taps land on it. Run ww-verify up.'
    )
  return done(lines.join('\n'))
}

/** Polls AXe for `wait text|absent|stable`. */
function axWait(state, platform, kind, rest) {
  const numbers = rest.filter((a) => /^\d+$/.test(a)).map(Number)
  const subject = rest.find((a) => !/^\d+$/.test(a))
  const timeout = numbers.at(-1) ?? 10_000
  const deadline = Date.now() + timeout
  if (kind === 'stable') {
    const quiet = numbers.length > 1 ? numbers[0] : 500
    let key = null
    let since = Date.now()
    while (Date.now() < deadline) {
      const next = layoutKey(axRead(state, platform))
      if (next !== key) [key, since] = [next, Date.now()]
      else if (Date.now() - since >= quiet) return done('stable (AXe)')
      sleepSync(250)
    }
    return failed(`screen didn't settle within ${timeout}ms (AXe)`)
  }
  const selector = kind === 'absent' ? parseSelector(subject) : null
  if (kind === 'absent' && !selector)
    return failed(`can't resolve ${subject} with AXe`)
  while (true) {
    const elements = axRead(state, platform)
    const hit = elements.find((e) =>
      selector ? matchesSelector(e, selector) : matchesText(e, subject)
    )
    if (kind === 'text' && hit) return done(`found ${formatElement(hit)}`)
    if (kind === 'absent' && !hit) return done(`${subject} is gone`)
    if (Date.now() >= deadline) break
    sleepSync(400)
  }
  return failed(
    kind === 'text'
      ? `"${subject}" didn't appear within ${timeout}ms (AXe)`
      : `${subject} is still on screen after ${timeout}ms (AXe)`
  )
}

const isNumber = (value) => /^-?\d+(\.\d+)?$/.test(value ?? '')

/**
 * `type` on iPad: agent-device finds the focused field through the tree it
 * can't read there, so this fills the field the last tap landed in, or the only
 * field on screen. Fill replaces the field's text rather than appending.
 */
function axType(state, platform, text, settle) {
  const fields = axRead(state, platform).filter((e) => e.editable)
  const tap = readJson(axTapFile(platform), null)
  const inside = (e) =>
    tap &&
    tap.x >= e.x &&
    tap.x <= e.x + e.width &&
    tap.y >= e.y &&
    tap.y <= e.y + e.height
  const field = fields.find(inside) ?? (fields.length === 1 ? fields[0] : null)
  if (!field)
    return failed(
      fields.length
        ? `No focused field: ${fields.length} on screen and the last tap wasn't in one. Use fill <@aN|selector> <text>.`
        : 'No text field on screen (AXe)'
    )
  const point = center(field)
  const { x, y } = toScreen(point, axWindowOrigin(state, platform))
  const result = axInput(
    state,
    platform,
    ['fill', String(x), String(y), text],
    settle,
    null,
    point
  )
  if (result.status !== 0) return result
  return done(`${formatElement(field)}: ${result.stdout.trim()}`)
}

/**
 * Runs one agent-device command for this run's session and returns a spawnSync
 * result. `wwv ad`, `wwv flow` and `wwv monkey` all go through here, so the
 * iPad handling applies to each.
 */
function drive(state, platform, args) {
  const device = state.devices[platform]
  if (platform !== 'ios' || !axeBin()) return sessionCommand(platform, args)
  const ipad = isIpadKind(device.kind)
  const [command, ...rest] = args
  const settle = rest.includes('--settle')
  const plain = rest.filter((a) => a !== '--settle')
  // iPhone: agent-device first, AXe only when it can't read the screen. An
  // action agent-device reports done has landed, even when its settled diff
  // reads sparse; acting again through AXe would tap twice (Archive, then the
  // list under the closed alert).
  const acts = ['press', 'click', 'fill', 'longpress', 'find'].includes(command)
  const tryAgentDevice = (retry) => {
    if (ipad) return retry()
    const result = sessionCommand(platform, args)
    if (acts && result.status === 0) return result
    const text = output(result)
    if (SPARSE.test(text) || (result.status !== 0 && NO_MATCH.test(text)))
      return retry()
    return result
  }

  switch (command) {
    case 'snapshot':
      return tryAgentDevice(() =>
        axSnapshot(
          state,
          platform,
          plain.includes('--json'),
          ipad ? undefined : "agent-device couldn't read this screen"
        )
      )
    case 'press':
    case 'click':
    case 'fill': {
      const [target, ...more] = plain
      // Coordinates are the screen's, as in a screenshot.
      if (isNumber(target) && isNumber(more[0])) {
        if (!ipad) return sessionCommand(platform, args)
        const origin = axWindowOrigin(state, platform)
        const tap = {
          x: Number(target) - origin.x,
          y: Number(more[0]) - origin.y,
        }
        return axInput(state, platform, [command, ...plain], settle, null, tap)
      }
      if (/^@e\d+$/.test(target) || !target)
        return sessionCommand(platform, args)
      if (/^@a\d+$/.test(target))
        return axAct(state, platform, command, target, more, settle)
      return tryAgentDevice(() =>
        axAct(state, platform, command, target, more, settle)
      )
    }
    case 'find': {
      const [text, action, ...more] = plain.filter((a) => a !== '--first')
      const first = plain.includes('--first')
      if (action && !['click', 'press', 'fill'].includes(action))
        return sessionCommand(platform, args)
      return tryAgentDevice(() => {
        if (action)
          return axAct(state, platform, action, text, more, settle, {
            text: true,
            first,
          })
        const elements = axRead(state, platform).filter((e) =>
          matchesText(e, text)
        )
        return elements.length
          ? done(elements.map(formatElement).join('\n'))
          : failed(`Nothing on screen contains "${text}" (AXe)`)
      })
    }
    case 'wait': {
      const [kind, ...more] = plain
      if (!['text', 'absent', 'stable'].includes(kind))
        return sessionCommand(platform, args)
      if (kind === 'stable' || ipad)
        return tryAgentDevice(() => axWait(state, platform, kind, more))
      // agent-device's reader can stop seeing the app partway through a long
      // session ("Current surface: WitnessWork Dev"), and its wait then times
      // out over a screen that shows the text; AXe reads the screen apart.
      const result = sessionCommand(platform, args)
      return result.status === 0 ? result : axWait(state, platform, kind, more)
    }
    case 'type': {
      if (!ipad) return sessionCommand(platform, args)
      const before = settle ? axRead(state, platform) : null
      const result = sessionCommand(platform, [command, ...plain])
      if (!/TEXT_INPUT_NOT_FOCUSED/.test(output(result)))
        return settle && result.status === 0
          ? done(
              `${result.stdout.trim()}\n${axSettle(state, platform, before)}`
            )
          : result
      return axType(
        state,
        platform,
        plain.filter((a) => !a.startsWith('--')).join(' '),
        settle
      )
    }
    case 'longpress': {
      const [target, ...more] = plain
      if (!target || /^@e\d+$/.test(target) || isNumber(target))
        return sessionCommand(platform, args)
      return tryAgentDevice(() => axLongPress(state, platform, target, more))
    }
    case 'scroll': {
      const until = plain.indexOf('--until')
      if (until < 0 || ipad)
        return ipad && settle
          ? axInput(state, platform, [command, ...plain], true)
          : sessionCommand(platform, args)
      return tryAgentDevice(() =>
        axScrollUntil(state, platform, plain[0], plain[until + 1])
      )
    }
    case 'back':
      if (!ipad) return sessionCommand(platform, args)
      for (const label of BACK_LABELS) {
        const result = axAct(
          state,
          platform,
          'press',
          `label="${label}"`,
          [],
          settle
        )
        if (result.status === 0) return result
      }
      return failed(
        `No ${BACK_LABELS.join(' / ')} control on screen (AXe); press the screen's own control instead`
      )
    default:
      // Scroll, swipe, type and the rest are input; only --settle reads.
      return ipad && settle
        ? axInput(state, platform, [command, ...plain], true)
        : sessionCommand(platform, args)
  }
}

// Commands `wwv ad` sends through drive() rather than straight to agent-device.
const DRIVEN = new Set([
  'snapshot',
  'press',
  'click',
  'fill',
  'find',
  'wait',
  'back',
  'type',
  'longpress',
  'scroll',
])

// ---------- splash detection ----------

// `#4BD27C`, the native splash's background (app.config.ts).
const SPLASH_RGB = [0x4b, 0xd2, 0x7c]

/**
 * True when the native splash covers the screen. On Xcode 27 dev builds React
 * Native can put the launch screen back over a running app, where it swallows
 * every tap while the JS and the accessibility tree carry on beneath, so
 * neither CDP nor AXe can tell. A screenshot that is almost all splash green
 * can.
 */
function splashCovers(state, platform) {
  if (platform !== 'ios') return false
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-verify-splash-'))
  try {
    const png = path.join(tmp, 'screen.png')
    const bmp = path.join(tmp, 'screen.bmp')
    const device = state.devices[platform]
    run('xcrun', ['simctl', 'io', device.id, 'screenshot', png], {
      check: false,
    })
    if (!fs.existsSync(png)) return false
    // A 24 × 24 BMP is enough to measure, and Node reads BMP without a decoder.
    run('sips', ['-s', 'format', 'bmp', '-z', '24', '24', png, '--out', bmp], {
      check: false,
    })
    if (!fs.existsSync(bmp)) return false
    const data = fs.readFileSync(bmp)
    const offset = data.readUInt32LE(10)
    const width = data.readInt32LE(18)
    const height = Math.abs(data.readInt32LE(22))
    const bytes = data.readUInt16LE(28) / 8
    const row = Math.ceil((width * bytes) / 4) * 4
    let green = 0
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = offset + y * row + x * bytes
        const [b, g, r] = [data[i], data[i + 1], data[i + 2]]
        if (
          Math.abs(r - SPLASH_RGB[0]) < 24 &&
          Math.abs(g - SPLASH_RGB[1]) < 24 &&
          Math.abs(b - SPLASH_RGB[2]) < 24
        )
          green++
      }
    return green / (width * height) > 0.85
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

/** Hides a splash left over the running app; false if it stays. */
async function clearSplash(state, platform) {
  for (let i = 0; i < 4; i++) {
    if (!splashCovers(state, platform)) return true
    await cdpEval(
      state,
      platform,
      'globalThis.expo?.modules?.ExpoSplashScreen?.hide?.() ?? null'
    ).catch(() => null)
    await sleep(1500)
  }
  return !splashCovers(state, platform)
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

function newerFirstIosRuntimes() {
  const out = run('xcrun', [
    'simctl',
    'list',
    'runtimes',
    'available',
    '-j',
  ]).stdout
  return JSON.parse(out)
    .runtimes.filter((r) => r.platform === 'iOS')
    .sort((a, b) =>
      b.version.localeCompare(a.version, undefined, { numeric: true })
    )
}

// Each simulator kind: its device type and its pool's name.
const IOS_KINDS = {
  iphone: { type: /^iPhone \d+ Pro$/, name: 'iPhone' },
  ipad: { type: /^iPad Pro 13-inch/, name: 'iPad', ipad: true },
  duo: { type: /^iPhone Duo$/, name: 'iPhone Duo' },
  // The smallest screens: 375 pt wide without a notch, and iPad in portrait.
  se: { type: /^iPhone SE \(3rd generation\)$/, name: 'iPhone SE' },
  'ipad-mini': {
    type: /^iPad mini \(A17 Pro\)$/,
    name: 'iPad mini',
    ipad: true,
  },
}

const isIpadKind = (kind) => IOS_KINDS[kind]?.ipad === true

/** The newest runtime with this kind's device type, and that type. */
function pickRuntimeAndType(kind) {
  const pattern = IOS_KINDS[kind].type
  const runtimes = newerFirstIosRuntimes()
  if (!runtimes.length)
    fail('No iOS simulator runtime installed (Xcode > Settings > Components)')
  for (const runtime of runtimes) {
    const match = (runtime.supportedDeviceTypes ?? [])
      .filter((t) => pattern.test(t.name))
      .pop()
    if (match) return { runtime, type: match.identifier }
  }
  fail(`No ${kind} device type in any installed iOS runtime`)
}

const iosPattern = (kind) =>
  new RegExp(`^WW Verify ${IOS_KINDS[kind].name} (\\d+)$`)

/** The fixed-size simulator pool for a kind (see IOS_KINDS). */
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
  const { runtime, type } = pickRuntimeAndType(kind)
  const name = `WW Verify ${IOS_KINDS[kind].name} ${next}`
  log(`creating simulator "${name}" (${runtime.name})`)
  const udid = run('xcrun', [
    'simctl',
    'create',
    name,
    type,
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
  if (posterBoardCrashLooping(device.id)) {
    // A simulator killed mid-write can leave PosterBoard's store with a
    // descriptor it asserts on at every launch, so it crash-loops and macOS
    // shows "PosterBoard quit unexpectedly" each time. PosterBoard rebuilds
    // the store from scratch, so drop it and boot again.
    log(`${device.name}: PosterBoard keeps crashing; resetting its store`)
    run('xcrun', ['simctl', 'shutdown', device.id], { check: false })
    waitSimLeaves(device.id, ['Booted', 'Shutting Down'])
    fs.rmSync(posterStore(device.id), { recursive: true, force: true })
    run('xcrun', ['simctl', 'boot', device.id], { check: false })
    run('xcrun', ['simctl', 'bootstatus', device.id, '-b'], {
      timeout: 300_000,
    })
  }
}

const posterStore = (udid) =>
  path.join(
    os.homedir(),
    'Library/Developer/CoreSimulator/Devices',
    udid,
    'data/Library/Application Support/PRBPosterExtensionDataStore'
  )

/**
 * Whether PosterBoard crashed at least 3 times on this simulator in the last
 * day, counting only crashes since its store was last rebuilt.
 */
function posterBoardCrashLooping(udid) {
  const reports = path.join(os.homedir(), 'Library/Logs/DiagnosticReports')
  let since = Date.now() - 24 * 60 * 60_000
  try {
    since = Math.max(since, fs.statSync(posterStore(udid)).birthtimeMs)
  } catch {
    return false
  }
  let entries
  try {
    entries = fs.readdirSync(reports, { withFileTypes: true })
  } catch {
    return false
  }
  let crashes = 0
  for (const name of entries) {
    // The name holds the crash time; macOS rewrites the mtime of old reports.
    const at = name.name.match(
      /^PosterBoard-(\d{4})-(\d\d)-(\d\d)-(\d\d)(\d\d)(\d\d)\.ips$/
    )
    if (!name.isFile() || !at) continue
    const [, y, mo, d, h, mi, sec] = at.map(Number)
    if (new Date(y, mo - 1, d, h, mi, sec).getTime() < since) continue
    try {
      const report = fs.readFileSync(path.join(reports, name.name), 'utf8')
      if (!report.includes(`SimDevice.${udid}`)) continue
    } catch {
      continue
    }
    if (++crashes >= 3) return true
  }
  return false
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
// this folder (and android/app/build). `root` is another checkout only for
// scripts/perf, which builds a commit's Release app in its own worktree.
const derivedData = (root = ROOT) => path.join(root, '.verify/DerivedData')
const androidBuild = (root = ROOT) => path.join(root, 'android/app/build')

/** The app a build produces: Debug is the dev client, Release the perf app. */
export function buildProduct(
  platform,
  { root = ROOT, configuration = 'Debug' } = {}
) {
  const config = configuration.toLowerCase()
  return platform === 'ios'
    ? path.join(
        derivedData(root),
        `Build/Products/${configuration}-iphonesimulator/WitnessWorkDev.app`
      )
    : path.join(androidBuild(root), `outputs/apk/${config}/app-${config}.apk`)
}
const IOS_PRODUCT = buildProduct('ios')
const ANDROID_PRODUCT = buildProduct('android')
export const buildDirs = (platform, root = ROOT) =>
  platform === 'ios' ? [derivedData(root)] : [androidBuild(root)]

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

/**
 * What an emulator still needs before the app can run in front, from `dumpsys
 * user` and `dumpsys window`: `storage` while the user's storage is locked
 * (every cold boot, until the PIN is entered), then `keyguard` while the lock
 * screen still shows; null when it's unlocked.
 */
export function androidUnlockStep(users, windows) {
  if (!/State: RUNNING_UNLOCKED\b/.test(users)) return 'storage'
  if (/isKeyguardShowing=true/.test(windows)) return 'keyguard'
  return null
}

// The shared verify AVDs carry a screen-lock PIN, so every cold boot leaves the
// user RUNNING_LOCKED: the dev client link doesn't resolve and the app never
// starts. The lock screen ignores a PIN typed for a while after
// sys.boot_completed (on API 36 a PIN typed then was lost and the user stayed
// locked), so the storage is unlocked with `locksettings verify`, which works
// as soon as the system is up. The lock screen then still covers the app, and
// it takes the PIN again; each step is retried until it takes. The PIN stays
// on the AVD (other agents rely on it); override with WW_VERIFY_ANDROID_PIN.
// `deps` is for tests.
async function unlockAndroid(serial, deps = {}) {
  const shell =
    deps.shell ??
    ((...args) =>
      run('adb', ['-s', serial, 'shell', ...args], { check: false }).stdout)
  const wait = deps.sleep ?? sleep
  const pin = deps.pin ?? process.env.WW_VERIFY_ANDROID_PIN ?? '1111'
  const step = () =>
    androidUnlockStep(shell('dumpsys', 'user'), shell('dumpsys', 'window'))
  let next = step()
  if (!next) return false
  log(`${serial} is locked; entering the screen-lock PIN`)
  for (let attempt = 0; attempt < 12; attempt++) {
    const tried = next
    if (tried === 'storage') {
      // A wrong PIN fails at once instead of counting towards a lockout.
      if (/didn't match/.test(shell('locksettings', 'verify', '--old', pin)))
        fail(
          `${serial} rejected the screen-lock PIN ${pin}; set WW_VERIFY_ANDROID_PIN to the AVD's PIN`
        )
    } else {
      shell('input', 'keyevent', 'KEYCODE_WAKEUP')
      shell('wm', 'dismiss-keyguard')
      await wait(1500)
      shell('input', 'text', pin)
      shell('input', 'keyevent', '66')
    }
    for (let i = 0; i < 5 && next === tried; i++) {
      await wait(1000)
      next = step()
    }
    if (!next) return true
  }
  fail(
    `${serial} is still locked (${next}) after entering the PIN; set WW_VERIFY_ANDROID_PIN to the AVD's screen-lock PIN`
  )
}

/** The `-gpu` mode a running AVD's emulator was started with (`auto` if none). */
function emulatorGpu(name) {
  const command = run('ps', ['-axo', 'command'], { check: false })
    .stdout.split('\n')
    .find((line) => /qemu-system/.test(line) && line.includes(`-avd ${name} `))
  return command?.match(/ -gpu (\S+)/)?.[1] ?? 'auto'
}

/** Boots the leased AVD headless and lean; returns its adb serial. */
async function bootAndroid(device) {
  const name = device.name
  let serial = runningAvds()[name]
  if (serial) {
    const gpu = emulatorGpu(name)
    if (gpu !== EMULATOR_GPU)
      log(
        `${name} runs with -gpu ${gpu}, not ${EMULATOR_GPU}; \`wwv down --platform android --shutdown\` reboots it`
      )
  } else {
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
        '-gpu',
        EMULATOR_GPU,
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
  await unlockAndroid(serial)
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
export function removeBuildDirs(platform, root = ROOT) {
  removeDirs(buildDirs(platform, root), (message) =>
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
 * never against a device (the artifact is installed after a lease). Release
 * embeds the JS as Hermes bytecode with dev mode off; scripts/perf uses it.
 */
export function buildSteps(
  platform,
  { root = ROOT, configuration = 'Debug' } = {}
) {
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
        configuration,
        '-destination',
        'generic/platform=iOS Simulator',
        '-derivedDataPath',
        derivedData(root),
        `ARCHS=${os.arch() === 'arm64' ? 'arm64' : 'x86_64'}`,
        'ONLY_ACTIVE_ARCH=YES',
        'COMPILER_INDEX_STORE_ENABLE=NO',
        // RevenueCat crashes a Release build that uses the dev variant's Test
        // Store key (an alert, then fatalError); its own opt-out flag.
        ...(configuration === 'Release'
          ? [
              'SWIFT_ACTIVE_COMPILATION_CONDITIONS=$(inherited) BYPASS_SIMULATED_STORE_RELEASE_CHECK',
            ]
          : []),
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
      path.join(root, 'android/gradlew'),
      '-p',
      'android',
      `:app:assemble${configuration}`,
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
export async function buildNative(
  platform,
  {
    root = ROOT,
    configuration = 'Debug',
    logPath = path.join(STATE_DIR, `build-${platform}.log`),
    env = {},
  } = {}
) {
  log(
    `building ${platform} ${configuration === 'Debug' ? 'dev client' : `${configuration} app`} (several minutes); log: ${path.relative(ROOT, logPath)}`
  )
  if (
    platform === 'ios' &&
    fs.existsSync(path.join(root, 'ios')) &&
    !fs.existsSync(path.join(root, 'ios/WitnessWorkDev.xcworkspace'))
  )
    fail(
      'ios/ holds a non-development project (no WitnessWorkDev.xcworkspace). Delete ios/ and rerun up; the harness never overwrites another variant'
    )
  const out = fs.openSync(logPath, 'w')
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(import.meta.url),
      '_build',
      platform,
      '--worktree',
      root,
      '--configuration',
      configuration,
    ],
    {
      cwd: root,
      detached: true,
      stdio: ['ignore', out, out],
      env: { ...buildEnv(platform), ...env },
    }
  )
  buildGroup = child.pid
  setBuildGroup(child.pid, buildDirs(platform, root))
  const status = await new Promise((resolve) => {
    child.on('exit', (code, signal) => resolve(signal ? 1 : code))
    child.on('error', () => resolve(1))
  })
  // Anything the steps left behind goes with the build.
  killTree(child.pid)
  buildGroup = null
  if (status !== 0) fail(`${platform} build failed; tail ${logPath}`)
  const artifact = buildProduct(platform, { root, configuration })
  if (!fs.existsSync(artifact))
    fail(`Build finished but ${path.relative(root, artifact)} is missing`)
  return artifact
}

/** Kills a build this process started (on a signal), like `up`'s cleanup. */
export function killOwnBuild() {
  if (!buildGroup) return false
  killTree(buildGroup)
  buildGroup = null
  return true
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
    shutdown: shutdownWarmDevice,
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

/** The newest cached build, for `wwv warm` (which has no tree to fingerprint). */
function newestCached(platform) {
  const [key, entry] =
    Object.entries(readJson(BUILD_INDEX, {}))
      .filter(([k, e]) => k.startsWith(`${platform}-`) && fs.existsSync(e.path))
      .sort((a, b) => b[1].builtAt - a[1].builtAt)[0] ?? []
  return entry
    ? { fingerprint: key.slice(platform.length + 1), artifact: entry.path }
    : null
}

/**
 * Boots one device for `wwv warm`, installs the newest cached build on it, and
 * parks it warm. Returns its name, or null when no device is free.
 */
async function warmOne(platform) {
  const native = newestCached(platform) ?? { stale: true }
  const kind = platform === 'ios' ? 'iphone' : 'emulator'
  let claim
  try {
    claim = await takeLease(platform, kind, native, { wait: 0 })
  } catch (error) {
    if (!(error instanceof Failure)) throw error
    log(`no ${platform} device to warm: ${error.message}`)
    return null
  }
  const device = leaseDevice(claim.lease)
  try {
    if (platform === 'ios') bootIos(device)
    else {
      device.id = await bootAndroid(device)
      updateLeases(ROOT, { deviceId: device.id }, [device.lockKey])
    }
    if (!native.stale) ensureApp(device, native, {})
    const lease = readLeases().find((l) => l.key === device.lockKey)
    parkWarm(lease, { force: true })
    return device.name
  } catch (error) {
    shutdownDevice(device)
    release(ROOT, (l) => l.key === device.lockKey)
    throw error
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

// Every run gets an isolated ww-api (ww-api's scripts/verify/dev.mjs).
// WW_API_DIR runs a given checkout, such as a backend branch; otherwise it runs
// from a worktree the harness owns at the ww-api repo's origin/main, so it
// never depends on what the user's own checkout has checked out.
function apiRepo() {
  return path.resolve(
    process.env.WW_API_REPO || path.join(os.homedir(), 'dev/ww-api')
  )
}

const managedApiDir = () => path.join(`${apiRepo()}-worktrees`, 'ww-verify')

const expandHome = (file) =>
  file.startsWith('~/') ? path.join(os.homedir(), file.slice(2)) : file

function apiDir() {
  return process.env.WW_API_DIR
    ? path.resolve(process.env.WW_API_DIR)
    : managedApiDir()
}

const quiet = { stdio: ['ignore', 2, 2] }

/**
 * Moves the harness's ww-api worktree to the latest origin/main and installs
 * its dependencies. Skipped while a worker runs from it, so a worktree that
 * shares that worker never has its backend change underneath it.
 */
function updateApiCheckout(dir) {
  const worker = readJson(path.join(dir, '.verify/state.json'), null)
  if (pidAlive(worker?.pid)) return
  const repo = apiRepo()
  if (!fs.existsSync(path.join(repo, '.git')))
    fail(
      `No ww-api repo at ${repo}; clone it there, or set WW_API_REPO (or WW_API_DIR to a checkout)`
    )
  const fetched = run('git', ['fetch', '--quiet', 'origin', 'main'], {
    cwd: repo,
    check: false,
  })
  if (fetched.status !== 0)
    log(`git fetch of ww-api failed; using the last fetched origin/main`)
  if (!fs.existsSync(path.join(dir, '.git'))) {
    log(`creating the ww-api checkout ${dir} at origin/main`)
    run('git', ['worktree', 'add', '--force', '--detach', dir, 'origin/main'], {
      cwd: repo,
      ...quiet,
    })
  } else {
    const head = (ref) =>
      run('git', ['rev-parse', ref], { cwd: dir }).stdout.trim()
    if (head('HEAD') !== head('origin/main')) {
      const moved = run(
        'git',
        ['checkout', '--quiet', '--detach', 'origin/main'],
        {
          cwd: dir,
          check: false,
        }
      )
      if (moved.status !== 0)
        log(
          `${dir} has local edits, so it stays at ${head('HEAD').slice(0, 7)}: ${moved.stderr.trim()}`
        )
    }
  }
  const stamp = path.join(dir, '.verify/installed')
  const inputs = ['package.json', 'pnpm-lock.yaml']
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
    .join('\0')
  const hash = crypto.createHash('sha256').update(inputs).digest('hex')
  if (
    readJson(stamp, null)?.hash === hash &&
    fs.existsSync(path.join(dir, 'node_modules/wrangler/bin/wrangler.js'))
  )
    return
  log(`installing ww-api dependencies in ${dir}`)
  run('pnpm', ['install', '--frozen-lockfile'], {
    cwd: dir,
    timeout: 600_000,
    env: { CI: 'true' }, // no interactive prompts
    ...quiet,
  })
  writeJson(stamp, { hash })
}

/** Starts (or reuses) the isolated ww-api; returns what the run records. */
function startLocalApi(dir = apiDir()) {
  return withLock('api', () => {
    if (dir === managedApiDir()) updateApiCheckout(dir)
    const script = path.join(dir, 'scripts/verify/dev.mjs')
    if (!fs.existsSync(script))
      fail(
        `${script} not found; ${dir} must be a ww-api checkout that has the verify-ww-api loop`
      )
    // Real credentials (an OpenRouter key for Scribe AI) come only from an
    // env file the user names; a worker already running keeps what it has.
    const secrets = process.env.WW_API_SECRETS_FROM
    run(
      'node',
      [
        script,
        'up',
        ...(secrets
          ? ['--secrets-from', path.resolve(expandHome(secrets))]
          : []),
      ],
      { cwd: dir, timeout: 180_000, ...quiet }
    )
    const worker = readJson(path.join(dir, '.verify/state.json'), {})
    return {
      mode: 'local',
      url: worker.url,
      port: worker.port,
      // The isolated worker mints its own dev-bypass token; the bundle must
      // send it.
      devBypass: worker.tokens?.devBypass,
      dir,
      sha: worker.gitSha?.slice(0, 12) ?? null,
    }
  })
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

// Match by platform: Android runtimes report "<model> - <release> - API <n>",
// and an iOS runtime reports the simulator name, which can lag a rename until
// reboot. A warm device another worktree left behind can reconnect to this
// port once its own Metro is gone, so prefer the leased simulator by name, and
// never take an iOS runtime named for a different pool device: evaluating
// there would seed or drive someone else's run.
async function cdpTarget(state, platform) {
  const device = state.devices?.[platform]
  if (!device)
    fail(
      `No ${platform} device in .verify/state.json; run ww-verify up --platform ${platform}`
    )
  const targets = await cdpTargets(state.metro.port)
  const isAndroid = (t) => / - API \d+$/.test(t.deviceName ?? '')
  const candidates = targets.filter(
    (t) =>
      t.title?.startsWith(BUNDLE_ID) &&
      isAndroid(t) === (platform === 'android')
  )
  if (platform === 'android') return candidates[0]
  return (
    candidates.find((t) => t.deviceName === device.name) ??
    candidates.find((t) => !/^WW Verify /.test(t.deviceName ?? ''))
  )
}

async function cdpEval(state, platform, expression, timeoutMs = 30_000) {
  let target = await cdpTarget(state, platform)
  // The app's debugger target can drop off Metro's list for a moment (it
  // reconnects on its own); a flow's asserts read through here right after.
  for (let i = 0; !target && i < 5; i++) {
    await sleep(2000)
    target = await cdpTarget(state, platform)
  }
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

async function launch(state, device, retry = true) {
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
  await openApp(device, {
    open: () =>
      agentDevice([
        'open',
        BUNDLE_ID,
        devClientUrl(port),
        ...target,
        '--session',
        session,
        '--relaunch',
      ]),
    closeSession: () => agentDevice(['close', '--session', session]),
    simulatorsReachable: () =>
      run('xcrun', ['simctl', 'list', 'devices', '-j'], { check: false })
        .status === 0,
    restartDaemon: stopAgentDeviceDaemon,
    appRunning: async () => Boolean(await cdpTarget(state, device.platform)),
    log,
  })
  for (let i = 0; i < 10 && !(await cdpTarget(state, device.platform)); i++)
    await sleep(2000)
  if (device.platform === 'ios' && !(await cdpTarget(state, device.platform))) {
    sessionCommand(device.platform, ['alert', 'accept'])
  }
  await waitForHarness(state, device.platform, 300_000)
  await settleAndHideSplash(state, device.platform)
  if (await clearSplash(state, device.platform)) return
  if (!retry)
    fail(
      'The native splash still covers the app after a relaunch, so taps would land on it. Run ww-verify up again; if it persists, ww-verify down and up.'
    )
  log('the native splash still covers the app; relaunching')
  await launch(state, device, false)
}

// agent-device runs one daemon per machine, and every worktree's simctl calls
// go through it. A daemon started where CoreSimulator can't be reached (a
// sandboxed or non-GUI shell) fails every iOS open, for every worktree, and
// stays up as long as any session, Android included, is open.
const SIMULATORS_UNREACHABLE = /CoreSimulatorService|xcrun exited with code 72/
const SESSION_ACTIVE = /Session already active/

/**
 * Opens the app through agent-device and fails at once with its error, rather
 * than waiting minutes for a JS runtime that never launched. Recovers a session
 * left open by an earlier `up`, and on iOS restarts a daemon that can't reach
 * simulators when this shell can.
 */
export async function openApp(device, io) {
  let result = io.open()
  if (result.status !== 0 && SESSION_ACTIVE.test(output(result))) {
    io.closeSession()
    result = io.open()
  }
  if (
    result.status !== 0 &&
    device.platform === 'ios' &&
    SIMULATORS_UNREACHABLE.test(output(result))
  ) {
    if (!io.simulatorsReachable())
      fail(
        `agent-device can't reach CoreSimulator, and neither can this shell (a sandboxed shell?). Run wwv from a shell that can run xcrun simctl list.\n${output(result).trim().slice(-800)}`
      )
    io.log(
      "agent-device's daemon can't reach CoreSimulator, though this shell can; restarting it"
    )
    io.restartDaemon()
    result = io.open()
  }
  if (result.status === 0) return
  if (await io.appRunning()) {
    io.log(
      `agent-device open failed, but the app already runs on this Metro: ${output(result).trim().slice(-300)}`
    )
    return
  }
  fail(
    `agent-device could not open the app on ${device.name}:\n${output(result).trim().slice(-1500)}`
  )
}

/**
 * Stops agent-device's daemon, so the next command starts a fresh one from this
 * shell. Other worktrees' sessions reopen on their next command.
 */
function stopAgentDeviceDaemon() {
  const stateDir =
    process.env.AGENT_DEVICE_STATE_DIR ||
    path.join(os.homedir(), '.agent-device')
  const pid = Number(readJson(path.join(stateDir, 'daemon.json'), {}).pid)
  if (!pid) return
  const command = run('ps', ['-o', 'command=', '-p', String(pid)], {
    check: false,
  }).stdout
  if (!/agent-device.*daemon\.js/.test(command)) return
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    return
  }
  for (let i = 0; i < 20; i++) {
    try {
      process.kill(pid, 0)
    } catch {
      return
    }
    sleepSync(500)
  }
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    // gone
  }
}

/**
 * Xcode 27 dev builds leave the native splash over a running app after any
 * second JS load, and the dev launcher often loads twice on a relaunch (its
 * last project, then the link), most of all on a simulator that stayed booted.
 * Waits until a marker survives 5 s (no reload), then hides the splash; hiding
 * is a no-op once it's gone.
 */
async function settleAndHideSplash(state, platform) {
  for (let i = 0; i < 8; i++) {
    const mark = JSON.stringify(`${process.pid}-${Date.now()}`)
    await cdpEval(state, platform, `globalThis.__wwvMark = ${mark}`)
    await sleep(5000)
    await waitForHarness(state, platform, 120_000)
    if (await cdpEval(state, platform, `globalThis.__wwvMark === ${mark}`))
      break
    log('the app reloaded during launch; waiting for it to settle')
  }
  await cdpEval(
    state,
    platform,
    'globalThis.expo?.modules?.ExpoSplashScreen?.hide?.() ?? null'
  )
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

/**
 * On Android the dev app starts near 1.05 GB and grows 10 to 15 MB with every
 * seed and remount, mostly screens React DevTools still records after they
 * unmount (dev builds only). Past this much PSS, `wwv flow` relaunches it
 * between flows rather than let the 2 GB emulator kill it mid-flow (near 1.5
 * GB).
 */
const ANDROID_RELAUNCH_MB = Number(
  process.env.WW_VERIFY_ANDROID_RELAUNCH_MB ?? 1400
)

/** The app's total PSS in MB on an Android device, or null. */
function androidPssMb(device) {
  const result = run(
    'adb',
    ['-s', device.id, 'shell', 'dumpsys', 'meminfo', BUNDLE_ID],
    { check: false }
  )
  const kb = Number(result.stdout?.match(/TOTAL PSS:\s+(\d+)/)?.[1])
  return Number.isFinite(kb) ? Math.round(kb / 1024) : null
}

/**
 * Why the app needs relaunching before the next flow, or null: its JS runtime
 * is gone (killed for memory, crashed), or on Android it holds more memory than
 * `WW_VERIFY_ANDROID_RELAUNCH_MB`.
 */
async function relaunchReason(state, platform) {
  if (!(await cdpTarget(state, platform)))
    return 'its JS runtime is gone (killed or crashed)'
  if (platform !== 'android') return null
  const pss = androidPssMb(state.devices[platform])
  return pss > ANDROID_RELAUNCH_MB
    ? `it holds ${pss} MB (over WW_VERIFY_ANDROID_RELAUNCH_MB=${ANDROID_RELAUNCH_MB})`
    : null
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

/** True when an agent-device command targets a snapshot ref (`@e12`, `@e12~s3`). */
export const actsOnRef = (args) => args.some((a) => /^@e\d+(~s\d+)?$/.test(a))

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
    if (flags.api && !['local', 'env'].includes(flags.api))
      fail('--api must be local or env')
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
      platform === 'ios'
        ? flags['ipad-mini']
          ? 'ipad-mini'
          : flags.ipad
            ? 'ipad'
            : flags.duo
              ? 'duo'
              : flags.se
                ? 'se'
                : 'iphone'
        : 'emulator'
    heartbeat(ROOT) // an idle agent coming back keeps its device
    await reapExpired()
    // Switching iPhone, iPad or iPhone Duo: hand back the other kind's lease first.
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
        releasePlatform(state, platform, { shutdown: true })
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
      if (
        state.api?.mode === 'local' &&
        !readLeases().some((l) => l.worktree === ROOT)
      )
        stopLocalApi(ROOT, state.api)
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
      const claim = await takeLease(platform, kind, native, flags)
      if (!claim.existing) took.lease = claim.lease
      if (claim.warm) log(`reusing warm ${claim.lease.deviceName}`)
      startHeartbeat()
      device = leaseDevice(claim.lease)
      state.devices = { ...state.devices, [platform]: device }
      writeState(state)
      // A second platform keeps the API the first one runs against.
      const shared = readLeases().some(
        (l) => l.worktree === ROOT && l.platform !== platform && !l.expired
      )
      const previous = state.api
      const apiMode = flags.api || (shared && previous?.mode) || 'local'
      if (apiMode === 'local') {
        // Recorded first, so a worktree that is stopping the shared worker
        // sees this one still needs it.
        state.api = { mode: 'local', dir: apiDir() }
        writeState(state)
        state.api = startLocalApi(state.api.dir)
      } else if (!shared || previous?.mode !== 'env') {
        state.api = { mode: 'env', url: envApiUrl(), port: null }
        const parsed = new URL(state.api.url)
        if (['localhost', '127.0.0.1'].includes(parsed.hostname))
          state.api.port = Number(parsed.port || 80)
      }
      writeState(state)
      if (previous?.mode === 'local' && previous.dir !== state.api.dir)
        stopLocalApi(ROOT, previous)
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
  async _build({ positional, flags }) {
    const platform = positional[0]
    const root = flags.worktree || ROOT
    const configuration = flags.configuration || 'Debug'
    for (const [cmd, ...args] of buildSteps(platform, {
      root,
      configuration,
    })) {
      console.log(`$ ${cmd} ${args.join(' ')}`)
      const result = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' })
      if (result.status !== 0) process.exit(result.status ?? 1)
    }
  },

  async doctor({ flags }) {
    const state = readState()
    const checks = []
    // A warning prints but doesn't fail doctor.
    const check = (name, ok, detail, warn = false) =>
      checks.push({ name, ok, detail, warn })
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
      // The shared `.env` API (--api env) only matters to changes that touch
      // the backend, which run against the local one; a run's own API must be up.
      const shared = state.api.mode !== 'local'
      check(
        'api',
        health.status === 200,
        `${state.api.mode} ${state.api.url}${state.api.sha ? ` (ww-api ${state.api.sha.slice(0, 7)})` : ''} -> ${health.status} ${health.text.slice(0, 120)}${health.status !== 200 && shared ? ' (fine for UI-only checks; drop --api env for backend data)' : ''}`,
        shared
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
      if (platform === 'ios') {
        const axe = axeBin()
        check(
          'ios:axe',
          Boolean(axe),
          axe
            ? `${axe} (reads the screen where agent-device can't)`
            : `missing; ${AXE_MISSING.split(': ')[1]}${isIpadKind(device.kind) ? ' (needed to drive an iPad)' : ''}`,
          !isIpadKind(device.kind)
        )
        const covered = splashCovers(state, platform)
        check(
          'ios:screen',
          !covered,
          covered
            ? 'the native splash covers the app and swallows taps; run ww-verify up'
            : 'app visible, no splash over it'
        )
      }
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
      console.log(
        `${c.ok ? 'ok  ' : c.warn ? 'warn' : 'FAIL'} ${c.name.padEnd(18)} ${c.detail}`
      )
    if (checks.some((c) => !c.ok && !c.warn)) process.exitCode = 1
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
      fail(
        'Usage: ww-verify seed <fresh|onboarded|publisher|pioneer|busy|badges|stress>'
      )
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
      fail('Usage: ww-verify flag <buddies|scribe-ai> <on|off|clear>')
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
      sessionCommand(platform, ['alert', 'accept'])
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
    // `open` counts as a device action, so it expires every ref the last
    // snapshot minted. A command that acts on a ref came right after that
    // snapshot in this session, so the app is already open.
    if (!['open', 'close'].includes(args[0]) && !actsOnRef(args))
      ensureSession(state, platform)
    if (DRIVEN.has(args[0]) || args.includes('--settle')) {
      const result = drive(state, platform, args)
      if (result.stdout)
        process.stdout.write(result.stdout.replace(/\n?$/, '\n'))
      if (result.stderr) process.stderr.write(result.stderr)
      process.exitCode = result.status ?? 1
      return
    }
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
    const agentDevice = (args) => drive(state, platform, args)
    const evalApp = (expression) => cdpEval(state, platform, expression)
    for (const flow of flows) {
      const source = fs.readFileSync(flow, 'utf8')
      const name = path.basename(flow, '.yaml')
      const startedAt = Date.now()
      const relaunch = await relaunchReason(state, platform)
      if (relaunch) {
        log(`relaunching the app before ${name}: ${relaunch}`)
        await launch(state, state.devices[platform])
      }
      // Brings the app forward again if a failed flow left another app (a
      // share sheet's target) in front.
      ensureSession(state, platform)
      // Every flow starts on a freshly seeded, remounted app, whatever the
      // last one left open; `# setup: <js>` lines then adjust the seeded
      // state, e.g. clearing a day the scenario fills only on some weekdays.
      const start = (strictReader) =>
        startFlow(
          {
            seed: source.match(/^# seed: (\S+)/m)?.[1],
            setup: [...source.matchAll(/^# setup: (.+)$/gm)].map((m) => m[1]),
          },
          { agentDevice, evalApp, strictReader }
        )
      let started = await start(platform === 'ios')
      // A render error can leave the app running with no screens (the remount
      // never comes back), and agent-device can turn its iOS reader off for
      // the app process; a relaunch clears both.
      if (started) {
        log(`relaunching the app before ${name}: ${started.output}`)
        await launch(state, state.devices[platform])
        started = await start(false)
      }
      await evalApp('__WW_DEV__.clearErrors()').catch(() => {})
      const result =
        started ??
        (await runSteps(readFlow(source).steps, agentDevice, evalApp, platform))
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
      // The screen as the flow left it, whichever check failed.
      if (!ok) screenshot(state, platform, `flow-${name}-failed`)
      const seconds = Math.round((Date.now() - startedAt) / 1000)
      results.push({
        flow: name,
        ok,
        seconds,
        steps: result,
        jsErrors,
        failedAsserts,
      })
      console.log(
        `${ok ? 'PASS' : 'FAIL'} ${platform} ${name} (${seconds} s)${jsErrors.length ? ` (${jsErrors.length} JS errors)` : ''}${failedAsserts.length ? ` (failed: ${failedAsserts.map((a) => a.expression).join('; ')})` : ''}`
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
      agentDevice: (args) => drive(state, platform, args),
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
    if (state.api?.mode === 'local') stopLocalApi(ROOT, state.api)
    const evidence = state.runId
      ? path.relative(ROOT, path.join(STATE_DIR, 'artifacts', state.runId))
      : null
    fs.rmSync(STATE_FILE, { force: true })
    log(`stopped Metro; evidence kept in ${evidence ?? '.verify/artifacts'}`)
  },

  // Boots devices until each platform runs WW_VERIFY_WARM_MIN (leased or
  // warm); run it from launchd to keep the floor after builds and reboots.
  async warm() {
    await reapExpired()
    const below = belowFloor()
    if (!Object.keys(below).length) {
      console.log(`ok: every platform runs at least ${CONFIG.warmMin}`)
      return
    }
    for (const [platform, missing] of Object.entries(below)) {
      if (
        readLeases().some((l) => l.worktree === ROOT && l.platform === platform)
      ) {
        log(`skipping ${platform}: this checkout holds a ${platform} lease`)
        continue
      }
      for (let i = 0; i < missing; i++) {
        const name = await warmOne(platform)
        if (!name) break
        console.log(`warmed ${name}`)
      }
    }
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
    const { leases, builds, warm, waiters, buildWaiters, usedGb, memory } =
      snapshot()
    const names = Object.fromEntries(
      simctlDevices().map((d) => [d.udid, d.name])
    )
    const ago = (ms) => `${Math.round((Date.now() - ms) / 60_000)}m`
    const pressure = { 1: 'normal', 2: 'warn', 4: 'critical' }
    console.log(
      `memory ${usedGb} / ${CONFIG.budgetGb} GB budgeted${memory ? `; ${memory.free}% free, pressure ${pressure[memory.pressure] ?? memory.pressure} (macOS)` : ''}\n`
    )
    const policy = {
      WW_VERIFY_MEMORY_BUDGET_GB: CONFIG.budgetGb,
      WW_VERIFY_MAX_IOS: CONFIG.max.ios,
      WW_VERIFY_MAX_ANDROID: CONFIG.max.android,
      WW_VERIFY_MAX_BUILDS: CONFIG.maxBuilds,
      WW_VERIFY_MIN_FREE_PCT: CONFIG.minFreePct,
      WW_VERIFY_MIN_FREE_PCT_BUILD: CONFIG.minFreePctBuild,
      WW_VERIFY_SETTLE_SEC: CONFIG.settleSec,
      WW_VERIFY_LEASE_IDLE_MIN: CONFIG.idleMin,
      WW_VERIFY_WARM: CONFIG.warm,
      WW_VERIFY_WARM_HOURS: CONFIG.warmHours,
      WW_VERIFY_WARM_MIN: CONFIG.warmMin,
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
    const installs = readJson(INSTALLS, {})
    printTable(
      'WARM (booted, unleased; the next up takes these first)',
      ['platform', 'device', 'warm for', 'installed build', 'state'],
      warm.map((w) => [
        w.platform,
        w.deviceName ?? w.key,
        ago(w.since),
        String(installs[w.key]?.fingerprint ?? '-').slice(0, 12),
        w.evicting ? `shutting down (${w.evicting})` : 'ready',
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

  up [--platform ios|android] [--ipad|--ipad-mini|--duo|--se] [--api local|env] [--seed <scenario>]
     [--rebuild] [--accept-stale-native] [--wait 30] [--keep-build-dirs]
                                           lease a device, start the local API and
                                           Metro, install, launch
  doctor                                   read-only health check (exit 1 on failure)
  seed <fresh|onboarded|publisher|pioneer|busy|badges|stress>
  eval '<js expression>'                   run JS in the app, print JSON
  flag <buddies|scribe-ai> <on|off|clear>
  nav "<Route Name>" ['{"json":"params"}']
  link <url>                               open a deep link (accepts the iOS prompt)
  ad <agent-device args...>                agent-device with this run's session
  shot <label>                             screenshot into .verify/artifacts/<run>
  errors [--clear]                         JS errors captured since launch
  flow [files or dirs]                     Maestro flows (default e2e/maestro)
  monkey [--steps 120] [--seed N] [--scenario pioneer]
  down [--platform p] [--shutdown] [--keep-device]
                                           release devices (kept booted while the
                                           warm pool has room), stop Metro, keep evidence
  status                                   machine-wide leases, queue, builds, Metros, memory
  warm                                     boot devices up to WW_VERIFY_WARM_MIN per platform
  gc                                       reap expired leases (also runs on every up)`)
  },
}

// scripts/perf drives Release builds through the same leases, build slots and
// install records.
export {
  BUNDLE_ID,
  Failure,
  INSTALLS,
  ROOT,
  agentDevice,
  apiDir,
  artifactHash,
  bootAndroid,
  bootIos,
  fail,
  installedHash,
  killIosRunner,
  leaseDevice,
  log,
  readJson,
  readState,
  reapExpired,
  releasePlatform,
  run,
  sessionName,
  screenshot,
  shutdownWarmDevice,
  simctlDevices,
  stopAgentDeviceDaemon,
  sleep,
  startHeartbeat,
  startLocalApi,
  stopLocalApi,
  takeLease,
  toolEnv,
  unlockAndroid,
  updateInstalls,
  waitLogger,
  writeJson,
  writeState,
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
