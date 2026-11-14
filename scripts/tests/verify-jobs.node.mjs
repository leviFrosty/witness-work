import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const JOBS = new URL('../verify/jobs.mjs', import.meta.url).href
const WEB = new URL('../verify/web-pool.mjs', import.meta.url).href
const RUN = fileURLToPath(new URL('../verify/run.mjs', import.meta.url))

const homes = []
after(() => {
  for (const home of homes) fs.rmSync(home, { recursive: true, force: true })
})

function sandbox(env = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wwv-jobs-'))
  homes.push(home)
  const clean = { ...process.env }
  for (const name of ['CI', 'WW_VERIFY_JOB', 'WW_VERIFY_GATE'])
    delete clean[name]
  delete clean.WW_VERIFY_IGNORE_HOLD
  return {
    home,
    env: {
      ...clean,
      WW_VERIFY_HOME: home,
      WW_VERIFY_RAM_GB: '64',
      WW_VERIFY_MEMORY_BUDGET_GB: '100',
      WW_VERIFY_MEMORY_LEVEL: '100',
      WW_VERIFY_MAX_JOBS: '3',
      WW_VERIFY_JOB_POLL_MS: '100',
      WW_VERIFY_MAX_TYPECHECKS: '1',
      WW_VERIFY_MAX_TESTS: '2',
      ...env,
    },
    read: (name) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(home, name), 'utf8'))
      } catch {
        return null
      }
    },
  }
}

function child(box, body) {
  const code = `
    import fs from 'node:fs'
    import * as J from ${JSON.stringify(JOBS)}
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const result = await (async () => { ${body} })()
    console.log(JSON.stringify(result ?? null))
  `
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, ['--input-type=module', '-e', code], {
      env: box.env,
    })
    let out = ''
    let err = ''
    proc.stdout.on('data', (d) => (out += d))
    proc.stderr.on('data', (d) => (err += d))
    proc.on('exit', (status) =>
      status === 0
        ? resolve(JSON.parse(out.trim().split('\n').pop()))
        : reject(new Error(`child failed (${status}): ${err}`))
    )
  })
}

function gated(box, cls, script, extra = []) {
  return new Promise((resolve) => {
    const proc = spawn(
      process.execPath,
      [RUN, '--class', cls, ...extra, '--', process.execPath, '-e', script],
      { env: box.env }
    )
    let out = ''
    let err = ''
    proc.stdout.on('data', (d) => (out += d))
    proc.stderr.on('data', (d) => (err += d))
    proc.on('exit', (status) => resolve({ status, out, err }))
  })
}

const stamp = (file) =>
  `const fs = require('fs'); fs.appendFileSync(${JSON.stringify(file)}, 'start\\n'); setTimeout(() => { fs.appendFileSync(${JSON.stringify(file)}, 'end\\n') }, 400)`

test('a class at its cap runs one job at a time', async () => {
  const box = sandbox()
  const trace = path.join(box.home, 'trace')
  const runs = await Promise.all(
    Array.from({ length: 3 }, () => gated(box, 'typecheck', stamp(trace)))
  )
  assert.deepEqual(
    runs.map((r) => r.status),
    [0, 0, 0]
  )
  assert.deepEqual(fs.readFileSync(trace, 'utf8').trim().split('\n'), [
    'start',
    'end',
    'start',
    'end',
    'start',
    'end',
  ])
  assert.deepEqual(box.read('jobs.json'), [])
})

test('the job cap holds across classes', async () => {
  const box = sandbox({ WW_VERIFY_MAX_JOBS: '1' })
  const trace = path.join(box.home, 'trace')
  await Promise.all([
    gated(box, 'test', stamp(trace)),
    gated(box, 'lint', stamp(trace)),
    gated(box, 'typecheck', stamp(trace)),
  ])
  const lines = fs.readFileSync(trace, 'utf8').trim().split('\n')
  for (let i = 0; i < lines.length; i += 2)
    assert.deepEqual(lines.slice(i, i + 2), ['start', 'end'])
})

test('a waiter whose class is full does not block other classes', async () => {
  const box = sandbox()
  const result = await child(
    box,
    `const admit = (cls, pid) => J.tryAdmit({ cls, worktree: '/w/' + pid, pid })
     const a = admit('typecheck', process.pid)
     const b = admit('typecheck', process.ppid)
     const c = J.tryAdmit({ cls: 'test', worktree: '/w/c', pid: 1 })
     return { a, b: b.wait, c }`
  )
  assert.deepEqual(result.a, { ok: true })
  assert.match(result.b, /1 of 1 typecheck slots busy/)
  assert.deepEqual(result.c, { ok: true })
})

