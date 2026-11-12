#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import {
  BUNDLE_ID,
  Failure,
  ROOT,
  artifactHash,
  bootIos,
  fail,
  killOwnBuild,
  leaseDevice,
  log,
  readState,
  releasePlatform,
  run,
  sleep,
  startHeartbeat,
  takeLease,
  updateInstalls,
  writeJson,
  writeState,
} from '../verify/ww-verify.mjs'
import { startApi } from './api.mjs'
import {
  API_PORT,
  removeSourceTree,
  resolvePerfBuild,
  resolveSha,
  sourceKey,
} from './build.mjs'
import { createDriver, machineConditions } from './measure.mjs'
import { percentile } from './stats.mjs'

const HELP = `node scripts/perf/scrub.mjs [--ref HEAD] [--name <name>]
node scripts/perf/scrub.mjs compare docs/perf/a.json docs/perf/b.json …
  --scenario stress     data to seed (busy, pioneer, stress, …)
  --rounds 6            measured gestures (one discarded warm-up first)
  --pattern drag        drag: finger held, moved up and down; fling: release each stroke
  --period 500          ms per up-and-down cycle
  --amplitude 280       points the finger travels each way
  --seconds 8           seconds of gesture per round
  --hz 120              touch samples per second (a ProMotion screen samples at 120)
  --trace               also record an Instruments Time Profiler trace of round 1
  --shot <png>          screenshot the Schedule before the first gesture (with --rounds 0, only that)
  --out-dir docs/perf   where <name>.json and <name>.md go
  --rebuild             ignore the cached build
  --wait 60             minutes to wait for a build slot or a device`

function parseFlags(argv) {
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const [key, inline] = arg.slice(2).split('=')
    const next = argv[i + 1]
    if (inline !== undefined) flags[key] = inline
    else if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next
      i++
    } else flags[key] = true
  }
  return flags
}

const AXE_FRAMEWORKS = '/opt/homebrew/opt/axe/libexec/Frameworks'
const TOOL_DIR = path.join(os.homedir(), '.ww-verify', 'tools', 'scrub-touch')

function touchTool() {
  const source = path.join(ROOT, 'scripts/perf/scrub-touch/main.swift')
  const binary = path.join(TOOL_DIR, 'scrub-touch')
  const stamp = path.join(TOOL_DIR, 'source.sha')
  const hash = run('shasum', [source]).stdout.split(' ')[0]
  if (fs.existsSync(binary) && fs.readFileSync(stamp, 'utf8') === hash)
    return binary
  if (!fs.existsSync(AXE_FRAMEWORKS))
    fail(`scrub needs AXe's frameworks at ${AXE_FRAMEWORKS}`)
  log('building the scrub-touch HID tool')
  fs.rmSync(TOOL_DIR, { recursive: true, force: true })
  const frameworks = path.join(TOOL_DIR, 'Frameworks')
  fs.mkdirSync(frameworks, { recursive: true })
  for (const name of ['FBControlCore', 'FBSimulatorControl', 'XCTestBootstrap'])
    run('cp', [
      '-R',
      path.join(AXE_FRAMEWORKS, `${name}.framework`),
      frameworks,
    ])

  for (const name of [
    'FBControlCore',
    'FBSimulatorControl',
    'XCTestBootstrap',
  ]) {
    const dir = path.join(
      frameworks,
      `${name}.framework/Versions/A/Modules/${name}.swiftmodule`
    )
    if (!fs.existsSync(dir)) continue
    for (const file of fs.readdirSync(dir)) {
      const full = path.join(dir, file)
      if (
        file.endsWith('.private.swiftinterface') ||
        file.endsWith('.swiftmodule')
      )
        fs.rmSync(full)
      else if (file.endsWith('.swiftinterface'))
        fs.writeFileSync(
          full,
          fs
            .readFileSync(full, 'utf8')
            .replace(
              new RegExp(`(^|[^A-Za-z_])${name}\\.([A-Z])`, 'gm'),
              '$1$2'
            )
            .replace(/IOSurface\.IOSurface([^A-Za-z_])/g, 'IOSurface$1')
            .replace(/CoreSimulator\.([A-Z])/g, '$1')
        )
    }
  }
  const stubs = path.join(TOOL_DIR, 'stubs/CoreSimulator')
  fs.mkdirSync(stubs, { recursive: true })
  fs.writeFileSync(
    path.join(stubs, 'CoreSimulator.h'),
    '#import <Foundation/Foundation.h>\n' +
      ['SimDevice', 'SimDeviceSet', 'SimDeviceType', 'SimRuntime']
        .map((c) => `@interface ${c} : NSObject @end\n`)
        .join('')
  )
  fs.writeFileSync(
    path.join(stubs, 'module.modulemap'),
    'module CoreSimulator {\n  header "CoreSimulator.h"\n  export *\n}\n'
  )

  const xcode26 = '/Applications/Xcode_26.app/Contents/Developer'
  run(
    'xcrun',
    [
      '--sdk',
      'macosx',
      'swiftc',
      '-O',
      '-F',
      frameworks,
      '-I',
      path.dirname(stubs),
      '-Xlinker',
      '-rpath',
      '-Xlinker',
      AXE_FRAMEWORKS,
      source,
      '-o',
      binary,
    ],
    {
      env: fs.existsSync(xcode26) ? { DEVELOPER_DIR: xcode26 } : {},
      timeout: 300_000,
    }
  )
  fs.writeFileSync(stamp, hash)
  return binary
}

