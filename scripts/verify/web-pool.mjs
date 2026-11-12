import { spawn, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BUSY,
  acquire,
  adoptJob,
  dropJob,
  liveJobs,
  reserveWebPort,
  runJob,
  touchJob,
} from './jobs.mjs'
import { killTree, pidAlive, sleep } from './leases.mjs'

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(
  /\/$/,
  ''
)
const STAMP = path.join(ROOT, '.verify/web-build.json')
const DEV_STATE = path.join(ROOT, '.verify/web-dev.json')
const DEV_LOG = path.join(ROOT, '.verify/web-dev.log')
const DEV_WORKERS = process.env.WW_VERIFY_WEB_DEV_WORKERS || '4'
const PROFILES = ['local', 'dev', 'beta', 'production']

const UNBUNDLED = [
  ':!e2e',
  ':!docs',
  ':!.agents',
  ':!.claude',
  ':!.github',
  ':!scripts/tests',
  ':!scripts/verify',
  ':!services',
  ':!*.md',
  ':!*.test.ts',
  ':!*.test.tsx',
]

const toolEnv = () => ({
  ...process.env,
  PATH: `${path.join(ROOT, 'node_modules/.bin')}${path.delimiter}${process.env.PATH ?? ''}`,
})

const log = (message) => console.error(`[ww-verify] ${message}`)

const git = (root, args) =>
  spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  }).stdout ?? ''

function envFiles(root) {
  const dirs = new Set([root])
  const common = git(root, ['rev-parse', '--git-common-dir']).trim()
  if (common) dirs.add(path.dirname(path.resolve(root, common)))
  return [...dirs].flatMap((dir) => {
    try {
      return fs
        .readdirSync(dir)
        .filter((name) => name.startsWith('.env'))
        .sort()
        .map((name) => path.join(dir, name))
    } catch {
      return []
    }
  })
}

export function webBuildKey(profile, root = ROOT) {
  const hash = crypto.createHash('sha256')
  hash.update(`${profile}\n`)
  hash.update(git(root, ['ls-files', '-s', '--', '.', ...UNBUNDLED]))
  hash.update(git(root, ['diff', '--', '.', ...UNBUNDLED]))
  const untracked = git(root, [
    'ls-files',
    '-o',
    '--exclude-standard',
    '-z',
    '--',
    '.',
    ...UNBUNDLED,
  ])
    .split('\0')
    .filter(Boolean)
  for (const file of [
    ...untracked.map((f) => path.join(root, f)),
    ...envFiles(root),
  ]) {
    hash.update(`${file}\n`)
    try {
      hash.update(fs.readFileSync(file))
    } catch {}
  }
  return hash.digest('hex')
}

const readStamp = () => {
  try {
    return JSON.parse(fs.readFileSync(STAMP, 'utf8'))
  } catch {
    return null
  }
}

function profileOf(args) {
  const at = args.indexOf('--env')
  const profile = at === -1 ? 'dev' : args[at + 1]
  if (!PROFILES.includes(profile))
    throw new Error(`--env must be one of ${PROFILES.join(', ')}`)
  return profile
}

export async function webBuild(args = []) {
  const profile = profileOf(args)
  const key = webBuildKey(profile)
  const stamp = readStamp()
  if (
    !args.includes('--force') &&
    stamp?.key === key &&
    fs.existsSync(path.join(ROOT, 'dist/index.html'))
  ) {
    log(`dist/ already matches this tree (${profile}); skipping the export`)
    return 0
  }
  fs.rmSync(STAMP, { force: true })
  const status = await runJob({
    cls: 'web-build',
    cwd: ROOT,
    env: toolEnv(),
    argv: ['node', 'scripts/web.mjs', 'build', '--env', profile],
  })
  if (status === 0 && webBuildKey(profile) === key) {
    fs.mkdirSync(path.dirname(STAMP), { recursive: true })
    fs.writeFileSync(
      STAMP,
      `${JSON.stringify({ key, profile, builtAt: Date.now() })}\n`
    )
  }
  return status
}

const has = (args, name) =>
  args.some((arg) => arg === name || arg.startsWith(`${name}=`))

const readDev = () => {
  try {
    return JSON.parse(fs.readFileSync(DEV_STATE, 'utf8'))
  } catch {
    return null
  }
}

function liveDev() {
  const state = readDev()
  if (!state || !pidAlive(state.pid)) return null
  return liveJobs().some((j) => j.pid === state.pid) ? state : null
}

const logTail = () => {
  try {
    return fs.readFileSync(DEV_LOG, 'utf8').slice(-1500)
  } catch {
    return ''
  }
}

async function fetchText(url, timeoutMs) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return response.text()
}