test('a waiter only queues behind earlier waiters of its own class', async () => {
  const box = sandbox({ WW_VERIFY_MEMORY_LEVEL: '5,2' })
  const result = await child(
    box,
    `const a = J.tryAdmit({ cls: 'test', worktree: '/w/a', pid: process.pid })
     const b = J.tryAdmit({ cls: 'lint', worktree: '/w/b', pid: process.ppid })
     J.clearHold()
     return { a, b: b.wait }`
  )
  assert.deepEqual(result.a, { ok: true })
  assert.match(result.b, /memory pressure/)
  const calm = { ...box, env: { ...box.env, WW_VERIFY_MEMORY_LEVEL: '100' } }
  assert.deepEqual(
    await child(
      calm,
      `return J.tryAdmit({ cls: 'typecheck', worktree: '/w/c', pid: 1 })`
    ),
    { ok: true }
  )
})

test('dev servers stay out of the job cap and expire when idle', async () => {
  const box = sandbox({ WW_VERIFY_MAX_JOBS: '1', WW_VERIFY_MAX_WEB_DEV: '1' })
  const server = spawn(
    process.execPath,
    ['-e', 'setInterval(() => {}, 1000)'],
    {
      detached: true,
      stdio: 'ignore',
    }
  )
  server.unref()
  const result = await child(
    box,
    `const dev = J.tryAdmit({ cls: 'web-dev', worktree: '/w/a', pid: process.pid })
     J.adoptJob(process.pid, { pid: ${server.pid}, pgid: ${server.pid}, port: 8130, touchedAt: Date.now() - 5 * 60_000 })
     const test = J.tryAdmit({ cls: 'test', worktree: '/w/a', pid: process.pid })
     J.dropJob(process.pid)
     const calm = J.reapJobs().length
     const second = J.tryAdmit({ cls: 'web-dev', worktree: '/w/b', pid: process.pid })
     const contended = J.reapJobs().length
     return { dev, test, calm, second: second.wait, contended }`
  )
  assert.deepEqual(result.dev, { ok: true })
  assert.deepEqual(result.test, { ok: true })
  assert.equal(result.calm, 0)
  assert.match(result.second, /1 of 1 web-dev slots busy/)
  assert.equal(result.contended, 1)
  assert.throws(() => process.kill(server.pid, 0))
})

test('the command exit status and arguments pass through', async () => {
  const box = sandbox()
  const run = await gated(box, 'test', 'console.log("hi"); process.exit(3)')
  assert.equal(run.status, 3)
  assert.equal(run.out.trim(), 'hi')
})

test('CI and nested jobs run directly, with no queue state', async () => {
  for (const env of [{ CI: 'true' }, { WW_VERIFY_JOB: 'test' }]) {
    const box = sandbox({ ...env, WW_VERIFY_MAX_TESTS: '0' })
    const run = await gated(box, 'test', 'process.exit(0)')
    assert.equal(run.status, 0)
    assert.equal(box.read('jobs.json'), null)
  }
})

test('a hold refuses web jobs and lets tests through', async () => {
  const box = sandbox()
  await child(box, `J.setHold('machine overloaded')`)
  const web = await gated(box, 'web-build', 'process.exit(0)')
  assert.equal(web.status, 75)
  assert.match(web.err, /on hold: machine overloaded/)
  assert.equal((await gated(box, 'test', 'process.exit(0)')).status, 0)
  const forced = sandbox({ WW_VERIFY_IGNORE_HOLD: '1' })
  fs.copyFileSync(
    path.join(box.home, 'hold.json'),
    path.join(forced.home, 'hold.json')
  )
  assert.equal((await gated(forced, 'web-build', 'process.exit(0)')).status, 0)
  await child(box, `J.clearHold()`)
  assert.equal((await gated(box, 'web-build', 'process.exit(0)')).status, 0)
})

