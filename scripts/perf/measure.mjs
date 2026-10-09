// Drives a leased simulator or emulator through the profiling protocol: a
// fresh install and seed, cold launches, foreground cycles and inactive blips,
// reading the app's `[ww-perf]` reports from the device log.
import os from 'node:os'
import { spawn } from 'node:child_process'
import { readLeases, snapshot } from '../verify/leases.mjs'
import {
  BUNDLE_ID,
  ROOT,
  agentDevice,
  killIosRunner,
  log,
  run,
  sleep,
  toolEnv,
} from '../verify/ww-verify.mjs'
import { createPerfReader, launchMetrics } from './stats.mjs'

/**
 * A running device-log reader. `mark()` notes the position, and `next()`
 * resolves with the first report of a type that arrived after it.
 */
class PerfLog {
  constructor(command, args, parse) {
    this.reports = []
    this.waiters = []
    this.lines = []
    const read = createPerfReader()
    this.child = spawn(command, args, {
      env: toolEnv(),
      stdio: ['ignore', 'pipe', 'ignore'],
      // Its own group, so stop() takes `script` and its child down together.
      detached: true,
    })
    let buffer = ''
    this.child.stdout.on('data', (chunk) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop()
      for (const line of lines) {
        const entry = parse(line)
        if (!entry) continue
        this.lines.push(entry)
        const report = entry.message.includes('[ww-perf')
          ? read(entry.message)
          : null
        if (report) this.push(report)
        else this.flush()
      }
    })
  }

  push(report) {
    this.reports.push(report)
    this.flush()
  }

  flush() {
    for (const waiter of [...this.waiters]) {
      const found = waiter.find()
      if (found === undefined) continue
      this.waiters.splice(this.waiters.indexOf(waiter), 1)
      waiter.resolve(found)
    }
  }

  mark() {
    return { reports: this.reports.length, lines: this.lines.length }
  }

  /** The first report of `type` after `mark`, or a rejection on timeout. */
  next(type, mark, timeoutMs) {
    return this.waitFor(
      () => this.reports.slice(mark.reports).find((r) => r.type === type),
      timeoutMs,
      `no ${type} report within ${timeoutMs / 1000} s`
    )
  }

  /** The first raw log line after `mark` matching `test`. */
  line(test, mark, timeoutMs) {
    return this.waitFor(
      () => this.lines.slice(mark.lines).find(test),
      timeoutMs,
      'no matching log line'
    )
  }

  waitFor(find, timeoutMs, message) {
    const found = find()
    if (found !== undefined) return Promise.resolve(found)
    return new Promise((resolve, reject) => {
      const waiter = {
        find,
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
      }
      const timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(waiter), 1)
        reject(new Error(message))
      }, timeoutMs)
      this.waiters.push(waiter)
    })
  }

  stop() {
    try {
      process.kill(-this.child.pid, 'SIGTERM')
    } catch {
      // already gone
    }
  }
}

// ---------- iOS ----------

function iosDriver(device) {
  // simctl itself rather than `xcrun simctl`, so launch timing doesn't include
  // xcrun's lookup.
  const simctl = run('xcrun', ['-f', 'simctl']).stdout.trim()
  const sim = (args, options = {}) => run(simctl, args, options)
  return {
    install(artifact) {
      sim(['terminate', device.id, BUNDLE_ID], { check: false })
      sim(['uninstall', device.id, BUNDLE_ID], { check: false })
      sim(['install', device.id, artifact])
      for (const service of [
        'calendar',
        'location-always',
        'contacts',
        'photos',
      ])
        sim(['privacy', device.id, 'grant', service, BUNDLE_ID], {
          check: false,
        })
    },
    logs() {
      // Under a pty (`script`), so the stream can't sit in a pipe buffer.
      return new PerfLog(
        'script',
        [
          '-q',
          '/dev/null',
          simctl,
          'spawn',
          device.id,
          'log',
          'stream',
          '--level',
          'info',
          '--style',
          'ndjson',
          '--predicate',
          'subsystem == "com.facebook.react.log" AND eventMessage CONTAINS "[ww-perf"',
        ],
        (line) => {
          if (!line.startsWith('{')) return null
          try {
            const entry = JSON.parse(line)
            return { at: Date.now(), message: entry.eventMessage ?? '' }
          } catch {
            return null
          }
        }
      )
    },
    async launch() {
      const launchWall = Date.now()
      const result = sim(['launch', device.id, BUNDLE_ID])
      const launchCommandMs = Date.now() - launchWall
      const pid = Number(result.stdout.trim().split(/:\s*/).pop())
      return { launchWall, launchCommandMs, pid }
    },
    terminate() {
      sim(['terminate', device.id, BUNDLE_ID], { check: false })
    },
    background() {
      sim(['launch', device.id, 'com.apple.Preferences'])
    },
    foreground() {
      sim(['launch', device.id, BUNDLE_ID])
    },
    rssKb(pid) {
      const out = run('ps', ['-o', 'rss=', '-p', String(pid)], { check: false })
      return Number(out.stdout.trim()) || null
    },
    /**
     * Accepts the notification permission alert the first launch's setup
     * raises, through agent-device's XCUITest runner, until `done()`; then
     * stops the runner so it doesn't load the measured launches.
     */
    async acceptAlerts(session, done) {
      agentDevice([
        'open',
        BUNDLE_ID,
        '--platform',
        'ios',
        '--udid',
        device.id,
        '--session',
        session,
      ])
      const deadline = Date.now() + 150_000
      while (!done() && Date.now() < deadline) {
        agentDevice(['alert', 'accept', '--session', session])
        await sleep(2000)
      }
      agentDevice(['close', '--session', session])
      killIosRunner(device.id)
    },
    /**
     * An inactive -> active blip without leaving the app: Control Center pulled
     * down from the top-right corner, then pushed back up. Points fit the
     * pool's `iPhone N Pro` simulators.
     */
    async blip(session) {
      agentDevice(['swipe', '360', '12', '360', '420', '--session', session])
      await sleep(1500)
      agentDevice(['swipe', '200', '700', '200', '150', '--session', session])
    },
  }
}

