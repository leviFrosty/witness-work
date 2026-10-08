// Machine-wide coordination for ww-verify: a crash-safe mutex, device leases
// with caps and a FIFO wait queue, native build slots, and a memory budget.
// State is plain JSON in WW_VERIFY_HOME (default ~/.ww-verify). Lease files
// keep the old `{ worktree, at }` lock shape so older harness copies still
// treat leased devices as taken.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const env = process.env
// Machines with 16 GB or less get a tighter policy (see SKILL.md). Env vars
// always win; POLICY records where each value came from for `status`.
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
  // Idle devices per platform kept booted after `down` for the next `up`.
  warm: num('WW_VERIFY_WARM', 2, 1),
  warmHours: num('WW_VERIFY_WARM_HOURS', 12),
  // Devices per platform kept running (leased or warm); `wwv warm` boots up to
  // it. Only a native build, which can't fit otherwise, goes below it.
  warmMin: num('WW_VERIFY_WARM_MIN', 0),
  // The estimates are full footprints, but an idle device compresses to about
  // a third of its estimate, so a small machine budgets its whole RAM and
  // leaves the real limit to the live check below.
  budgetGb: num(
    'WW_VERIFY_MEMORY_BUDGET_GB',
    Math.round(RAM_GB * 0.7),
    Math.round(RAM_GB)
  ),
  // Live check on top of the budget (macOS): a boot or build starts only while
  // the kernel's free-memory level (kern.memorystatus_level) is at least this
  // many percent and pressure is normal, and once the previous boot or build
  // has had `settleSec` to show up in that level.
  minFreePct: num('WW_VERIFY_MIN_FREE_PCT', 25),
  minFreePctBuild: num('WW_VERIFY_MIN_FREE_PCT_BUILD', 35),
  settleSec: num('WW_VERIFY_SETTLE_SEC', 60),
  // GB per item, measured on a 16 GB Mac Mini (footprint, not RSS); calibrate
  // with the env vars on a new machine.
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
const REAPER_STALE_MS = 10 * 60 * 1000
// A build refreshes `seenAt` every minute, so a reused pid can't hold a slot.
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

// ---------- mutex ----------

let mutexDepth = 0

