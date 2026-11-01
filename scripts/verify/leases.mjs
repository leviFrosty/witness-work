import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const env = process.env

export const RAM_GB = Number(env.WW_VERIFY_RAM_GB) || os.totalmem() / 2 ** 30
const SMALL = RAM_GB <= 16
export const POLICY = {}
const num = (name, fallback, small = fallback) => {
  const value = Number(env[name])
  const fromEnv = Boolean(env[name]) && Number.isFinite(value)
  POLICY[name] = fromEnv ? 'env' : 'auto'
  return fromEnv ? value : SMALL ? small : fallback
}

export const HOME = env.WW_VERIFY_HOME || path.join(os.homedir(), '.ww-verify')
export const LOCK_DIR = path.join(HOME, 'locks')
const MUTEX = path.join(HOME, 'mutex')
const WAITERS = path.join(HOME, 'waiters.json')
const BUILDS = path.join(HOME, 'active-builds.json')
const BUILD_WAITERS = path.join(HOME, 'build-waiters.json')
const WARM = path.join(HOME, 'warm.json')
const LAST_ADMIT = path.join(HOME, 'last-admit.json')

export const CONFIG = {
  max: {
    ios: num('WW_VERIFY_MAX_IOS', 2),
    android: num('WW_VERIFY_MAX_ANDROID', 2),
  },
  maxBuilds: num('WW_VERIFY_MAX_BUILDS', 1),
  idleMin: num('WW_VERIFY_LEASE_IDLE_MIN', 30, 15),

  warm: num('WW_VERIFY_WARM', 2, 1),
  warmHours: num('WW_VERIFY_WARM_HOURS', 12),

  warmMin: num('WW_VERIFY_WARM_MIN', 0),

  budgetGb: num(
    'WW_VERIFY_MEMORY_BUDGET_GB',
    Math.round(RAM_GB * 0.7),
    Math.round(RAM_GB)
  ),

  minFreePct: num('WW_VERIFY_MIN_FREE_PCT', 25),
  minFreePctBuild: num('WW_VERIFY_MIN_FREE_PCT_BUILD', 35),
  settleSec: num('WW_VERIFY_SETTLE_SEC', 60),

  est: {
    ios: num('WW_VERIFY_EST_IOS_GB', 3.4),
    android: num('WW_VERIFY_EST_ANDROID_GB', 3.2),
    metro: num('WW_VERIFY_EST_METRO_GB', 0.6),
    'build-ios': num('WW_VERIFY_EST_IOS_BUILD_GB', 6),
    'build-android': num('WW_VERIFY_EST_ANDROID_BUILD_GB', 6.5),
  },
  metroPorts: Array.from({ length: 40 }, (_, i) => 8090 + i),
}

const LEGACY_STALE_MS = 24 * 60 * 60 * 1000
const MUTEX_STALE_MS = 2 * 60 * 1000

const NAMED_LOCK_STALE_MS = 15 * 60 * 1000
const REAPER_STALE_MS = 10 * 60 * 1000

const BUILD_STALE_MS = 5 * 60 * 1000

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const sleepSync = (ms) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