// ---------- Android ----------

function androidDriver(device) {
  const adb = (args, options = {}) =>
    run('adb', ['-s', device.id, ...args], options)
  const shell = (args, options) => adb(['shell', ...args], options)
  let component
  return {
    install(artifact) {
      adb(['uninstall', BUNDLE_ID], { check: false })
      adb(['install', '-g', artifact], { timeout: 300_000 })
      component = shell([
        'cmd',
        'package',
        'resolve-activity',
        '--brief',
        '-c',
        'android.intent.category.LAUNCHER',
        BUNDLE_ID,
      ])
        .stdout.trim()
        .split('\n')
        .pop()
        .trim()
    },
    prepare(apiPort) {
      adb(['reverse', `tcp:${apiPort}`, `tcp:${apiPort}`])
      shell(['svc', 'power', 'stayon', 'true'], { check: false })
      shell(['input', 'keyevent', 'KEYCODE_WAKEUP'], { check: false })
      shell(['wm', 'dismiss-keyguard'], { check: false })
      // As `wwv up` does: no Google "Location Accuracy" dialog over the app.
      shell(
        ['settings', 'put', 'secure', 'location_providers_allowed', '+network'],
        { check: false }
      )
    },
    logs() {
      adb(['logcat', '-c'], { check: false })
      return new PerfLog(
        'adb',
        [
          '-s',
          device.id,
          'logcat',
          '-v',
          'epoch',
          'ReactNativeJS:I',
          'ActivityTaskManager:I',
          '*:S',
        ],
        (line) => {
          const m = line.match(
            /^\s*(\d+\.\d+)\s+\d+\s+\d+\s+[VDIWEF]\s+([^:]+?)\s*:\s(.*?)\r?$/
          )
          return m
            ? { at: Math.round(Number(m[1]) * 1000), tag: m[2], message: m[3] }
            : null
        }
      )
    },
    async launch(perfLog) {
      const mark = perfLog.mark()
      const hostWall = Date.now()
      const out = shell(['am', 'start', '-W', '-n', component]).stdout
      const totalTimeMs = Number(out.match(/TotalTime:\s*(\d+)/)?.[1]) || null
      // The system's START line, on the device clock like the app's Date.now().
      const start = await perfLog
        .line(
          (l) =>
            l.tag === 'ActivityTaskManager' &&
            /\bSTART u0\b/.test(l.message) &&
            l.message.includes(BUNDLE_ID),
          mark,
          5000
        )
        .catch(() => null)
      const pid =
        Number(shell(['pidof', BUNDLE_ID], { check: false }).stdout.trim()) ||
        null
      return {
        launchWall: start?.at ?? hostWall,
        launchWallSource: start ? 'device' : 'host',
        pid,
        totalTimeMs,
      }
    },
    terminate() {
      shell(['am', 'force-stop', BUNDLE_ID], { check: false })
    },
    background() {
      shell(['input', 'keyevent', 'KEYCODE_HOME'])
    },
    foreground() {
      shell(['am', 'start', '-n', component])
    },
    rssKb() {
      const out = shell(['dumpsys', 'meminfo', BUNDLE_ID], {
        check: false,
      }).stdout
      return Number(out.match(/TOTAL RSS:\s*(\d+)/)?.[1]) || null
    },
    pssKb() {
      const out = shell(['dumpsys', 'meminfo', BUNDLE_ID], {
        check: false,
      }).stdout
      return Number(out.match(/TOTAL PSS:\s*(\d+)/)?.[1]) || null
    },
  }
}

export const createDriver = (device) =>
  device.platform === 'ios' ? iosDriver(device) : androidDriver(device)

// ---------- machine conditions ----------