function breakStaleMutex() {
  let stat
  try {
    stat = fs.statSync(MUTEX)
  } catch {
    return
  }
  const owner = readText(path.join(MUTEX, 'owner'))
  const [pid, at] = owner ? owner.split(' ').map(Number) : [0, stat.mtimeMs]
  const age = Date.now() - at
  const stale = owner ? !pidAlive(pid) || age > MUTEX_STALE_MS : age > 5000
  if (!stale) return
  const grave = `${MUTEX}.stale-${process.pid}-${Date.now()}`
  try {
    fs.renameSync(MUTEX, grave)
  } catch {
    return
  }
  // Another process may have broken and retaken it between our read and the
  // rename; if we moved a live mutex, hand it back.
  if (readText(path.join(grave, 'owner')) !== owner) {
    try {
      fs.renameSync(grave, MUTEX)
    } catch {
      // someone holds a newer one; theirs wins
    }
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

/** Runs `fn` (synchronous, short) while holding the machine-wide mutex. */
export function withMutex(fn) {
  if (mutexDepth) return fn()
  fs.mkdirSync(HOME, { recursive: true })
  const token = `${process.pid} ${Date.now()} ${Math.random().toString(36).slice(2)}`
  const deadline = Date.now() + 2 * MUTEX_STALE_MS
  for (;;) {
    try {
      fs.mkdirSync(MUTEX)
      break
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
    breakStaleMutex()
    if (Date.now() > deadline)
      throw new Error(
        `${MUTEX} is stuck; remove it if no ww-verify process is running`
      )
    sleepSync(20 + Math.random() * 60)
  }
  fs.writeFileSync(path.join(MUTEX, 'owner'), token)
  mutexDepth++
  try {
    return fn()
  } finally {
    mutexDepth--
    if (readText(path.join(MUTEX, 'owner')) === token)
      fs.rmSync(MUTEX, { recursive: true, force: true })
  }
}

// ---------- leases ----------

export function lockFile(key) {
  return path.join(LOCK_DIR, `${key.replace(/[^a-zA-Z0-9-]/g, '_')}.json`)
}

function load(file, now) {
  const raw = readJson(file, null)
  if (!raw?.worktree) return null
  const key = raw.key ?? path.basename(file, '.json')
  // Old-harness locks are `{ worktree, at }` and stay held for 24 h.
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
  } catch {
    // no locks yet
  }
  return files.map((f) => load(path.join(LOCK_DIR, f), now)).filter(Boolean)
}

const DERIVED = ['file', 'legacy', 'idleMs', 'expired', 'reaping', 'reaper']

/** Writes a lease, dropping derived fields and any reaper mark. */
function save(lease) {
  const raw = Object.fromEntries(
    Object.entries(lease).filter(([field]) => !DERIVED.includes(field))
  )
  writeJsonAtomic(lease.file ?? lockFile(raw.key), raw)
}

/**
 * Live leases, warm devices and builds, plus the Metro each leasing worktree
 * runs, in GB.
 */
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

// ---------- live memory ----------

/**
 * The kernel's free-memory level in percent and its pressure level (1 normal, 2
 * warn, 4 critical), or null where the kernel has neither (not macOS).
 * `WW_VERIFY_MEMORY_LEVEL=<free>[,<pressure>]` overrides both, for tests.
 */
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

/**
 * Why a boot or build can't start yet on live memory, as `{ reason, blockedOn
 * }`, or null when it can.
 */
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

/** Starts the settle window after a boot, build or shutdown. */
const admitted = (label, now = Date.now()) =>
  writeJsonAtomic(LAST_ADMIT, { at: now, label })

/**
 * Marks the oldest of `warm` for shutdown because live memory is short; the
 * settle window then keeps the next try from shutting down another before the
 * freed memory shows.
 */
function evictForPressure(warm, pid) {
  const victim = [...warm].sort((a, b) => a.since - b.since).slice(0, 1)
  if (!victim.length) return null
  admitted(`shutdown of warm ${victim[0].deviceName ?? victim[0].key}`)
  return mark(victim, pid)
}

// ---------- warm devices ----------

// A warm device is a booted pool device no lease holds, kept for the next
// `up`. Its memory counts toward the budget until a lease takes it or a lease
// or build that needs the room evicts it (marks it, shuts it down, drops it).
const evicting = (w) => Boolean(w.evicting && pidAlive(w.evicting))

/**
 * Warm devices no lease has taken; an eviction whose owner died is dropped.
 * `persist` (under the mutex) forgets the rest for good, since an older harness
 * that leases a warm device shuts it down without updating this file.
 */
function readWarm(leases, { persist = false } = {}) {
  const leased = new Set(leases.map((l) => l.key))
  const all = readJson(WARM, [])
  const warm = all.filter(
    (w) => !leased.has(w.key) && (!w.evicting || evicting(w))
  )
  if (persist && warm.length !== all.length) writeJsonAtomic(WARM, warm)
  return warm
}

/** Warm devices that still hold memory, i.e. not being shut down. */
const idleWarm = (leases) => readWarm(leases).filter((w) => !evicting(w))

/** Running devices (live leases and idle warm ones) per platform. */
function running(leases, warm) {
  const count = { ios: 0, android: 0 }
  for (const l of leases) if (!l.expired) count[l.platform]++
  for (const w of warm) if (!evicting(w)) count[w.platform]++
  return count
}

/**
 * Keeps `candidates` (oldest first) only while shutting each down leaves its
 * platform at `WW_VERIFY_WARM_MIN` or more; `count` is what runs afterwards
 * without them.
 */
function aboveFloor(candidates, count) {
  const left = { ...count }
  return [...candidates]
    .sort((a, b) => a.since - b.since)
    .filter((w) => left[w.platform] > CONFIG.warmMin && left[w.platform]--)
}

/**
 * Marks warm devices for shutdown, oldest first, until `fits(freedGb)`; returns
 * them, or null (nothing marked) when even all of them aren't enough.
 */
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

/**
 * Hands a lease back but keeps its device booted for the next `up`, if the warm
 * pool has room for it (`WW_VERIFY_WARM` per platform) under the memory budget.
 * `force`, or a platform below `WW_VERIFY_WARM_MIN`, skips both checks. Returns
 * false, leaving the lease in place, when it doesn't fit: the caller shuts the
 * device down and releases.
 */
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

/**
 * Marks warm devices for shutdown that match `filter` (e.g. too old), keeping
 * `WW_VERIFY_WARM_MIN` running per platform.
 */
export function evictWarm(filter, pid = process.pid) {
  return withMutex(() => {
    const leases = readLeases()
    const warm = idleWarm(leases)
    return mark(aboveFloor(warm.filter(filter), running(leases, warm)), pid)
  })
}

/**
 * Platforms with fewer running devices than `WW_VERIFY_WARM_MIN`, and by how
 * many.
 */
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

/** Forgets warm devices this process marked and has now shut down. */
export function dropWarm(victims, pid = process.pid) {
  const keys = new Set(victims.map((w) => w.key))
  withMutex(() =>
    writeJsonAtomic(
      WARM,
      readJson(WARM, []).filter((w) => !(keys.has(w.key) && w.evicting === pid))
    )
  )
}

/** Warm devices older than `WW_VERIFY_WARM_HOURS`, marked for shutdown. */
export const evictStaleWarm = (now = Date.now()) =>
  evictWarm((w) => now - w.since > CONFIG.warmHours * 3600_000)

/** Who holds the budgeted memory, for wait messages. */
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

// A waiter polls every ~12 s; one silent for 2 min is gone (or its pid reused).
const fresh = (now) => (w) => pidAlive(w.pid) && now - w.seenAt < 2 * 60_000
const liveWaiters = (now = Date.now()) =>
  readJson(WAITERS, []).filter(fresh(now))
const liveBuildWaiters = (now = Date.now()) =>
  readJson(BUILD_WAITERS, []).filter(fresh(now))

/** True while any process of the group runs. */
export function groupAlive(pgid) {
  if (!pgid) return false
  try {
    process.kill(-pgid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

// The `up` that owns a build beats every minute; a reused pid stops beating.
const ownerAlive = (b, now) =>
  pidAlive(b.pid) && now - (b.seenAt ?? b.startedAt) < BUILD_STALE_MS

/**
 * Builds holding a slot: the owning `up` is alive, or the build's process group
 * still runs (an orphan, until `reapBuilds` kills it).
 */
export function liveBuilds(now = Date.now()) {
  return readJson(BUILDS, []).filter(
    (b) => ownerAlive(b, now) || groupAlive(b.pgid)
  )
}

export const isOrphan = (b, now = Date.now()) => !ownerAlive(b, now)

/**
 * What the builds file keeps: live builds, plus dead ones whose build dirs
 * still need the reaper.
 */
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

/**
 * One attempt to lease a device. `pool()` lists existing devices as `{ key, id,
 * name }`; `create(pool)` makes one more (only while the pool is under the
 * cap). Returns `{ lease }` or `{ wait, holders, position, queued }`.
 */
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
    // Prefer a warm device (no boot), then one that already runs the build.
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
    // A warm device this lease takes over is already counted in `need`.
    const others = warm.filter((w) => !evicting(w) && w.key !== device?.key)
    const used = usage(leases, liveBuilds(now), others)
    if (used + need > CONFIG.budgetGb) {
      // A lease on a device that isn't warm adds a running device.
      const after = running(leases, warm)
      if (!warm.some((w) => w.key === device?.key)) after[platform]++
      const evict = markEvictions(
        aboveFloor(others, after),
        (freed) => used - freed + need <= CONFIG.budgetGb,
        pid
      )
      if (evict) {
        writeJsonAtomic(WAITERS, waiters) // keeps this waiter's place
        return { evict }
      }
      return wait(
        `memory budget: ${used} GB in use + ${need} GB > ${CONFIG.budgetGb} GB (WW_VERIFY_MEMORY_BUDGET_GB); ${describeUse(leases, now)}`
      )
    }
    // A build that queued earlier and waits only for memory goes first, or a
    // steady stream of device leases would starve it.
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
    // Taking a warm device boots nothing, so only a cold one checks live memory.
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

/** Polls `tryClaim` until it succeeds or `waitMs` passes. */
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

/** Refreshes this worktree's leases; returns the keys it still holds. */
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

/** Moves this worktree's Metro to a port no other lease or listener uses. */
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

/**
 * Reaps expired leases: marks them under the mutex (so no one else reaps or
 * claims them), runs `cleanup(lease)` outside it, then deletes the lease.
 */
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

/** Shuts marked warm devices down, then forgets them (even if one failed). */
export async function shutdownWarm(victims, shutdown, pid = process.pid) {
  try {
    for (const w of victims) await shutdown(w)
  } finally {
    dropWarm(victims, pid)
  }
}

// ---------- native builds ----------

/**
 * One attempt at a build slot. Build waiters queue first-come among themselves,
 * and must not hold a device lease (ww-verify releases its own before waiting),
 * so a waiter can never block the memory it waits for.
 */
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
      // A build may go below WW_VERIFY_WARM_MIN; `wwv warm` restores it.
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
      // A build may go below WW_VERIFY_WARM_MIN here too.
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

/**
 * Records the build's detached process group and output dirs, so the reaper can
 * kill an orphaned build and free its disk.
 */
export function setBuildGroup(pgid, dirs, pid = process.pid) {
  updateBuild(pid, { pgid, dirs })
}

let buildTimer

/**
 * Waits for a build slot. `ready()` is checked before every attempt, so a
 * waiter whose artifact appears (another worktree built it) stops waiting and
 * gets `{ cached }` back instead of a slot.
 */
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
          } catch {
            // the next beat retries
          }
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

/** Whether a live process of the group runs something from the worktree. */
function groupOwnedBy(pgid, worktree) {
  return processTable().some(
    (p) => p.pgid === pgid && p.command.includes(worktree)
  )
}

/**
 * Kills a build's process group and every descendant. Xcode runs its build
 * service and each compiler in process groups of their own, so the group alone
 * would leave compilers writing into the build dirs. The tree is frozen
 * (SIGSTOP) until no new descendant appears, so nothing spawns or reparents
 * away mid-kill, then killed.
 */
export function killTree(pgid) {
  const tree = new Set()
  const signal = (pid, name) => {
    try {
      process.kill(pid, name)
    } catch {
      // already gone
    }
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

/** Removes build dirs; a just-killed writer can race the first attempt. */
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

/**
 * Kills builds whose owning `up` died (killed, crashed, or its pid reused):
 * their detached process group, then their build dirs. The group must run
 * something from that worktree, so a reused process group id is never killed.
 * Returns the reaped entries.
 */
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
      // Another build of the same worktree may be using the same dirs.
      removeDirs: !left.some((l) => l.worktree === b.worktree),
    }))
  })
  for (const b of reaped) if (b.removeDirs) removeDirs(b.dirs ?? [], log)
  return reaped
}

/** Read-only view for `ww-verify status`. */
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