export function pidAlive(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`)
  fs.renameSync(tmp, file)
}

const round = (gb) => Math.round(gb * 10) / 10

let mutexDepth = 0

function breakStaleLock(dir, staleMs) {
  let stat
  try {
    stat = fs.statSync(dir)
  } catch {
    return
  }
  const owner = readText(path.join(dir, 'owner'))
  const [pid, at] = owner ? owner.split(' ').map(Number) : [0, stat.mtimeMs]
  const age = Date.now() - at
  const stale = owner ? !pidAlive(pid) || age > staleMs : age > 5000
  if (!stale) return
  const grave = `${dir}.stale-${process.pid}-${Date.now()}`
  try {
    fs.renameSync(dir, grave)
  } catch {
    return
  }

  if (readText(path.join(grave, 'owner')) !== owner) {
    try {
      fs.renameSync(grave, dir)
    } catch {}
    return
  }
  fs.rmSync(grave, { recursive: true, force: true })
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
}

function holdLock(dir, staleMs, fn) {
  fs.mkdirSync(path.dirname(dir), { recursive: true })
  const token = `${process.pid} ${Date.now()} ${Math.random().toString(36).slice(2)}`
  const deadline = Date.now() + 2 * staleMs
  for (;;) {
    try {
      fs.mkdirSync(dir)
      break
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
    breakStaleLock(dir, staleMs)
    if (Date.now() > deadline)
      throw new Error(
        `${dir} is stuck; remove it if no ww-verify process is running`
      )
    sleepSync(20 + Math.random() * 60)
  }
  fs.writeFileSync(path.join(dir, 'owner'), token)
  try {
    return fn()
  } finally {
    if (readText(path.join(dir, 'owner')) === token)
      fs.rmSync(dir, { recursive: true, force: true })
  }
}

export function withMutex(fn) {
  if (mutexDepth) return fn()
  return holdLock(MUTEX, MUTEX_STALE_MS, () => {
    mutexDepth++
    try {
      return fn()
    } finally {
      mutexDepth--
    }
  })
}

export function withLock(name, fn) {
  return holdLock(path.join(HOME, `${name}.lock`), NAMED_LOCK_STALE_MS, fn)
}

export function lockFile(key) {
  return path.join(LOCK_DIR, `${key.replace(/[^a-zA-Z0-9-]/g, '_')}.json`)
}

function load(file, now) {
  const raw = readJson(file, null)
  if (!raw?.worktree) return null
  const key = raw.key ?? path.basename(file, '.json')

  const legacy = !raw.platform
  const beat = raw.heartbeatAt ?? raw.at ?? 0
  const limit = legacy ? LEGACY_STALE_MS : CONFIG.idleMin * 60_000
  return {
    ...raw,
    key,
    file,
    legacy,
    platform: raw.platform ?? (key.startsWith('avd-') ? 'android' : 'ios'),
    idleMs: now - beat,
    expired: !fs.existsSync(raw.worktree) || now - beat > limit,
    reaping: Boolean(
      raw.reaper &&
        pidAlive(raw.reaper.pid) &&
        now - raw.reaper.at < REAPER_STALE_MS
    ),
  }
}

export function readLeases(now = Date.now()) {
  let files = []
  try {
    files = fs.readdirSync(LOCK_DIR).filter((f) => f.endsWith('.json'))
  } catch {}
  return files.map((f) => load(path.join(LOCK_DIR, f), now)).filter(Boolean)
}

const DERIVED = ['file', 'legacy', 'idleMs', 'expired', 'reaping', 'reaper']

function save(lease) {
  const raw = Object.fromEntries(
    Object.entries(lease).filter(([field]) => !DERIVED.includes(field))
  )
  writeJsonAtomic(lease.file ?? lockFile(raw.key), raw)
}

export function usage(leases, builds, warm = []) {
  const live = leases.filter((l) => !l.expired)
  const worktrees = new Set(live.map((l) => l.worktree))
  return round(
    live.reduce((sum, l) => sum + CONFIG.est[l.platform], 0) +
      warm.reduce((sum, w) => sum + CONFIG.est[w.platform], 0) +
      worktrees.size * CONFIG.est.metro +
      builds.reduce((sum, b) => sum + CONFIG.est[`build-${b.platform}`], 0)
  )
}

export function memoryLevel() {
  const fake = env.WW_VERIFY_MEMORY_LEVEL
  const out = fake
    ? fake.replace(',', '\n')
    : process.platform === 'darwin'
      ? spawnSync(
          'sysctl',
          [
            '-n',
            'kern.memorystatus_level',
            'kern.memorystatus_vm_pressure_level',
          ],
          { encoding: 'utf8' }
        ).stdout
      : ''
  const [free, pressure = 1] = (out ?? '').trim().split('\n').map(Number)
  return Number.isFinite(free) && out.trim() ? { free, pressure } : null
}

function liveBlock(kind, now) {
  const [minFree, knob] =
    kind === 'build'
      ? [CONFIG.minFreePctBuild, 'WW_VERIFY_MIN_FREE_PCT_BUILD']
      : [CONFIG.minFreePct, 'WW_VERIFY_MIN_FREE_PCT']
  const last = readJson(LAST_ADMIT, null)
  if (last && now - last.at < CONFIG.settleSec * 1000)
    return {
      reason: `letting the ${last.label} settle before the next boot or build (WW_VERIFY_SETTLE_SEC)`,
      blockedOn: 'settle',
    }
  const level = memoryLevel()
  if (!level) return null
  if (level.pressure > 1)
    return {
      reason: `macOS reports memory pressure (${level.free}% free)`,
      blockedOn: 'pressure',
    }
  if (level.free < minFree)
    return {
      reason: `${level.free}% of memory free, under the ${minFree}% a ${kind} needs (${knob})`,
      blockedOn: 'pressure',
    }
  return null
}

const admitted = (label, now = Date.now()) =>
  writeJsonAtomic(LAST_ADMIT, { at: now, label })

function evictForPressure(warm, pid) {
  const victim = [...warm].sort((a, b) => a.since - b.since).slice(0, 1)
  if (!victim.length) return null
  admitted(`shutdown of warm ${victim[0].deviceName ?? victim[0].key}`)
  return mark(victim, pid)
}

const evicting = (w) => Boolean(w.evicting && pidAlive(w.evicting))

function readWarm(leases, { persist = false } = {}) {
  const leased = new Set(leases.map((l) => l.key))
  const all = readJson(WARM, [])
  const warm = all.filter(
    (w) => !leased.has(w.key) && (!w.evicting || evicting(w))
  )
  if (persist && warm.length !== all.length) writeJsonAtomic(WARM, warm)
  return warm
}

const idleWarm = (leases) => readWarm(leases).filter((w) => !evicting(w))

function running(leases, warm) {
  const count = { ios: 0, android: 0 }
  for (const l of leases) if (!l.expired) count[l.platform]++
  for (const w of warm) if (!evicting(w)) count[w.platform]++
  return count
}

function aboveFloor(candidates, count) {
  const left = { ...count }
  return [...candidates]
    .sort((a, b) => a.since - b.since)
    .filter((w) => left[w.platform] > CONFIG.warmMin && left[w.platform]--)
}

function markEvictions(warm, fits, pid) {
  const victims = []
  let freed = 0
  for (const w of warm) {
    if (fits(freed)) break
    victims.push(w)
    freed += CONFIG.est[w.platform]
  }
  if (!victims.length || !fits(freed)) return null
  return mark(victims, pid)
}

function mark(victims, pid) {
  const keys = new Set(victims.map((w) => w.key))
  writeJsonAtomic(
    WARM,
    readJson(WARM, []).map((w) =>
      keys.has(w.key) ? { ...w, evicting: pid } : w
    )
  )
  return victims
}

export function parkWarm(lease, { force = false } = {}) {
  return withMutex(() => {
    const now = Date.now()
    const leases = readLeases(now).filter((l) => l.key !== lease.key)
    const warm = readWarm(leases).filter((w) => w.key !== lease.key)
    const peers = warm.filter((w) => w.platform === lease.platform)
    const used = usage(
      leases,
      liveBuilds(now),
      warm.filter((w) => !evicting(w))
    )
    const floor = running(leases, warm)[lease.platform] < CONFIG.warmMin
    if (
      !force &&
      !floor &&
      (peers.length >= CONFIG.warm ||
        used + CONFIG.est[lease.platform] > CONFIG.budgetGb)
    )
      return false
    writeJsonAtomic(WARM, [
      ...warm,
      {
        key: lease.key,
        platform: lease.platform,
        kind: lease.kind,
        deviceId: lease.deviceId,
        deviceName: lease.deviceName,
        since: now,
      },
    ])
    fs.rmSync(lockFile(lease.key), { force: true })
    return true
  })
}

export function evictWarm(filter, pid = process.pid) {
  return withMutex(() => {
    const leases = readLeases()
    const warm = idleWarm(leases)
    return mark(aboveFloor(warm.filter(filter), running(leases, warm)), pid)
  })
}

export function belowFloor() {
  return withMutex(() => {
    const leases = readLeases()
    const count = running(leases, idleWarm(leases))
    return Object.fromEntries(
      Object.entries(count)
        .filter(([, n]) => n < CONFIG.warmMin)
        .map(([platform, n]) => [platform, CONFIG.warmMin - n])
    )
  })
}

export function dropWarm(victims, pid = process.pid) {
  const keys = new Set(victims.map((w) => w.key))
  withMutex(() =>
    writeJsonAtomic(
      WARM,
      readJson(WARM, []).filter((w) => !(keys.has(w.key) && w.evicting === pid))
    )
  )
}

export const evictStaleWarm = (now = Date.now()) =>
  evictWarm((w) => now - w.since > CONFIG.warmHours * 3600_000)

function describeUse(leases, now = Date.now()) {
  const held = leases
    .filter((l) => !l.expired)
    .map((l) => `${l.platform} lease ${path.basename(l.worktree)}`)
  const builds = liveBuilds(now).map(
    (b) => `${b.platform} build ${path.basename(b.worktree)}`
  )
  const warm = idleWarm(leases).map((w) => `warm ${w.deviceName ?? w.key}`)
  const all = [...held, ...builds, ...warm]
  return `held by ${all.join(', ') || 'nobody'}`
}

const fresh = (now) => (w) => pidAlive(w.pid) && now - w.seenAt < 2 * 60_000
const liveWaiters = (now = Date.now()) =>
  readJson(WAITERS, []).filter(fresh(now))
const liveBuildWaiters = (now = Date.now()) =>
  readJson(BUILD_WAITERS, []).filter(fresh(now))

export function groupAlive(pgid) {
  if (!pgid) return false
  try {
    process.kill(-pgid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

const ownerAlive = (b, now) =>
  pidAlive(b.pid) && now - (b.seenAt ?? b.startedAt) < BUILD_STALE_MS

export function liveBuilds(now = Date.now()) {
  return readJson(BUILDS, []).filter(
    (b) => ownerAlive(b, now) || groupAlive(b.pgid)
  )
}

export const isOrphan = (b, now = Date.now()) => !ownerAlive(b, now)

const storedBuilds = (now = Date.now()) =>
  readJson(BUILDS, []).filter(
    (b) =>
      ownerAlive(b, now) ||
      groupAlive(b.pgid) ||
      (b.dirs ?? []).some((d) => fs.existsSync(d))
  )

function pickPort(leases, worktree, busy, exclude = []) {
  const own = leases.find(
    (l) => l.worktree === worktree && !l.expired && l.metroPort
  )?.metroPort
  if (own && !exclude.includes(own)) return own
  const used = new Set(
    leases.filter((l) => l.worktree !== worktree).map((l) => l.metroPort)
  )
  return CONFIG.metroPorts.find(
    (p) => !used.has(p) && !busy.has(p) && !exclude.includes(p)
  )
}

export function tryClaim({
  worktree,
  platform,
  kind,
  pool,
  create,
  busyPorts = () => new Set(),
  prefer = () => false,
  pid = process.pid,
}) {
  return withMutex(() => {
    const now = Date.now()
    const leases = readLeases(now)
    const live = leases.filter((l) => !l.expired)
    const waiters = liveWaiters(now)
    const leave = () =>
      writeJsonAtomic(
        WAITERS,
        waiters.filter((w) => w.pid !== pid)
      )
    const mine = live.find(
      (l) => l.worktree === worktree && l.platform === platform && !l.reaping
    )
    if (mine) {
      save({ ...mine, heartbeatAt: now, at: now })
      leave()
      return { lease: mine, existing: true }
    }
    const me = waiters.find((w) => w.pid === pid)
    if (me) me.seenAt = now
    else waiters.push({ pid, worktree, platform, since: now, seenAt: now })
    const queue = waiters
      .filter((w) => w.platform === platform)
      .sort((a, b) => a.since - b.since)
    const position = queue.findIndex((w) => w.pid === pid) + 1
    const holders = live.filter((l) => l.platform === platform)
    const cap = CONFIG.max[platform]
    const need =
      CONFIG.est[platform] +
      (live.some((l) => l.worktree === worktree) ? 0 : CONFIG.est.metro)
    const wait = (reason, impossible = false) => {
      const entry = waiters.find((w) => w.pid === pid)
      entry.reason = reason
      writeJsonAtomic(WAITERS, waiters)
      return {
        wait: reason,
        impossible,
        holders,
        position,
        queued: queue.length,
      }
    }
    if (need > CONFIG.budgetGb)
      return wait(
        `a ${platform} device needs ${need} GB but WW_VERIFY_MEMORY_BUDGET_GB is ${CONFIG.budgetGb}`,
        true
      )
    if (position > 1)
      return wait(
        `queued behind ${position - 1} earlier ${platform} request(s)`
      )
    if (holders.length >= cap)
      return wait(
        `all ${cap} ${platform} leases are held (WW_VERIFY_MAX_${platform.toUpperCase()})`
      )

    const devices = pool()
    const warm = readWarm(leases, { persist: true })
    const taken = new Set([
      ...leases.map((l) => l.key),
      ...warm.filter(evicting).map((w) => w.key),
    ])
    const score = (d) =>
      (warm.some((w) => w.key === d.key) ? 2 : 0) + (prefer(d) ? 1 : 0)
    let device = devices
      .filter((d) => !taken.has(d.key))
      .sort((a, b) => score(b) - score(a))[0]

    const others = warm.filter((w) => !evicting(w) && w.key !== device?.key)
    const used = usage(leases, liveBuilds(now), others)
    if (used + need > CONFIG.budgetGb) {
      const after = running(leases, warm)
      if (!warm.some((w) => w.key === device?.key)) after[platform]++
      const evict = markEvictions(
        aboveFloor(others, after),
        (freed) => used - freed + need <= CONFIG.budgetGb,
        pid
      )
      if (evict) {
        writeJsonAtomic(WAITERS, waiters)
        return { evict }
      }
      return wait(
        `memory budget: ${used} GB in use + ${need} GB > ${CONFIG.budgetGb} GB (WW_VERIFY_MEMORY_BUDGET_GB); ${describeUse(leases, now)}`
      )
    }

    const since = waiters.find((w) => w.pid === pid).since
    const build = liveBuildWaiters(now).find(
      (w) =>
        w.since < since &&
        (w.blockedOn === 'pressure' ||
          (w.blockedOn === 'memory' &&
            used + need + CONFIG.est[`build-${w.platform}`] > CONFIG.budgetGb))
    )
    if (build)
      return wait(
        `yielding memory to an earlier ${build.platform} build for ${path.basename(build.worktree)}`
      )

    const cold = !warm.some((w) => w.key === device?.key)
    const blocked = cold && liveBlock('device', now)
    if (blocked) {
      const evict =
        blocked.blockedOn === 'pressure' &&
        evictForPressure(aboveFloor(others, running(leases, warm)), pid)
      if (evict) {
        writeJsonAtomic(WAITERS, waiters)
        return { evict }
      }
      return wait(blocked.reason)
    }
    if (!device) {
      if (devices.length >= cap)
        return wait(`all ${devices.length} ${platform} devices are taken`)
      device = create(devices)
    }
    const metroPort = pickPort(leases, worktree, busyPorts())
    if (!metroPort) return wait('no free Metro port in 8090-8129')
    const lease = {
      key: device.key,
      worktree,
      platform,
      kind,
      deviceId: device.id,
      deviceName: device.name,
      metroPort,
      createdAt: now,
      heartbeatAt: now,
      at: now,
    }
    writeJsonAtomic(lockFile(device.key), lease)
    writeJsonAtomic(
      WARM,
      readJson(WARM, []).filter((w) => w.key !== device.key)
    )
    if (cold) admitted(`${platform} boot for ${path.basename(worktree)}`, now)
    leave()
    return { lease, warm: !cold }
  })
}

export async function claimLease(
  options,
  {
    waitMs,
    pollMs = 12_000,
    beforeTry = async () => {},
    onWait = () => {},
    shutdown = async () => {},
  }
) {
  const deadline = Date.now() + waitMs
  const pid = options.pid ?? process.pid
  try {
    for (;;) {
      await beforeTry()
      const result = tryClaim(options)
      if (result.evict) {
        await shutdownWarm(result.evict, shutdown, pid)
        continue
      }
      if (result.lease || result.impossible || Date.now() >= deadline)
        return result
      onWait(result)
      await sleep(Math.max(0, Math.min(pollMs, deadline - Date.now())))
    }
  } finally {
    withMutex(() =>
      writeJsonAtomic(
        WAITERS,
        liveWaiters().filter((w) => w.pid !== pid)
      )
    )
  }
}

export function heartbeat(worktree) {
  return withMutex(() => {
    const now = Date.now()
    return readLeases(now)
      .filter((l) => l.worktree === worktree && !l.reaping)
      .map((l) => {
        save({ ...l, heartbeatAt: now, at: now })
        return l.key
      })
  })
}

export function updateLeases(worktree, patch, keys) {
  withMutex(() => {
    for (const l of readLeases())
      if (
        l.worktree === worktree &&
        !l.expired &&
        (!keys || keys.includes(l.key))
      )
        save({ ...l, ...patch })
  })
}

export function reservePort(worktree, exclude, busyPorts) {
  return withMutex(() => {
    const leases = readLeases()
    const port = pickPort(
      leases.filter((l) => l.worktree !== worktree),
      worktree,
      busyPorts(),
      exclude
    )
    if (port) updateLeases(worktree, { metroPort: port })
    return port
  })
}

export function release(worktree, filter = () => true) {
  return withMutex(() =>
    readLeases()
      .filter((l) => l.worktree === worktree && filter(l))
      .map((l) => {
        fs.rmSync(l.file, { force: true })
        return l
      })
  )
}

export async function gc(cleanup) {
  const victims = withMutex(() =>
    readLeases()
      .filter((l) => l.expired && !l.reaping)
      .map((l) => {
        writeJsonAtomic(l.file, {
          ...readJson(l.file, {}),
          reaper: { pid: process.pid, at: Date.now() },
        })
        return l
      })
  )
  for (const lease of victims) {
    try {
      await cleanup(lease)
    } catch (error) {
      console.error(`[ww-verify] reaping ${lease.key}: ${error.message}`)
    } finally {
      withMutex(() => {
        if (readJson(lease.file, {}).reaper?.pid === process.pid)
          fs.rmSync(lease.file, { force: true })
      })
    }
  }
  return victims
}

export async function shutdownWarm(victims, shutdown, pid = process.pid) {
  try {
    for (const w of victims) await shutdown(w)
  } finally {
    dropWarm(victims, pid)
  }
}

export function tryAcquireBuild({
  worktree,
  platform,
  fingerprint,
  pid = process.pid,
}) {
  return withMutex(() => {
    const now = Date.now()
    const builds = liveBuilds(now)
    if (builds.some((b) => b.pid === pid)) return { ok: true }
    const leases = readLeases(now)
    const need = CONFIG.est[`build-${platform}`]
    const waiters = liveBuildWaiters(now)
    let me = waiters.find((w) => w.pid === pid)
    if (!me) {
      me = { pid, worktree, platform, fingerprint, since: now }
      waiters.push(me)
    }
    me.seenAt = now
    const queue = [...waiters].sort((a, b) => a.since - b.since)
    const position = queue.indexOf(me) + 1
    const wait = (reason, extra = {}) => {
      me.reason = reason
      me.blockedOn = extra.blockedOn ?? null
      writeJsonAtomic(BUILD_WAITERS, waiters)
      return { wait: reason, position, queued: queue.length, ...extra }
    }
    if (need > CONFIG.budgetGb)
      return wait(
        `a ${platform} build needs ${need} GB, over WW_VERIFY_MEMORY_BUDGET_GB=${CONFIG.budgetGb}`,
        { impossible: true }
      )
    if (position > 1)
      return wait(
        `queued behind ${position - 1} earlier build(s) (${queue
          .slice(0, position - 1)
          .map((w) => `${w.platform} ${path.basename(w.worktree)}`)
          .join(', ')})`
      )
    if (builds.length >= CONFIG.maxBuilds)
      return wait(
        `${builds.length} of ${CONFIG.maxBuilds} build slots busy (${builds.map((b) => `${b.platform} ${path.basename(b.worktree)} ${String(b.fingerprint).slice(0, 12)}`).join(', ')}; WW_VERIFY_MAX_BUILDS)`
      )
    const warm = readWarm(leases, { persist: true }).filter((w) => !evicting(w))
    const used = usage(leases, builds, warm)
    if (used + need > CONFIG.budgetGb) {
      const evict = markEvictions(
        [...warm].sort((a, b) => a.since - b.since),
        (freed) => used - freed + need <= CONFIG.budgetGb,
        pid
      )
      if (evict) {
        writeJsonAtomic(BUILD_WAITERS, waiters)
        return { evict }
      }
      return wait(
        `memory budget: ${used} GB in use + ${need} GB build > ${CONFIG.budgetGb} GB; ${describeUse(leases, now)}`,
        { blockedOn: 'memory' }
      )
    }
    const blocked = liveBlock('build', now)
    if (blocked) {
      const evict =
        blocked.blockedOn === 'pressure' && evictForPressure(warm, pid)
      if (evict) {
        writeJsonAtomic(BUILD_WAITERS, waiters)
        return { evict }
      }
      return wait(blocked.reason, { blockedOn: blocked.blockedOn })
    }
    admitted(`${platform} build for ${path.basename(worktree)}`, now)
    writeJsonAtomic(BUILDS, [
      ...storedBuilds(now),
      { pid, worktree, platform, fingerprint, startedAt: now, seenAt: now },
    ])
    writeJsonAtomic(
      BUILD_WAITERS,
      waiters.filter((w) => w.pid !== pid)
    )
    return { ok: true }
  })
}

function updateBuild(pid, patch) {
  withMutex(() =>
    writeJsonAtomic(
      BUILDS,
      storedBuilds().map((b) => (b.pid === pid ? { ...b, ...patch } : b))
    )
  )
}

export function setBuildGroup(pgid, dirs, pid = process.pid) {
  updateBuild(pid, { pgid, dirs })
}

let buildTimer

export async function acquireBuild(
  options,
  {
    waitMs,
    pollMs = 10_000,
    onWait = () => {},
    ready = () => null,
    shutdown = async () => {},
  }
) {
  const deadline = Date.now() + waitMs
  const pid = options.pid ?? process.pid
  try {
    for (;;) {
      const cached = ready()
      if (cached) return { cached }
      const result = tryAcquireBuild(options)
      if (result.evict) {
        await shutdownWarm(result.evict, shutdown, pid)
        continue
      }
      if (result.ok) {
        clearInterval(buildTimer)
        buildTimer = setInterval(() => {
          try {
            updateBuild(pid, { seenAt: Date.now() })
          } catch {}
        }, 60_000)
        buildTimer.unref()
      }
      if (result.ok || result.impossible || Date.now() >= deadline)
        return result
      onWait(result)
      await sleep(Math.max(0, Math.min(pollMs, deadline - Date.now())))
    }
  } finally {
    withMutex(() =>
      writeJsonAtomic(
        BUILD_WAITERS,
        liveBuildWaiters().filter((w) => w.pid !== pid)
      )
    )
  }
}

export function releaseBuild(pid = process.pid) {
  clearInterval(buildTimer)
  withMutex(() =>
    writeJsonAtomic(
      BUILDS,
      storedBuilds().filter((b) => b.pid !== pid)
    )
  )
}

function processTable() {
  const out = spawnSync('ps', ['-axww', '-o', 'pid=,ppid=,pgid=,command='], {
    encoding: 'utf8',
  }).stdout
  return (out ?? '')
    .split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/))
    .filter(Boolean)
    .map((m) => ({
      pid: Number(m[1]),
      ppid: Number(m[2]),
      pgid: Number(m[3]),
      command: m[4],
    }))
}

function groupOwnedBy(pgid, worktree) {
  return processTable().some(
    (p) => p.pgid === pgid && p.command.includes(worktree)
  )
}

export function killTree(pgid) {
  const tree = new Set()
  const signal = (pid, name) => {
    try {
      process.kill(pid, name)
    } catch {}
  }
  for (let pass = 0; pass < 20; pass++) {
    const table = processTable()
    const found = table
      .filter((p) => p.pgid === pgid || tree.has(p.ppid) || tree.has(p.pid))
      .map((p) => p.pid)
    for (let grew = true; grew; ) {
      grew = false
      for (const p of table)
        if (!found.includes(p.pid) && found.includes(p.ppid)) {
          found.push(p.pid)
          grew = true
        }
    }
    const fresh = found.filter((pid) => !tree.has(pid))
    if (!fresh.length) break
    for (const pid of fresh) {
      tree.add(pid)
      signal(pid, 'SIGSTOP')
    }
  }
  for (const pid of tree) signal(pid, 'SIGKILL')
  for (let i = 0; i < 50 && [...tree].some(pidAlive); i++) sleepSync(200)
  return tree.size
}

export function removeDirs(dirs, log = () => {}) {
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue
    try {
      fs.rmSync(dir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 500,
      })
      log(`removed ${dir}`)
    } catch (error) {
      log(`could not remove ${dir}: ${error.message}`)
    }
  }
}

export async function reapBuilds({ log = () => {} } = {}) {
  const now = Date.now()
  const victims = readJson(BUILDS, []).filter((b) => isOrphan(b, now))
  for (const b of victims) {
    if (groupAlive(b.pgid) && groupOwnedBy(b.pgid, b.worktree)) {
      log(
        `killing orphaned ${b.platform} build of ${path.basename(b.worktree)} (process group ${b.pgid}; its up ${b.pid} is gone)`
      )
      killTree(b.pgid)
    }
  }
  const reaped = withMutex(() => {
    const all = readJson(BUILDS, [])
    const gone = (b) =>
      victims.some((v) => v.pid === b.pid && v.startedAt === b.startedAt) &&
      (!groupAlive(b.pgid) || !groupOwnedBy(b.pgid, b.worktree))
    const left = all.filter((b) => !gone(b))
    if (left.length !== all.length) writeJsonAtomic(BUILDS, left)
    return all.filter(gone).map((b) => ({
      ...b,

      removeDirs: !left.some((l) => l.worktree === b.worktree),
    }))
  })
  for (const b of reaped) if (b.removeDirs) removeDirs(b.dirs ?? [], log)
  return reaped
}

export function snapshot() {
  const now = Date.now()
  const leases = readLeases(now)
  const builds = liveBuilds(now).map((b) => ({
    ...b,
    orphaned: isOrphan(b, now),
  }))
  const warm = readWarm(leases)
  return {
    leases,
    builds,
    warm,
    waiters: liveWaiters(now).sort((a, b) => a.since - b.since),
    buildWaiters: liveBuildWaiters(now).sort((a, b) => a.since - b.since),
    memory: memoryLevel(),
    usedGb: usage(
      leases,
      builds,
      warm.filter((w) => !evicting(w))
    ),
  }
}