/** Load and memory next to every measurement, so noise is visible. */
export function machineConditions() {
  const level = run('sysctl', ['-n', 'kern.memorystatus_level'], {
    check: false,
  }).stdout.trim()
  const [load1, load5] = os.loadavg()
  const { builds } = snapshot()
  const others = readLeases().filter((l) => l.worktree !== ROOT && !l.expired)
  return {
    at: Date.now(),
    load1: Math.round(load1 * 100) / 100,
    load5: Math.round(load5 * 100) / 100,
    memoryFreePct: Number(level) || null,
    otherDevices: others.length,
    otherLeases: others.map(
      (l) =>
        `${l.platform}:${l.deviceName ?? l.key}@${l.worktree.split('/').pop()}`
    ),
    builds: builds.map((b) => `${b.platform}@${b.worktree.split('/').pop()}`),
  }
}

// ---------- protocol ----------

const LAUNCH_TIMEOUT = 90_000
const CYCLE_TIMEOUT = 30_000

/**
 * The whole protocol on one leased, booted device with the artifact. Returns
 * the platform's raw results (summaries are added by the caller).
 */
export async function profileDevice(device, artifact, options) {
  const driver = createDriver(device)
  const session = `wwperf-${device.platform}`
  log(`installing ${artifact.split('/').pop()} fresh on ${device.name}`)
  driver.install(artifact)
  if (device.platform === 'android') driver.prepare(options.apiPort)
  const perfLog = driver.logs()
  await sleep(1500) // let the log stream attach
  try {
    // 1. First launch: the app seeds and turns its paths on (perfSetup.ts).
    log('first launch: seeding and setup')
    let mark = perfLog.mark()
    await driver.launch(perfLog)
    if (device.platform === 'ios')
      await driver.acceptAlerts(session, () =>
        perfLog.reports.slice(mark.reports).some((r) => r.type === 'setup')
      )
    const setup = await perfLog.next('setup', mark, 180_000)
    log(`setup: ${JSON.stringify(setup)}`)
    await perfLog.next('launch', mark, LAUNCH_TIMEOUT)
    await sleep(3000) // let stores persist

    // 2. Cold launches; the first is a warm-up and is discarded.
    const runs = []
    for (let i = 0; i <= options.runs; i++) {
      driver.terminate()
      await sleep(options.settleMs)
      const conditions = machineConditions()
      mark = perfLog.mark()
      const launched = await driver.launch(perfLog)
      const report = await perfLog.next('launch', mark, LAUNCH_TIMEOUT)
      const rssKb = driver.rssKb(launched.pid)
      const metrics = launchMetrics(report, { ...launched, rssKb })
      runs.push({
        index: i,
        discarded: i === 0,
        ...launched,
        conditions,
        metrics,
        report,
      })
      log(
        `launch ${i}${i === 0 ? ' (warm-up)' : ''}: ${Math.round(metrics.endToEndMs)} ms to first screen, ${metrics.blockedMsAfterReady} ms blocked, load ${conditions.load1}`
      )
    }

    // 3. Foreground cycles from the last launch, which is still running.
    const foreground = []
    for (let i = 0; i < options.foreground; i++) {
      await sleep(options.dwellMs)
      const conditions = machineConditions()
      driver.background()
      await sleep(options.backgroundMs)
      mark = perfLog.mark()
      const at = Date.now()
      driver.foreground()
      const report = await perfLog.next('foreground', mark, CYCLE_TIMEOUT)
      foreground.push({ index: i, at, conditions, report })
      log(
        `foreground ${i}: ${report.blockedMs} ms blocked, ${JSON.stringify(report.counters)}`
      )
    }

    // 4. Inactive blips (iOS): back to active without the background.
    let active = { skipped: 'Android has no inactive state' }
    if (device.platform === 'ios' && options.blips > 0) {
      active = await measureBlips(device, driver, perfLog, session, options)
    }
    return {
      device: device.name,
      setup,
      launch: { runs, discarded: 1 },
      foreground: { cycles: foreground },
      active,
    }
  } finally {
    perfLog.stop()
    if (device.platform === 'ios') {
      agentDevice(['close', '--session', session])
      killIosRunner(device.id)
    }
  }
}

async function measureBlips(device, driver, perfLog, session, options) {
  agentDevice([
    'open',
    BUNDLE_ID,
    '--platform',
    'ios',
    '--udid',
    device.id,
    '--session',
    session,
  ])
  const cycles = []
  for (let i = 0; i < options.blips; i++) {
    await sleep(options.dwellMs)
    const mark = perfLog.mark()
    const at = Date.now()
    await driver.blip(session)
    const report = await perfLog
      .next('active', mark, CYCLE_TIMEOUT)
      .catch(() => null)
    if (!report) {
      return {
        skipped:
          'no inactive -> active report after opening Control Center; see docs/perf/README.md',
      }
    }
    cycles.push({ index: i, at, conditions: machineConditions(), report })
  }
  return { cycles }
}