function runGesture(
  tool,
  udid,
  { x, top, bottom, pattern, periodMs, seconds, hz }
) {
  const result = run(tool, [
    udid,
    String(x),
    String(bottom),
    String(top),
    String(periodMs),
    String(seconds),
    String(hz),
    pattern,
  ])
  const line = result.stdout.trim().split('\n').pop()
  return JSON.parse(line)
}

function framesIn(trace, from, to) {
  const deltas = []
  for (let i = 0; i < trace.deltas.length; i++) {
    const at = trace.start + trace.wall[i]
    if (at >= from && at <= to) deltas.push(trace.deltas[i] / 100)
  }
  return deltas
}

const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10)

function frameStats(deltas, period) {
  if (!deltas.length) return null
  const sorted = [...deltas].sort((a, b) => a - b)
  const late = deltas.filter((d) => d > period * 1.5)
  const hitchMs = late.reduce((sum, d) => sum + (d - period), 0)
  const durationS = deltas.reduce((sum, d) => sum + d, 0) / 1000
  const missed = deltas.reduce(
    (sum, d) => sum + Math.max(0, Math.round(d / period) - 1),
    0
  )
  return {
    frames: deltas.length,
    durationS: round1(durationS),
    fps: round1(deltas.length / durationS),
    p50: round1(percentile(sorted, 0.5)),
    p95: round1(percentile(sorted, 0.95)),
    p99: round1(percentile(sorted, 0.99)),
    max: round1(sorted[sorted.length - 1]),
    hitches: late.length,
    longFrames33: deltas.filter((d) => d > 33.4).length,
    missedFrames: missed,
    droppedPct: round1((missed / (deltas.length + missed)) * 100),
    hitchMsPerS: round1(hitchMs / durationS),
  }
}

function refreshPeriod(trace, before) {
  const idle = framesIn(trace, trace.start, before - 200)
  const sorted = idle.sort((a, b) => a - b)
  const median = percentile(sorted, 0.5)
  return median ? (median < 11 ? 1000 / 120 : 1000 / 60) : 1000 / 60
}

const median = (values) => {
  const v = values.filter((x) => x != null).sort((a, b) => a - b)
  return v.length ? round1(percentile(v, 0.5)) : null
}

