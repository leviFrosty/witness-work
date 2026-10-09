#!/usr/bin/env node
// Release-build profiling runner. Usage and the meaning of every metric live
// in docs/perf/README.md; `node scripts/perf/run.mjs help` prints the flags.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { updateLeases } from '../verify/leases.mjs'
import {
  Failure,
  ROOT,
  artifactHash,
  bootAndroid,
  bootIos,
  fail,
  killOwnBuild,
  leaseDevice,
  log,
  readState,
  releasePlatform,
  run,
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
import { machineConditions, profileDevice } from './measure.mjs'
import { renderMarkdown, summarizeCycles, summarizeLaunches } from './stats.mjs'

const HELP = `node scripts/perf/run.mjs [--ref HEAD] [--platform ios|android|both]
  --runs 10            cold launches measured per platform (plus 1 discarded warm-up)
  --foreground 5       background/return cycles per platform
  --blips 3            iOS inactive blips (Control Center); 0 skips them
  --settle 3           seconds between terminating the app and the next launch
  --background 5       seconds the app stays in the background per cycle
  --dwell 20           seconds in the foreground before each cycle
  --name <name>        output name (default perf-<sha12>); writes docs/perf/<name>.json and .md
  --out-dir docs/perf  where results go
  --api-dir <dir>      ww-api checkout with scripts/verify/dev.mjs (default $WW_API_DIR or ~/dev/ww-api)
  --api-url <url>      relay to an already running ww-api instead
  --build-only         build (and cache) the apps, then stop
  --rebuild            ignore cached builds
  --no-static          skip the bundle size export
  --keep-build-dirs    keep DerivedData / android build output
  --keep-source        keep the commit's source checkout after building
  --wait 60            minutes to wait for a build slot or a device`

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

async function profilePlatform(platform, build, sha, api, flags, state) {
  const kind = platform === 'ios' ? 'iphone' : 'emulator'
  const native = { fingerprint: `perf-${sourceKey(sha)}`, artifact: build.path }
  const claim = await takeLease(platform, kind, native, flags)
  if (claim.warm) log(`reusing warm ${claim.lease.deviceName}`)
  startHeartbeat()
  const device = leaseDevice(claim.lease)
  state.devices = { ...state.devices, [platform]: device }
  writeState(state)
  try {
    if (platform === 'ios') bootIos(device)
    else {
      device.id = await bootAndroid(device)
      updateLeases(ROOT, { deviceId: device.id }, [device.lockKey])
      writeState(state)
    }
    // Recorded like a dev install, so the next `wwv up` reinstalls its build.
    updateInstalls((installs) => {
      installs[device.lockKey] = {
        fingerprint: native.fingerprint,
        hash: artifactHash(build.path),
        artifact: build.path,
        at: Date.now(),
      }
    })
    const raw = await profileDevice(device, build.path, {
      apiPort: api.port,
      runs: Number(flags.runs ?? 10),
      foreground: Number(flags.foreground ?? 5),
      blips: Number(flags.blips ?? 3),
      settleMs: Number(flags.settle ?? 3) * 1000,
      backgroundMs: Number(flags.background ?? 5) * 1000,
      dwellMs: Number(flags.dwell ?? 20) * 1000,
    })
    const measured = raw.launch.runs.filter((r) => !r.discarded)
    return {
      ...raw,
      launch: { ...raw.launch, summary: summarizeLaunches(measured) },
      foreground: raw.foreground.cycles.length
        ? { ...raw.foreground, summary: summarizeCycles(raw.foreground.cycles) }
        : raw.foreground,
      active: raw.active.cycles
        ? { ...raw.active, summary: summarizeCycles(raw.active.cycles) }
        : raw.active,
    }
  } finally {
    releasePlatform(state, platform, {})
    writeState(state)
  }
}

async function main() {
  const flags = parseFlags(process.argv.slice(2))
  if (process.argv[2] === 'help' || flags.help) {
    console.log(HELP)
    return
  }
  const ref = flags.ref || 'HEAD'
  const platforms =
    !flags.platform || flags.platform === 'both'
      ? ['ios', 'android']
      : [flags.platform]
  if (platforms.some((p) => !['ios', 'android'].includes(p)))
    fail('--platform must be ios, android or both')
  const sha = resolveSha(ref)
  const dirty = run('git', ['status', '--porcelain'], { cwd: ROOT }).stdout
  if (ref === 'HEAD' && dirty.trim())
    log('the working tree has uncommitted changes; they are not profiled')

  // Builds first: a build waiter holds no device (as with wwv up).
  const builds = {}
  for (const platform of platforms)
    builds[platform] = await resolvePerfBuild(platform, sha, flags)
  if (!flags['keep-source']) removeSourceTree(sha)
  if (flags['build-only']) {
    console.log(JSON.stringify(builds, null, 2))
    return
  }

  const state = readState()
  const api = await startApi({
    port: API_PORT,
    apiUrl: flags['api-url'],
    apiDir: flags['api-dir'],
  })
  state.api = { mode: `perf-${api.mode}`, url: api.url, port: api.port }
  writeState(state)
  const stop = () => {
    killOwnBuild()
    for (const platform of Object.keys(state.devices ?? {}))
      releasePlatform(state, platform, {})
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
    ref,
    sha,
    sourceKey: sourceKey(sha),
    capturedAt: new Date().toISOString(),
    command:
      `node scripts/perf/run.mjs ${process.argv.slice(2).join(' ')}`.trim(),
    machine: {
      host: os.hostname(),
      cpu: os.cpus()[0]?.model,
      cores: os.cpus().length,
      ramGb: Math.round(os.totalmem() / 2 ** 30),
      os: `${os.type()} ${os.release()}`,
      atStart: machineConditions(),
    },
    api: { mode: api.mode, port: api.port },
    builds: Object.fromEntries(
      Object.entries(builds).map(([p, b]) => [
        p,
        { builtAt: new Date(b.builtAt).toISOString(), path: b.path },
      ])
    ),
    static: Object.fromEntries(
      Object.entries(builds)
        .filter(([, b]) => b.static)
        .map(([p, b]) => [p, b.static])
    ),
    platforms: {},
  }
  try {
    for (const platform of platforms)
      result.platforms[platform] = await profilePlatform(
        platform,
        builds[platform],
        sha,
        api,
        flags,
        state
      )
  } finally {
    stop()
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'])
      process.off(signal, onSignal)
  }
  result.machine.atEnd = machineConditions()

  const outDir = path.resolve(ROOT, flags['out-dir'] ?? 'docs/perf')
  const name = flags.name ?? `perf-${sha.slice(0, 12)}`
  fs.mkdirSync(outDir, { recursive: true })
  writeJson(path.join(outDir, `${name}.json`), result)
  fs.writeFileSync(
    path.join(outDir, `${name}.md`),
    `${renderMarkdown(result)}\n`
  )
  console.log(renderMarkdown(result))
  log(`wrote ${path.relative(ROOT, path.join(outDir, name))}.{json,md}`)
}

main().catch((error) => {
  console.error(
    `perf: ${error instanceof Failure ? error.message : error.stack || error.message}`
  )
  process.exit(1)
})