test('a job whose runner died frees its slot', async () => {
  const box = sandbox()
  fs.writeFileSync(
    path.join(box.home, 'jobs.json'),
    JSON.stringify([
      { pid: 999999, cls: 'typecheck', worktree: '/w/a', startedAt: 1 },
    ])
  )
  assert.equal((await gated(box, 'typecheck', 'process.exit(0)')).status, 0)
})

test('waiting gives up with the busy status', async () => {
  const box = sandbox()
  const slow = gated(box, 'typecheck', 'setTimeout(() => {}, 1500)')
  await new Promise((r) => setTimeout(r, 500))
  const late = await gated(box, 'typecheck', 'process.exit(0)', [
    '--wait',
    '0.005',
  ])
  assert.equal(late.status, 75)
  assert.match(late.err, /gave up/)
  assert.equal((await slow).status, 0)
})

test('memory pressure queues a job only behind a running one', async () => {
  const box = sandbox({ WW_VERIFY_MEMORY_LEVEL: '5,2' })
  const result = await child(
    box,
    `const a = J.tryAdmit({ cls: 'test', worktree: '/w/a', pid: process.pid })
     const b = J.tryAdmit({ cls: 'test', worktree: '/w/b', pid: process.ppid })
     return { a, b: b.wait }`
  )
  assert.deepEqual(result.a, { ok: true })
  assert.match(result.b, /memory pressure/)
})

test('a web dev server over its time limit is stopped', async () => {
  const box = sandbox({ WW_VERIFY_WEB_DEV_MAX_MIN: '1' })
  const server = spawn(
    process.execPath,
    ['-e', 'setInterval(() => {}, 1000)'],
    {
      detached: true,
      stdio: 'ignore',
    }
  )
  server.unref()
  fs.writeFileSync(
    path.join(box.home, 'jobs.json'),
    JSON.stringify([
      {
        pid: 999999,
        pgid: server.pid,
        cls: 'web-dev',
        worktree: '/w/a',
        startedAt: Date.now() - 5 * 60_000,
      },
    ])
  )
  const reaped = await child(box, `return J.reapJobs().length`)
  assert.equal(reaped, 1)
  assert.throws(() => process.kill(server.pid, 0))
  assert.deepEqual(box.read('jobs.json'), [])
})

test('web ports are reserved one per job', async () => {
  const box = sandbox()
  const ports = await child(
    box,
    `J.tryAdmit({ cls: 'web-test', worktree: '/w/a', pid: process.pid })
     J.tryAdmit({ cls: 'web-test', worktree: '/w/b', pid: process.ppid })
     const free = () => false
     return [J.reserveWebPort(process.pid, free), J.reserveWebPort(process.ppid, free), J.reserveWebPort(process.pid, (p) => p === 8130)]`
  )
  assert.deepEqual(ports, [8130, 8131, 8132])
})

test('the web build key follows bundled files only', async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'wwv-web-key-'))
  homes.push(repo)
  const git = (...args) => spawnSync('git', args, { cwd: repo })
  git('init', '-q')
  fs.mkdirSync(path.join(repo, 'src'))
  fs.mkdirSync(path.join(repo, 'e2e/web'), { recursive: true })
  fs.writeFileSync(path.join(repo, 'src/a.ts'), 'export const a = 1\n')
  fs.writeFileSync(path.join(repo, 'readme.md'), 'hi\n')
  git('add', '-A')
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init')
  const key = (profile = 'local') =>
    child(
      sandbox(),
      `const W = await import(${JSON.stringify(WEB)})
       return W.webBuildKey(${JSON.stringify(profile)}, ${JSON.stringify(repo)})`
    )
  const base = await key()
  assert.equal(await key(), base)
  assert.notEqual(await key('beta'), base)
  fs.writeFileSync(path.join(repo, 'readme.md'), 'changed\n')
  fs.writeFileSync(path.join(repo, 'e2e/web/zz-x.spec.ts'), 'test\n')
  fs.writeFileSync(path.join(repo, 'src/a.test.ts'), 'test\n')
  assert.equal(await key(), base)
  fs.writeFileSync(path.join(repo, 'src/a.ts'), 'export const a = 2\n')
  const edited = await key()
  assert.notEqual(edited, base)
  fs.writeFileSync(path.join(repo, 'src/b.ts'), 'export const b = 1\n')
  const added = await key()
  assert.notEqual(added, edited)
  fs.writeFileSync(path.join(repo, '.env.local'), 'A=1\n')
  assert.notEqual(await key(), added)
})