function summarize(rounds) {
  const measured = rounds.filter((r) => !r.discarded)
  const pick = (thread, key) => median(measured.map((r) => r[thread]?.[key]))
  const keys = [
    'fps',
    'p50',
    'p95',
    'p99',
    'max',
    'hitches',
    'longFrames33',
    'missedFrames',
    'droppedPct',
    'hitchMsPerS',
  ]
  const counters = {}
  for (const r of measured)
    for (const [k, v] of Object.entries(r.counters ?? {}))
      (counters[k] ??= []).push(v)
  return {
    rounds: measured.length,
    ui: Object.fromEntries(keys.map((k) => [k, pick('ui', k)])),
    js: Object.fromEntries(keys.map((k) => [k, pick('js', k)])),
    counters: Object.fromEntries(
      Object.entries(counters)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, median(v)])
    ),
    gcs: median(measured.map((r) => r.gcs)),
  }
}

export function renderScrubMarkdown(result) {
  const s = result.summary
  const lines = [
    `# Schedule scrub: ${result.name}`,
    '',
    `Commit \`${result.sha.slice(0, 12)}\`, Release build, ${result.device}, scenario \`${result.scenario}\`, pattern \`${result.gesture.pattern}\` (${result.gesture.periodMs} ms per cycle, ${result.gesture.amplitude} pt each way, ${result.gesture.hz} Hz touch samples, ${result.gesture.seconds} s per round), median of ${s.rounds} rounds. Refresh period ${round1(result.periodMs)} ms.`,
    '',
    '| Metric | UI thread | JS thread |',
    '| --- | ---: | ---: |',
    ...[
      ['Frames per second', 'fps'],
      ['Frame time p50 (ms)', 'p50'],
      ['Frame time p95 (ms)', 'p95'],
      ['Frame time p99 (ms)', 'p99'],
      ['Worst frame (ms)', 'max'],
      ['Hitches (frames > 1.5 periods)', 'hitches'],
      ['Frames > 33 ms', 'longFrames33'],
      ['Missed refreshes', 'missedFrames'],
      ['Dropped (% of refreshes)', 'droppedPct'],
      ['Hitch time ratio (ms/s)', 'hitchMsPerS'],
    ].map(([label, key]) => `| ${label} | ${s.ui[key]} | ${s.js[key]} |`),
    '',
    '| Counter (per round) | Median |',
    '| --- | ---: |',
    ...Object.entries(s.counters).map(([k, v]) => `| \`${k}\` | ${v} |`),
    `| Hermes GCs | ${s.gcs} |`,
    '',
  ]
  return lines.join('\n')
}

const COMPARE_ROWS = [
  ['UI thread fps', 'ui', 'fps'],
  ['UI frame time p95 (ms)', 'ui', 'p95'],
  ['UI worst frame (ms)', 'ui', 'max'],
  ['UI hitches', 'ui', 'hitches'],
  ['UI dropped (% of refreshes)', 'ui', 'droppedPct'],
  ['UI hitch time ratio (ms/s)', 'ui', 'hitchMsPerS'],
  ['JS thread fps', 'js', 'fps'],
  ['JS frame time p95 (ms)', 'js', 'p95'],
  ['JS worst frame (ms)', 'js', 'max'],
  ['JS dropped (% of refreshes)', 'js', 'droppedPct'],
  ['JS hitch time ratio (ms/s)', 'js', 'hitchMsPerS'],
]

export function renderScrubComparison(results) {
  const header = `| Metric | ${results.map((r) => r.name).join(' | ')} |`
  const rule = `| --- |${results.map(() => ' ---: |').join('')}`
  const rows = COMPARE_ROWS.map(
    ([label, thread, key]) =>
      `| ${label} | ${results.map((r) => r.summary[thread][key]).join(' | ')} |`
  )
  const counters = [
    ...new Set(results.flatMap((r) => Object.keys(r.summary.counters))),
  ].sort()
  const counterRows = counters.map(
    (k) =>
      `| \`${k}\` per round | ${results.map((r) => r.summary.counters[k] ?? 0).join(' | ')} |`
  )
  return [
    header,
    rule,
    ...rows,
    ...counterRows,
    `| Hermes GCs per round | ${results.map((r) => r.summary.gcs).join(' | ')} |`,
  ].join('\n')
}

