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
import { frameStats, touchTool } from './scrub.mjs'
import { percentile } from './stats.mjs'

const HELP = `node scripts/perf/welcome.mjs [--ref HEAD] [--name <name>]
node scripts/perf/welcome.mjs compare .verify/artifacts/perf/a.json .verify/artifacts/perf/b.json …
  --runs 5              first launches to measure; each one installs the app fresh. One more launch runs first and is left out: it finds the buttons through accessibility, which stalls the app, so the measured launches can tap by coordinates
  --pages 4             tour pages to step through after Get Started
  --video <mp4>         record one more, unmeasured first launch to this file
  --sample [tap]        sample the app's threads for 3 s after the intro of the unmeasured first launch (macOS sample, 1 ms; it shows blocked threads too). With "tap", sample around the Get Started tap of the next launch instead, and leave that launch out as well
  --trace               record a Time Profiler trace of the simulator through the unmeasured first launch
  --out-dir .verify/artifacts/perf   where <name>.json and <name>.md go (gitignored)
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

const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10)

function framesBetween(trace, from, to) {
  const deltas = []
  let at = trace.start
  for (const hundredths of trace.deltas) {
    const delta = hundredths / 100
    at += delta
    if (at >= from && at <= to) deltas.push(delta)
  }
  return deltas
}

function refreshPeriod(trace) {
  const sorted = trace.deltas.map((d) => d / 100).sort((a, b) => a - b)
  const median = percentile(sorted, 0.5)
  return median && median < 11 ? 1000 / 120 : 1000 / 60
}

const WINDOWS = [
  ['hold', 'Splash held before the intro'],
  ['intro', 'Welcome intro'],
  ['idle', 'Welcome at rest'],
  ['toTour', 'Get Started to the first tour page'],
  ['pages', 'Tour page changes'],
]

const STAT_ROWS = [
  ['Frames per second', 'fps'],
  ['Frame time p95 (ms)', 'p95'],
  ['Worst frame (ms)', 'max'],
  ['Hitches (frames > 1.5 periods)', 'hitches'],
  ['Missed refreshes', 'missedFrames'],
  ['Dropped (% of refreshes)', 'droppedPct'],
  ['Hitch time ratio (ms/s)', 'hitchMsPerS'],
]

function measureRun(report, actions, launchWall) {
  const m = report.marks
  const period = refreshPeriod(report.ui)
  const ranges = {
    hold: [m['welcome:ready'], m['welcome:start']],
    intro: [m['welcome:start'], m['welcome:done'] + 600],
    idle: [m['welcome:done'] + 600, (m['welcome:leave'] ?? Infinity) - 50],
    toTour: [m['welcome:leave'], m['tour:mount'] + 1800],
  }
  const windows = {}
  for (const [name, [from, to]] of Object.entries(ranges)) {
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) continue
    windows[name] = {
      ms: Math.round(to - from),
      ui: frameStats(framesBetween(report.ui, from, to), period),
      js: frameStats(framesBetween(report.js, from, to), period),
    }
  }
  const pageFrames = { ui: [], js: [] }
  for (const tap of actions.pages) {
    pageFrames.ui.push(
      ...framesBetween(report.ui, tap.startedAt, tap.endedAt + 1500)
    )
    pageFrames.js.push(
      ...framesBetween(report.js, tap.startedAt, tap.endedAt + 1500)
    )
  }
  if (pageFrames.ui.length)
    windows.pages = {
      ms: Math.round(pageFrames.ui.reduce((sum, d) => sum + d, 0)),
      ui: frameStats(pageFrames.ui, period),
      js: frameStats(pageFrames.js, period),
    }
  return {
    periodMs: period,
    launchToWelcomeMs: Math.round(m['welcome:ready'] - launchWall),
    gateMs:
      m['welcome:start'] === undefined
        ? null
        : Math.round(m['welcome:start'] - m['welcome:ready']),
    introMs:
      Math.round(m['welcome:done'] - (m['welcome:start'] ?? NaN)) || null,
    tourMountMs:
      m['tour:mount'] === undefined
        ? null
        : Math.round(m['tour:mount'] - m['welcome:leave']),
    windows,
  }
}

const median = (values) => {
  const v = values.filter((x) => x != null).sort((a, b) => a - b)
  return v.length ? round1(percentile(v, 0.5)) : null
}
const worst = (values) => {
  const v = values.filter((x) => x != null)
  return v.length ? round1(Math.max(...v)) : null
}

function summarize(runs) {
  const measured = runs.filter((r) => !r.discarded)
  const summary = {
    runs: measured.length,
    launchToWelcomeMs: median(measured.map((r) => r.launchToWelcomeMs)),
    gateMs: median(measured.map((r) => r.gateMs)),
    tourMountMs: median(measured.map((r) => r.tourMountMs)),
    windows: {},
  }
  for (const [name] of WINDOWS) {
    const entry = { ui: {}, js: {} }
    for (const thread of ['ui', 'js'])
      for (const [, key] of STAT_ROWS) {
        const values = measured.map((r) => r.windows[name]?.[thread]?.[key])
        entry[thread][key] = median(values)
        if (key === 'max') entry[thread].maxOfRuns = worst(values)
        if (key === 'hitches') entry[thread].hitchesOfRuns = worst(values)
      }
    summary.windows[name] = entry
  }
  return summary
}

export function renderWelcomeMarkdown(result) {
  const s = result.summary
  const lines = [
    `# Welcome and tour frames: ${result.name}`,
    '',
    `Commit \`${result.sha.slice(0, 12)}\`, Release build, ${result.device}, ${s.runs} first launches (the app installed fresh before each). Refresh period ${round1(result.periodMs)} ms. Medians, with the worst run in parentheses.`,
    '',
    `Launch to the welcome screen ${s.launchToWelcomeMs} ms; splash held ${s.gateMs} ms before the intro; Get Started to the tour mounted ${s.tourMountMs} ms.`,
    '',
  ]
  for (const [name, label] of WINDOWS) {
    const w = s.windows[name]
    if (!w || w.ui.fps == null) continue
    lines.push(
      `## ${label}`,
      '',
      '| Metric | UI thread | JS thread |',
      '| --- | ---: | ---: |',
      ...STAT_ROWS.map(([text, key]) => {
        const extra = (t) =>
          key === 'max'
            ? ` (${w[t].maxOfRuns})`
            : key === 'hitches'
              ? ` (${w[t].hitchesOfRuns})`
              : ''
        return `| ${text} | ${w.ui[key]}${extra('ui')} | ${w.js[key]}${extra('js')} |`
      }),
      ''
    )
  }
  return lines.join('\n')
}

