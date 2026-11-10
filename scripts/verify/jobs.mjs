import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CONFIG,
  HOME,
  groupAlive,
  killTree,
  liveBuilds,
  memoryLevel,
  pidAlive,
  readLeases,
  sleep,
  usage,
  withMutex,
} from './leases.mjs'

const JOBS = path.join(HOME, 'jobs.json')
const JOB_WAITERS = path.join(HOME, 'job-waiters.json')
const HOLD = path.join(HOME, 'hold.json')

export const BUSY = 75

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(
  /\/$/,
  ''
)

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`)
  fs.renameSync(tmp, file)
}

const round = (gb) => Math.round(gb * 10) / 10
const alive = (j) => pidAlive(j.pid) || groupAlive(j.pgid)
const fresh = (now) => (w) => pidAlive(w.pid) && now - w.seenAt < 2 * 60_000

export const liveJobs = () => readJson(JOBS, []).filter(alive)
export const liveJobWaiters = (now = Date.now()) =>
  readJson(JOB_WAITERS, [])
    .filter(fresh(now))
    .sort((a, b) => a.since - b.since)

export const readHold = () => readJson(HOLD, null)

export function setHold(reason) {
  const hold = { reason, at: Date.now() }
  writeJson(HOLD, hold)
  return hold
}

export function clearHold() {
  const hold = readHold()
  fs.rmSync(HOLD, { force: true })
  return hold
}

export const ignoresHold = (env = process.env) =>
  Boolean(env.WW_VERIFY_IGNORE_HOLD)

export function holdMessage(hold, what) {
  return `verification is on hold${hold.reason ? `: ${hold.reason}` : ''}. Skip ${what} and list it as unverified in your report. If the task cannot be finished without it, rerun with WW_VERIFY_IGNORE_HOLD=1 and say so.`
}

const overAge = (job, now) => {
  const limit = CONFIG.jobs.classes[job.cls]?.maxMin
  return Boolean(limit && job.pgid && now - job.startedAt > limit * 60_000)
}

export function reapJobs({ log = () => {}, now = Date.now() } = {}) {
  const victims = withMutex(() => liveJobs().filter((j) => overAge(j, now)))
  for (const job of victims) {
    log(
      `stopping ${job.cls} of ${path.basename(job.worktree)}: it ran over ${CONFIG.jobs.classes[job.cls].maxMin} min`
    )
    killTree(job.pgid)
  }
  if (victims.length) withMutex(() => writeJson(JOBS, liveJobs()))
  return victims
}

export function tryAdmit({ cls, worktree, label, pid = process.pid }) {
  return withMutex(() => {
    const now = Date.now()
    const policy = CONFIG.jobs.classes[cls]
    const jobs = liveJobs()
    if (jobs.some((j) => j.pid === pid)) return { ok: true }
    const waiters = liveJobWaiters(now)
    let me = waiters.find((w) => w.pid === pid)
    if (!me) {
      me = { pid, cls, worktree, label, since: now }
      waiters.push(me)
    }
    me.seenAt = now
    const position = waiters.indexOf(me) + 1
    const wait = (reason) => {
      me.reason = reason
      writeJson(JOB_WAITERS, waiters)
      return { wait: reason, position, queued: waiters.length }
    }
    const count = (name) => jobs.filter((j) => j.cls === name).length
    const capped = (name) => count(name) >= CONFIG.jobs.classes[name].max
    const names = (list) =>
      list.map((j) => `${j.cls} ${path.basename(j.worktree)}`).join(', ')

    if (capped(cls))
      return wait(
        `${count(cls)} of ${policy.max} ${cls} slots busy (${names(jobs.filter((j) => j.cls === cls))})`
      )
    const ahead = waiters
      .slice(0, position - 1)
      .filter((w) => w.cls === cls || !capped(w.cls))
    if (ahead.length)
      return wait(`queued behind ${ahead.length} earlier job(s)`)
    if (jobs.length >= CONFIG.jobs.max)
      return wait(
        `${jobs.length} of ${CONFIG.jobs.max} job slots busy (${names(jobs)}; WW_VERIFY_MAX_JOBS)`
      )
    const used = round(
      usage(readLeases(now), liveBuilds(now)) +
        jobs.reduce((sum, j) => sum + (CONFIG.jobs.classes[j.cls]?.gb ?? 0), 0)
    )
    if (jobs.length && used + policy.gb > CONFIG.budgetGb)
      return wait(
        `memory budget: ${used} GB in use + ${policy.gb} GB > ${CONFIG.budgetGb} GB (WW_VERIFY_MEMORY_BUDGET_GB)`
      )
    const level = memoryLevel()
    if (level && jobs.length) {
      if (level.pressure > 1)
        return wait(`macOS reports memory pressure (${level.free}% free)`)
      if (level.free < CONFIG.jobs.minFreePct)
        return wait(
          `${level.free}% of memory free, under the ${CONFIG.jobs.minFreePct}% a job needs (WW_VERIFY_MIN_FREE_PCT_JOB)`
        )
    }
    writeJson(JOBS, [...jobs, { pid, cls, worktree, label, startedAt: now }])
    writeJson(
      JOB_WAITERS,
      waiters.filter((w) => w.pid !== pid)
    )
    return { ok: true }
  })
}

function updateJob(pid, patch) {
  withMutex(() =>
    writeJson(
      JOBS,
      liveJobs().map((j) => (j.pid === pid ? { ...j, ...patch } : j))
    )
  )
}

function leave(pid) {
  withMutex(() => {
    writeJson(
      JOBS,
      readJson(JOBS, []).filter((j) => j.pid !== pid && alive(j))
    )
    writeJson(
      JOB_WAITERS,
      liveJobWaiters().filter((w) => w.pid !== pid)
    )
  })
}

const listening = (port) =>
  spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN']).status === 0

export function reserveWebPort(pid = process.pid, busy = listening) {
  return withMutex(() => {
    const jobs = liveJobs()
    const taken = new Set(jobs.map((j) => j.port).filter(Boolean))
    const port = CONFIG.jobs.webPorts.find((p) => !taken.has(p) && !busy(p))
    if (port)
      writeJson(
        JOBS,
        jobs.map((j) => (j.pid === pid ? { ...j, port } : j))
      )
    return port
  })
}

const direct = (env) =>
  Boolean(env.CI || env.WW_VERIFY_JOB || env.WW_VERIFY_GATE === 'off')

function exec(argv, { cwd, env, detached }) {
  const proc = spawn(argv[0], argv.slice(1), {
    cwd,
    env,
    stdio: 'inherit',
    detached,
  })
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP']
  const forward = (signal) => {
    try {
      process.kill(detached ? -proc.pid : proc.pid, signal)
    } catch {}
  }
  for (const signal of signals) process.on(signal, forward)
  const status = new Promise((resolve) => {
    proc.on('error', (error) => {
      console.error(`[ww-verify] ${argv[0]}: ${error.message}`)
      resolve(127)
    })
    proc.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)))
  }).finally(() => {
    for (const signal of signals) process.off(signal, forward)
  })
  return { pid: proc.pid, status }
}

export async function runJob({
  cls,
  argv,
  cwd = process.cwd(),
  env = process.env,
  worktree = ROOT,
  waitMs = CONFIG.jobs.waitMin * 60_000,
  pollMs = Number(env.WW_VERIFY_JOB_POLL_MS) || 2000,
  prepare = () => ({}),
  log = (message) => console.error(`[ww-verify] ${message}`),
}) {
  const policy = CONFIG.jobs.classes[cls]
  if (!policy)
    throw new Error(
      `Unknown job class "${cls}"; use ${Object.keys(CONFIG.jobs.classes).join(', ')}`
    )
  if (direct(env)) return exec(argv, { cwd, env, detached: false }).status
  const hold = policy.held && !ignoresHold(env) && readHold()
  if (hold) {
    log(holdMessage(hold, `this ${cls}`))
    return BUSY
  }
  const pid = process.pid
  const label = argv.join(' ').slice(0, 120)
  const deadline = Date.now() + waitMs
  let said = ''
  try {
    for (;;) {
      reapJobs({ log })
      const result = tryAdmit({ cls, worktree, label, pid })
      if (result.ok) break
      if (Date.now() >= deadline) {
        log(
          `gave up after ${Math.round(waitMs / 60_000)} min in the queue: ${result.wait}. The machine is busy; see \`wwv status\`, then retry later.`
        )
        return BUSY
      }
      if (result.wait !== said) {
        said = result.wait
        log(
          `waiting for a ${cls} slot (${result.position} of ${result.queued} in the queue): ${result.wait}`
        )
      }
      await sleep(Math.max(0, Math.min(pollMs, deadline - Date.now())))
    }
    const extra = await prepare()
    const detached = !process.stdin.isTTY
    const running = exec(argv, {
      cwd,
      env: { ...env, ...extra, WW_VERIFY_JOB: cls },
      detached,
    })
    if (detached && running.pid) updateJob(pid, { pgid: running.pid })
    return await running.status
  } finally {
    leave(pid)
  }
}

export async function cli(args, options = {}) {
  const split = args.indexOf('--')
  const head = split === -1 ? [] : args.slice(0, split)
  const argv = split === -1 ? [] : args.slice(split + 1)
  const flag = (name) => {
    const at = head.indexOf(`--${name}`)
    return at === -1 ? undefined : head[at + 1]
  }
  const cls = flag('class')
  if (!cls || !argv.length) {
    console.error(
      `Usage: wwv run --class <${Object.keys(CONFIG.jobs.classes).join('|')}> [--wait <minutes>] -- <command...>`
    )
    return 2
  }
  const wait = Number(flag('wait'))
  return runJob({
    cls,
    argv,
    ...(Number.isFinite(wait) && flag('wait') ? { waitMs: wait * 60_000 } : {}),
    ...options,
  })
}

export function jobsSnapshot() {
  const now = Date.now()
  return {
    hold: readHold(),
    jobs: liveJobs(),
    jobWaiters: liveJobWaiters(now),
  }
}