async function main() {
  const flags = parseFlags(process.argv.slice(2))
  if (process.argv[2] === 'help' || flags.help) {
    console.log(HELP)
    return
  }
  if (process.argv[2] === 'compare') {
    const files = process.argv.slice(3).filter((a) => !a.startsWith('--'))
    console.log(
      renderScrubComparison(
        files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')))
      )
    )
    return
  }
  const ref = flags.ref || 'HEAD'
  const sha = resolveSha(ref)
  const scenario = flags.scenario ?? 'stress'
  const rounds = Number(flags.rounds ?? 6)
  const gesture = {
    pattern: flags.pattern ?? 'drag',
    periodMs: Number(flags.period ?? 500),
    amplitude: Number(flags.amplitude ?? 280),
    seconds: Number(flags.seconds ?? 8),
    hz: Number(flags.hz ?? 120),
  }
  if (!['drag', 'fling'].includes(gesture.pattern))
    fail('--pattern must be drag or fling')
  const name = flags.name ?? `scrub-${sha.slice(0, 12)}`

  const tool = touchTool()
  const build = await resolvePerfBuild('ios', sha, {
    ...flags,
    'no-static': true,
  })
  removeSourceTree(sha)

  const state = readState()
  const api = await startApi({ port: API_PORT, apiDir: flags['api-dir'] })
  state.api = { mode: `perf-${api.mode}`, url: api.url, port: api.port }
  writeState(state)
  const stop = () => {
    killOwnBuild()
    releasePlatform(state, 'ios', {})
    api.stop()
    delete state.api
    writeState(state)
  }
  const onSignal = (signal) => {
    log(`${signal}: releasing devices`)
    stop()
    process.exit(130)
  }
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'])
    process.on(signal, onSignal)

  const result = {
    version: 1,
    name,
    ref,
    sha,
    sourceKey: sourceKey(sha),
    scenario,
    gesture,
    capturedAt: new Date().toISOString(),
    command:
      `node scripts/perf/scrub.mjs ${process.argv.slice(2).join(' ')}`.trim(),
    machine: {
      host: os.hostname(),
      cpu: os.cpus()[0]?.model,
      cores: os.cpus().length,
      ramGb: Math.round(os.totalmem() / 2 ** 30),
      atStart: machineConditions(),
    },
    rounds: [],
  }

  let perfLog
  try {
    const native = {
      fingerprint: `perf-${sourceKey(sha)}`,
      artifact: build.path,
    }
    const claim = await takeLease('ios', 'iphone', native, flags)
    startHeartbeat()
    const device = leaseDevice(claim.lease)
    state.devices = { ...state.devices, ios: device }
    writeState(state)
    bootIos(device)
    updateInstalls((installs) => {
      installs[device.lockKey] = {
        fingerprint: native.fingerprint,
        hash: artifactHash(build.path),
        artifact: build.path,
        at: Date.now(),
      }
    })
    result.device = device.name
    const driver = createDriver(device)
    log(`installing the Release probe build fresh on ${device.name}`)
    driver.install(build.path)
    perfLog = driver.logs()
    await sleep(1500)

    let mark = perfLog.mark()
    const simctl = run('xcrun', ['-f', 'simctl']).stdout.trim()
    const launched = run(simctl, [
      'launch',
      device.id,
      BUNDLE_ID,
      '-wwPerfScenario',
      scenario,
      '-wwPerfScrub',
      '1',
    ])
    const pid = Number(launched.stdout.trim().split(/:\s*/).pop())
    log(`launched pid ${pid}; seeding ${scenario}`)
    const setup = await perfLog.next('setup', mark, 240_000)
    log(`setup: ${JSON.stringify(setup)}`)

    for (let i = 0; i <= rounds; i++) {
      const ready = await perfLog.next('scrub-ready', mark, 120_000)
      mark = perfLog.mark()
      const { width, height } = ready.window

      const x = Math.round(width / 2)
      const bottom = Math.round(height * 0.72)
      const top = bottom - gesture.amplitude
      await sleep(1200)
      if (flags.shot && i === 0) {
        const shot = path.resolve(ROOT, flags.shot)
        fs.mkdirSync(path.dirname(shot), { recursive: true })
        run(simctl, ['io', device.id, 'screenshot', shot])
        log(`screenshot: ${path.relative(ROOT, shot)}`)
        if (rounds === 0) break
      }
      let trace = null
      if (flags.trace && i === 1) {
        trace = path.join(ROOT, '.verify', `scrub-${name}-${Date.now()}.trace`)
        trace = startTrace(device.id, pid, trace, gesture.seconds + 3)
        await sleep(2500)
      }
      const conditions = machineConditions()
      const { startedAt, endedAt, lateMs } = runGesture(tool, device.id, {
        x,
        top,
        bottom,
        ...gesture,
      })
      if (trace) await trace.done
      const report = await perfLog.next('scrub', mark, 60_000)
      const periodMs = refreshPeriod(report.ui, startedAt)
      result.periodMs = periodMs

      const settle = gesture.pattern === 'fling' ? 1500 : 300
      const ui = frameStats(
        framesIn(report.ui, startedAt, endedAt + settle),
        periodMs
      )
      const js = frameStats(
        framesIn(report.js, startedAt, endedAt + settle),
        periodMs
      )
      const entry = {
        index: i,
        discarded: i === 0,
        startedAt,
        gestureMs: endedAt - startedAt,
        touchLateMs: lateMs,
        conditions,
        ui,
        js,
        counters: report.counters,
        gcs:
          report.heapAfter && report.heapBefore
            ? report.heapAfter.numGCs - report.heapBefore.numGCs
            : null,
        trace: trace?.file ?? null,
        raw: { ui: report.ui, js: report.js },
      }
      result.rounds.push(entry)
      log(
        `round ${i}${i === 0 ? ' (warm-up)' : ''}: gesture ${entry.gestureMs} ms; UI ${ui?.fps} fps, ${ui?.hitches} hitches, ${ui?.hitchMsPerS} ms/s; JS p95 ${js?.p95} ms, max ${js?.max} ms; focus ${report.counters['schedule:focus'] ?? 0}; load ${conditions.load1}`
      )
      mark = perfLog.mark()
    }
  } finally {
    perfLog?.stop()
    stop()
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'])
      process.off(signal, onSignal)
  }
  if (rounds === 0) return
  result.machine.atEnd = machineConditions()
  result.summary = summarize(result.rounds)

  const outDir = path.resolve(ROOT, flags['out-dir'] ?? 'docs/perf')
  fs.mkdirSync(outDir, { recursive: true })
  writeJson(path.join(outDir, `${name}.json`), result)
  const markdown = renderScrubMarkdown(result)
  fs.writeFileSync(path.join(outDir, `${name}.md`), `${markdown}\n`)
  console.log(markdown)
  log(`wrote ${path.relative(ROOT, path.join(outDir, name))}.{json,md}`)
}

function startTrace(udid, pid, file, seconds) {
  log(`recording Time Profiler to ${path.relative(ROOT, file)}`)
  const child = spawn(
    'xcrun',
    [
      'xctrace',
      'record',
      '--template',
      'Time Profiler',
      '--device',
      udid,
      '--attach',
      String(pid),
      '--time-limit',
      `${seconds}s`,
      '--output',
      file,
      '--no-prompt',
    ],
    { stdio: 'ignore' }
  )
  return {
    file,
    done: new Promise((resolve) => child.on('exit', resolve)),
  }
}

if (
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === import.meta.filename
)
  main().catch((error) => {
    console.error(
      `scrub: ${error instanceof Failure ? error.message : error.stack || error.message}`
    )
    process.exit(1)
  })