export function renderWelcomeComparison(results) {
  const lines = [
    `| Metric | ${results.map((r) => r.name).join(' | ')} |`,
    `| --- |${results.map(() => ' ---: |').join('')}`,
    `| Splash held before the intro (ms) | ${results.map((r) => r.summary.gateMs).join(' | ')} |`,
    `| Get Started to tour mounted (ms) | ${results.map((r) => r.summary.tourMountMs).join(' | ')} |`,
  ]
  for (const [name, label] of WINDOWS)
    for (const thread of ['ui', 'js'])
      for (const [text, key] of [
        ['fps', 'fps'],
        ['worst frame (ms), median', 'max'],
        ['worst frame (ms), worst run', 'maxOfRuns'],
        ['hitches, median', 'hitches'],
        ['hitches, worst run', 'hitchesOfRuns'],
        ['dropped %', 'droppedPct'],
        ['hitch ms/s', 'hitchMsPerS'],
      ])
        lines.push(
          `| ${label}: ${thread.toUpperCase()} ${text} | ${results
            .map((r) => r.summary.windows[name]?.[thread]?.[key] ?? '')
            .join(' | ')} |`
        )
  return lines.join('\n')
}

function locate(udid, label) {
  const deadline = Date.now() + 8000
  for (;;) {
    const result = run('axe', ['describe-ui', '--udid', udid], { check: false })
    const queue = result.status === 0 ? [JSON.parse(result.stdout)].flat() : []
    while (queue.length) {
      const node = queue.shift()
      if (node.AXLabel === label && node.type === 'Button' && node.frame) {
        const { x, y, width, height } = node.frame
        return { x: Math.round(x + width / 2), y: Math.round(y + height / 2) }
      }
      queue.push(...(node.children ?? []))
    }
    if (Date.now() > deadline) fail(`axe could not find "${label}"`)
  }
}

function tapPoint(tool, udid, point) {
  const result = run(
    tool,
    [udid, point.x, point.y, point.y, 500, 0.05, 120, 'drag'].map(String),
    { check: false }
  )
  if (result.status !== 0)
    fail(`could not tap ${point.x},${point.y}: ${result.stderr}`)
  const { startedAt, endedAt } = JSON.parse(result.stdout)
  return { startedAt, endedAt }
}