function stopDev(state) {
  killTree(state.pid)
  dropJob(state.pid)
  fs.rmSync(DEV_STATE, { force: true })
}

export async function ensureDev(args = []) {
  const running = liveDev()
  if (running) {
    touchJob(running.pid)
    return running
  }
  fs.rmSync(DEV_STATE, { force: true })
  if (!(await acquire({ cls: 'web-dev', label: 'expo start --web' })))
    return null
  let state
  try {
    const port = reserveWebPort()
    if (!port) throw new Error('No free web port in 8130-8159')
    fs.mkdirSync(path.dirname(DEV_LOG), { recursive: true })
    const out = fs.openSync(DEV_LOG, 'w')
    const server = spawn(
      'node',
      ['scripts/web.mjs', 'start', '--port', String(port), ...args],
      {
        cwd: ROOT,
        env: { ...toolEnv(), WW_WEB_MAX_WORKERS: DEV_WORKERS },
        detached: true,
        stdio: ['ignore', out, out],
      }
    )
    server.unref()
    fs.closeSync(out)
    state = { pid: server.pid, port, startedAt: Date.now() }
    adoptJob(process.pid, {
      pid: server.pid,
      pgid: server.pid,
      port,
      touchedAt: Date.now(),
    })
    fs.writeFileSync(DEV_STATE, `${JSON.stringify(state)}\n`)
  } catch (error) {
    dropJob(process.pid)
    throw error
  }
  try {
    const origin = `http://localhost:${state.port}`
    log(`starting the web dev server on ${origin} (log: .verify/web-dev.log)`)
    let index
    for (const deadline = Date.now() + 180_000; !index; ) {
      if (!pidAlive(state.pid))
        throw new Error(`the web dev server exited:\n${logTail()}`)
      if (Date.now() > deadline)
        throw new Error(`the web dev server never answered:\n${logTail()}`)
      index = await fetchText(origin, 5000).catch(() => null)
      if (!index) await sleep(1000)
    }
    const bundle = index.match(/src="([^"]*\.bundle[^"]*)"/)?.[1]
    if (bundle) {
      const beat = setInterval(() => touchJob(state.pid), 30_000)
      try {
        if (!(await acquire({ cls: 'web-build', label: 'first web bundle' })))
          throw new Error('no slot for the first bundle')
        const started = Date.now()
        log(
          'bundling the app for the first time (later edits rebundle in under a second)'
        )
        await fetchText(origin + bundle.replaceAll('&amp;', '&'), 15 * 60_000)
        log(`first bundle took ${Math.round((Date.now() - started) / 1000)} s`)
      } finally {
        clearInterval(beat)
        dropJob(process.pid)
      }
    }
    touchJob(state.pid)
    return state
  } catch (error) {
    stopDev(state)
    throw error
  }
}

export async function webTest(args = []) {
  const env = process.env
  const exported = args.includes('--export')
  const rest = args.filter((arg) => arg !== '--no-build' && arg !== '--export')
  const external = Boolean(env.E2E_HOST || env.E2E_EXTERNAL)
  let dev = null
  if (exported && !external && !args.includes('--no-build')) {
    const built = await webBuild([])
    if (built !== 0) return built
  }
  if (!exported && !external) {
    dev = await ensureDev()
    if (!dev) return BUSY
  }
  const argv = [
    'playwright',
    'test',
    '--config',
    'e2e/web/playwright.config.ts',
    ...(has(rest, '--project') ? [] : ['--project', 'chromium-desktop']),
    ...(has(rest, '--workers') || has(rest, '-j') ? [] : ['--workers', '1']),
    ...rest,
  ]
  const beat = dev && setInterval(() => touchJob(dev.pid), 30_000)
  try {
    return await runJob({
      cls: 'web-test',
      cwd: ROOT,
      env: toolEnv(),
      argv,
      prepare: () => {
        if (dev) {
          log(`testing against the dev server on localhost:${dev.port}`)
          return {
            E2E_EXTERNAL: '1',
            E2E_HOST: 'localhost',
            E2E_PORT: String(dev.port),
          }
        }
        if (external || env.E2E_PORT) return {}
        const port = reserveWebPort()
        if (!port) throw new Error('No free web port in 8130-8159')
        log(`serving dist/ on 127.0.0.1:${port} for this run`)
        return { E2E_PORT: String(port) }
      },
    })
  } finally {
    if (dev) {
      clearInterval(beat)
      touchJob(dev.pid)
    }
  }
}

export async function webDev(args = []) {
  const dev = await ensureDev(args)
  if (!dev) return BUSY
  console.log(
    JSON.stringify({ url: `http://localhost:${dev.port}`, port: dev.port })
  )
  return 0
}

export function webDown() {
  const state = readDev()
  if (!state) return false
  stopDev(state)
  return true
}