function startVideo(simctl, udid, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.rmSync(file, { force: true })
  const temp = path.join(os.tmpdir(), `ww-perf-welcome-${Date.now()}.mp4`)
  const child = spawn(
    simctl,
    ['io', udid, 'recordVideo', '--codec', 'h264', '--force', temp],
    { stdio: 'ignore' }
  )
  return async () => {
    child.kill('SIGINT')
    await new Promise((resolve) => child.on('exit', resolve))
    fs.copyFileSync(temp, file)
    fs.rmSync(temp, { force: true })
  }
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
      renderWelcomeComparison(
        files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')))
      )
    )
    return
  }
  const ref = flags.ref || 'HEAD'
  const sha = resolveSha(ref)
  const runs = Number(flags.runs ?? 5)
  const pages = Number(flags.pages ?? 4)
  const name = flags.name ?? `welcome-${sha.slice(0, 12)}`
  const video = flags.video ? path.resolve(ROOT, flags.video) : null

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
    capturedAt: new Date().toISOString(),
    command:
      `node scripts/perf/welcome.mjs ${process.argv.slice(2).join(' ')}`.trim(),
    machine: {
      host: os.hostname(),
      cpu: os.cpus()[0]?.model,
      cores: os.cpus().length,
      ramGb: Math.round(os.totalmem() / 2 ** 30),
      atStart: machineConditions(),
    },
    runs: [],
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
    const simctl = run('xcrun', ['-f', 'simctl']).stdout.trim()
    perfLog = driver.logs()
    await sleep(1500)

    const points = {}
    const tool = touchTool()
    const total = 1 + runs + (video ? 1 : 0)
    for (let i = 0; i < total; i++) {
      const recorded = video && i === runs + 1
      driver.install(build.path)
      await sleep(3000)
      const conditions = machineConditions()
      const mark = perfLog.mark()
      const stopVideo = recorded ? startVideo(simctl, device.id, video) : null
      if (recorded) await sleep(1500)
      const trace =
        flags.trace && i === 0
          ? startTrace(
              device.id,
              path.join(ROOT, '.verify', `welcome-${name}.trace`)
            )
          : null
      if (trace) await sleep(8000)
      const launchWall = Date.now()
      const launched = run(simctl, [
        'launch',
        device.id,
        BUNDLE_ID,
        '-wwPerfWelcome',
        '1',
      ])
      await perfLog.next('welcome-ready', mark, 120_000)
      const sample = () => {
        const pid = launched.stdout.trim().split(/:\s*/).pop()
        const file = path.join(ROOT, '.verify', `welcome-${name}.sample.txt`)
        spawn('sample', [pid, '3', '1', '-file', file], { stdio: 'ignore' })
        log(`sampling pid ${pid} to ${path.relative(ROOT, file)}`)
      }
      const sampleTap = flags.sample === 'tap' && i === 1
      if (flags.sample && flags.sample !== 'tap' && i === 0) sample()

      await sleep(recorded ? 18_000 : 3000)
      if (i === 0) points.getStarted = locate(device.id, 'Get Started')
      if (sampleTap) {
        sample()
        await sleep(1200)
      }
      const actions = {
        getStarted: tapPoint(tool, device.id, points.getStarted),
        pages: [],
      }
      await sleep(recorded ? 6000 : 3500)
      if (i === 0) points.next = locate(device.id, 'Next')
      for (let page = 0; page < pages; page++) {
        actions.pages.push(tapPoint(tool, device.id, points.next))
        await sleep(recorded ? 6000 : 2200)
      }
      if (recorded) {
        await stopVideo()
        log(`video: ${path.relative(ROOT, video)}`)
        continue
      }
      const report = await perfLog.next('welcome', mark, 90_000)
      if (trace) await trace.done
      const entry = {
        index: i,
        discarded: i === 0 || sampleTap,
        conditions,
        launchWall,
        actions,
        ...measureRun(report, actions, launchWall),
        marks: report.marks,
        heap: report.heap,
        raw: { ui: report.ui, js: report.js },
      }
      result.periodMs = entry.periodMs
      result.runs.push(entry)
      const intro = entry.windows.intro
      const tour = entry.windows.toTour
      log(
        `run ${i}: splash held ${entry.gateMs} ms; intro UI ${intro?.ui?.fps} fps, ${intro?.ui?.hitches} hitches, worst ${intro?.ui?.max} ms (JS worst ${intro?.js?.max} ms); to tour UI ${tour?.ui?.hitches} hitches, worst ${tour?.ui?.max} ms (JS worst ${tour?.js?.max} ms); load ${conditions.load1}`
      )
    }
  } finally {
    perfLog?.stop()
    stop()
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'])
      process.off(signal, onSignal)
  }
  if (!result.runs.length) return
  result.machine.atEnd = machineConditions()
  result.summary = summarize(result.runs)

  const outDir = path.resolve(
    ROOT,
    flags['out-dir'] ?? '.verify/artifacts/perf'
  )
  fs.mkdirSync(outDir, { recursive: true })
  writeJson(path.join(outDir, `${name}.json`), result)
  const markdown = renderWelcomeMarkdown(result)
  fs.writeFileSync(path.join(outDir, `${name}.md`), `${markdown}\n`)
  console.log(markdown)
  log(`wrote ${path.relative(ROOT, path.join(outDir, name))}.{json,md}`)
}

function startTrace(udid, file) {
  fs.rmSync(file, { recursive: true, force: true })
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
      '--all-processes',
      '--time-limit',
      '24s',
      '--output',
      file,
      '--no-prompt',
    ],
    { stdio: 'ignore' }
  )
  return { file, done: new Promise((resolve) => child.on('exit', resolve)) }
}

if (
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === import.meta.filename
)
  main().catch((error) => {
    console.error(
      `welcome: ${error instanceof Failure ? error.message : error.stack || error.message}`
    )
    process.exit(1)
  })
