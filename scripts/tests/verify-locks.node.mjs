// Machine-wide coordination in scripts/verify/leases.mjs: mutex, device
// leases with caps and a queue, reaping, old-harness locks, memory budget and
// build slots. Every case runs real child processes against a temp
// WW_VERIFY_HOME, so nothing touches ~/.ww-verify or any device.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'

const LEASES = new URL('../verify/leases.mjs', import.meta.url).href
const VERIFY = new URL('../verify/ww-verify.mjs', import.meta.url).href
const MONKEY = new URL('../verify/monkey.mjs', import.meta.url).href

const homes = []
after(() => {
  for (const home of homes) fs.rmSync(home, { recursive: true, force: true })
})

function sandbox(env = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'wwv-home-'))
  homes.push(home)
  const pool = path.join(home, 'pool.json')
  fs.writeFileSync(pool, '[]')
  return {
    home,
    pool,
    env: {
      ...process.env,
      WW_VERIFY_HOME: home,
      WW_VERIFY_MAX_IOS: '2',
      WW_VERIFY_MAX_BUILDS: '1',
      WW_VERIFY_LEASE_IDLE_MIN: '30',
      WW_VERIFY_MEMORY_BUDGET_GB: '100',
      ...env,
    },
    worktree(name) {
      const dir = path.join(home, 'worktrees', name)
      fs.mkdirSync(dir, { recursive: true })
      return dir
    },
    lockFiles() {
      const dir = path.join(home, 'locks')
      return fs.existsSync(dir)
        ? fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
        : []
    },
    writeLock(key, value) {
      fs.mkdirSync(path.join(home, 'locks'), { recursive: true })
      fs.writeFileSync(
        path.join(home, 'locks', `${key}.json`),
        JSON.stringify(value)
      )
    },
  }
}

/**
 * Runs `body` in a fresh node process with `L` = leases.mjs; returns its JSON
 * result.
 */
function child(box, body) {
  const code = `
    import fs from 'node:fs'
    import * as L from ${JSON.stringify(LEASES)}
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const POOL = ${JSON.stringify(box.pool)}
    const pool = () => JSON.parse(fs.readFileSync(POOL, 'utf8'))
    const create = (devices) => {
      const device = { key: 'dev-' + (devices.length + 1), id: 'id-' + (devices.length + 1), name: 'Device ' + (devices.length + 1) }
      fs.writeFileSync(POOL, JSON.stringify([...devices, device]))
      return device
    }
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

const claim = (worktree, waitMs = 0, platform = 'ios') => `
  const r = await L.claimLease(
    { worktree: ${JSON.stringify(worktree)}, platform: '${platform}', kind: 'iphone', pool, create },
    { waitMs: ${waitMs}, pollMs: 100 }
  )
  return r.lease ? { key: r.lease.key, port: r.lease.metroPort } : { wait: r.wait, position: r.position }
`

test('mutex serializes read-modify-write across processes', async () => {
  const box = sandbox()
  const counter = path.join(box.home, 'counter')
  fs.writeFileSync(counter, '0')
  await Promise.all(
    Array.from({ length: 6 }, () =>
      child(
        box,
        `for (let i = 0; i < 40; i++) L.withMutex(() => {
          const n = Number(fs.readFileSync(${JSON.stringify(counter)}, 'utf8'))
          fs.writeFileSync(${JSON.stringify(counter)}, String(n + 1))
        })`
      )
    )
  )
  assert.equal(fs.readFileSync(counter, 'utf8'), '240')
})

test('a mutex left by a dead process is broken', async () => {
  const box = sandbox()
  fs.mkdirSync(path.join(box.home, 'mutex'), { recursive: true })
  fs.writeFileSync(
    path.join(box.home, 'mutex', 'owner'),
    `999999 ${Date.now()} x`
  )
  const started = Date.now()
  assert.equal(await child(box, `return L.withMutex(() => 'ok')`), 'ok')
  assert.ok(Date.now() - started < 5000)
})

test('8 concurrent claimers for 2 slots: exactly 2 win and 2 devices exist', async () => {
  const box = sandbox()
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      child(box, claim(box.worktree(`wt-${i}`), 1500))
    )
  )
  const winners = results.filter((r) => r.key)
  assert.equal(winners.length, 2)
  assert.equal(new Set(winners.map((w) => w.key)).size, 2)
  assert.equal(new Set(winners.map((w) => w.port)).size, 2)
  for (const r of results.filter((r) => !r.key))
    assert.match(r.wait, /leases are held|queued behind/)
  assert.equal(JSON.parse(fs.readFileSync(box.pool, 'utf8')).length, 2)
  assert.equal(box.lockFiles().length, 2)
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(box.home, 'waiters.json'))),
    []
  )
})

test('waiters are served first-come when a lease is released', async () => {
  const box = sandbox()
  const holders = [box.worktree('a'), box.worktree('b')]
  for (const wt of holders) assert.ok((await child(box, claim(wt))).key)
  const first = child(box, claim(box.worktree('first'), 4000))
  await new Promise((r) => setTimeout(r, 700))
  const second = child(box, claim(box.worktree('second'), 2500))
  await new Promise((r) => setTimeout(r, 700))
  await child(box, `return L.release(${JSON.stringify(holders[0])}).length`)
  assert.ok((await first).key, 'first waiter gets the freed device')
  const late = await second
  assert.equal(late.key, undefined)
})

test('a worktree re-claiming gets its own lease back', async () => {
  const box = sandbox()
  const wt = box.worktree('same')
  const a = await child(box, claim(wt))
  const b = await child(box, claim(wt))
  assert.deepEqual(a, b)
})

test('expired heartbeats and deleted worktrees are reaped; fresh leases stay', async () => {
  const box = sandbox()
  const now = Date.now()
  const lease = (key, worktree, heartbeatAt) => ({
    key,
    worktree,
    platform: 'ios',
    kind: 'iphone',
    deviceId: key,
    deviceName: key,
    metroPort: 8090,
    createdAt: heartbeatAt,
    heartbeatAt,
    at: heartbeatAt,
  })
  box.writeLock('idle', lease('idle', box.worktree('idle'), now - 31 * 60_000))
  box.writeLock('gone', lease('gone', path.join(box.home, 'deleted'), now))
  box.writeLock(
    'fresh',
    lease('fresh', box.worktree('fresh'), now - 5 * 60_000)
  )
  const reaped = await child(
    box,
    `const seen = []
     await L.gc(async (l) => { seen.push(l.key) })
     return seen.sort()`
  )
  assert.deepEqual(reaped, ['gone', 'idle'])
  assert.deepEqual(box.lockFiles(), ['fresh.json'])
})

test('heartbeat keeps a lease alive and reports what is still held', async () => {
  const box = sandbox({ WW_VERIFY_LEASE_IDLE_MIN: '0.01' })
  const wt = box.worktree('beat')
  const { key } = await child(box, claim(wt))
  const held = await child(
    box,
    `await new Promise((r) => setTimeout(r, 300))
     const held = L.heartbeat(${JSON.stringify(wt)})
     const lease = L.readLeases().find((l) => l.key === held[0])
     return { held, expired: lease.expired }`
  )
  assert.deepEqual(held, { held: [key], expired: false })
})

test('old-harness locks stay held for 24 h and count toward the cap', async () => {
  const box = sandbox()
  fs.writeFileSync(
    box.pool,
    JSON.stringify([
      { key: 'dev-1', id: 'dev-1', name: 'Device 1' },
      { key: 'dev-2', id: 'dev-2', name: 'Device 2' },
    ])
  )
  box.writeLock('dev-1', {
    worktree: box.worktree('old'),
    at: Date.now() - 2 * 3600_000,
  })
  const mine = await child(box, claim(box.worktree('new')))
  assert.equal(mine.key, 'dev-2')
  const blocked = await child(box, claim(box.worktree('third')))
  assert.match(blocked.wait, /all 2 ios leases are held/)
  assert.equal(JSON.parse(fs.readFileSync(box.pool, 'utf8')).length, 2)
  box.writeLock('dev-1', {
    worktree: box.worktree('old'),
    at: Date.now() - 25 * 3600_000,
  })
  const reaped = await child(
    box,
    `return (await L.gc(async () => {})).map((l) => l.key)`
  )
  assert.deepEqual(reaped, ['dev-1'])
})

test('memory budget queues leases and builds; build slots are capped', async () => {
  const box = sandbox({
    WW_VERIFY_MEMORY_BUDGET_GB: '9',
    WW_VERIFY_EST_IOS_GB: '1.5',
    WW_VERIFY_EST_METRO_GB: '1',
    WW_VERIFY_EST_IOS_BUILD_GB: '6',
  })
  const a = box.worktree('a')
  assert.ok((await child(box, claim(a))).key)
  const b = box.worktree('b')
  assert.ok((await child(box, claim(b))).key) // 5 GB in use
  const build = (wt, pid) =>
    `return L.tryAcquireBuild({ worktree: ${JSON.stringify(wt)}, platform: 'ios', fingerprint: 'f', pid: ${pid} })`
  const overBudget = await child(box, build(a, process.pid))
  assert.match(overBudget.wait, /memory budget: 5 GB in use \+ 6 GB/)
  await child(box, `return L.release(${JSON.stringify(b)}).length`) // 2.5 GB
  assert.deepEqual(await child(box, build(a, process.pid)), { ok: true })
  const second = await child(box, build(b, process.pid + 1))
  assert.match(second.wait, /1 of 1 build slots busy/)
  const third = await child(box, claim(b))
  assert.match(third.wait, /memory budget: 8.5 GB in use \+ 2.5 GB > 9 GB/)
  await child(box, `L.releaseBuild(${process.pid}); return true`)
  assert.ok((await child(box, claim(b))).key)
})

test('a request larger than the whole budget fails fast', async () => {
  const box = sandbox({ WW_VERIFY_MEMORY_BUDGET_GB: '2' })
  const started = Date.now()
  const r = await child(box, claim(box.worktree('big'), 10_000))
  assert.match(r.wait, /needs 4 GB but WW_VERIFY_MEMORY_BUDGET_GB is 2/)
  assert.ok(Date.now() - started < 5000)
})

const buildsFile = (box) => path.join(box.home, 'active-builds.json')
const build = (pid) =>
  `return L.tryAcquireBuild({ worktree: 'w', platform: 'ios', fingerprint: 'f', pid: ${pid} })`

test('a build slot held by a dead or silent pid is free at once', async () => {
  const box = sandbox()
  const now = Date.now()
  // Dead pid, and a live pid (this runner, as if reused) that stopped beating.
  for (const holder of [
    { pid: 999999, startedAt: now, seenAt: now },
    { pid: process.pid, startedAt: now - 3600_000, seenAt: now - 10 * 60_000 },
  ]) {
    fs.writeFileSync(
      buildsFile(box),
      JSON.stringify([
        { ...holder, worktree: 'gone', platform: 'ios', fingerprint: 'x' },
      ])
    )
    assert.deepEqual(await child(box, build(process.pid + 1)), { ok: true })
    const left = JSON.parse(fs.readFileSync(buildsFile(box), 'utf8'))
    assert.deepEqual(
      left.map((b) => b.pid),
      [process.pid + 1]
    )
    fs.rmSync(buildsFile(box))
  }
})

test('a cached artifact never waits for a build slot', async () => {
  const box = sandbox()
  const now = Date.now()
  fs.writeFileSync(
    buildsFile(box),
    JSON.stringify([
      {
        pid: process.pid,
        worktree: 'other',
        platform: 'ios',
        fingerprint: 'x',
        startedAt: now,
        seenAt: now,
      },
    ])
  )
  const marker = path.join(box.home, 'cached')
  const started = Date.now()
  const result = await child(
    box,
    `let polls = 0
     return L.acquireBuild(
       { worktree: 'w', platform: 'android', fingerprint: 'f' },
       {
         waitMs: 20_000,
         pollMs: 100,
         onWait: () => polls++ === 2 && fs.writeFileSync(${JSON.stringify(marker)}, '1'),
         ready: () => fs.existsSync(${JSON.stringify(marker)}) && { path: 'cached.apk' },
       }
     )`
  )
  assert.deepEqual(result, { cached: { path: 'cached.apk' } })
  assert.ok(Date.now() - started < 5000)
  // Already cached before asking: no slot is taken at all.
  const instant = await child(
    box,
    `return L.acquireBuild({ worktree: 'w', platform: 'ios', fingerprint: 'f' },
       { waitMs: 20_000, ready: () => ({ path: 'cached.app' }) })`
  )
  assert.deepEqual(instant, { cached: { path: 'cached.app' } })
  assert.equal(JSON.parse(fs.readFileSync(buildsFile(box), 'utf8')).length, 1)
})

test('machines with 16 GB or less get the small policy; env vars win', async () => {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('WW_VERIFY_'))
  )
  const policy = async (extra) => {
    const box = sandbox()
    box.env = { ...env, WW_VERIFY_HOME: box.home, ...extra }
    return child(
      box,
      'return { config: L.CONFIG, policy: L.POLICY, ram: L.RAM_GB }'
    )
  }
  const small = await policy({ WW_VERIFY_RAM_GB: '16' })
  assert.deepEqual(
    {
      budget: small.config.budgetGb,
      ios: small.config.max.ios,
      android: small.config.max.android,
      builds: small.config.maxBuilds,
      estIos: small.config.est.ios,
      idle: small.config.idleMin,
    },
    { budget: 8, ios: 1, android: 1, builds: 1, estIos: 3.4, idle: 15 }
  )
  assert.ok(Object.values(small.policy).every((from) => from === 'auto'))
  const big = await policy({ WW_VERIFY_RAM_GB: '64' })
  assert.deepEqual(
    [big.config.budgetGb, big.config.max.android, big.config.idleMin],
    [45, 2, 30]
  )
  assert.equal(big.config.max.ios, 2)
  assert.equal(big.config.est.ios, 3.4)
  const overridden = await policy({
    WW_VERIFY_RAM_GB: '16',
    WW_VERIFY_MAX_ANDROID: '2',
    WW_VERIFY_MEMORY_BUDGET_GB: '11',
  })
  assert.equal(overridden.config.max.android, 2)
  assert.equal(overridden.config.budgetGb, 11)
  assert.equal(overridden.policy.WW_VERIFY_MAX_ANDROID, 'env')
  assert.equal(overridden.policy.WW_VERIFY_MEMORY_BUDGET_GB, 'env')
  assert.equal(overridden.policy.WW_VERIFY_LEASE_IDLE_MIN, 'auto')
})

test('only the development bundle id may be cached or installed', async () => {
  const box = sandbox()
  const app = (id) => {
    const dir = path.join(box.home, `${id}.app`)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'Info.plist'),
      `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${id}</string></dict></plist>`
    )
    return dir
  }
  const { assertDevArtifact } = await import(VERIFY)
  assert.doesNotThrow(() =>
    assertDevArtifact(app('com.leviwilkerson.jwtimedev'))
  )
  assert.throws(
    () => assertDevArtifact(app('com.leviwilkerson.jwtime')),
    /is com.leviwilkerson.jwtime, not com.leviwilkerson.jwtimedev; refusing/
  )
})

// The `up` ordering: resolve the artifact (cache, or build slot -> build ->
// cache) before leasing a device. Each child is one `up`.
const upLike = (box, worktree, cache, builds) => `
  const wt = ${JSON.stringify(worktree)}
  const CACHE = ${JSON.stringify(cache)}
  const holdsLease = () => L.readLeases().some((l) => l.worktree === wt)
  let waiterHeldLease = false
  const r = await L.acquireBuild(
    { worktree: wt, platform: 'ios', fingerprint: 'same' },
    {
      waitMs: 20_000,
      pollMs: 100,
      ready: () => fs.existsSync(CACHE) && { path: CACHE },
      onWait: () => { waiterHeldLease ||= holdsLease() },
    }
  )
  let seen = null
  if (r.ok) {
    // While building, the other up waits to build and holds no lease.
    for (let i = 0; i < 40 && !seen; i++) {
      const s = L.snapshot()
      if (s.buildWaiters.length) seen = { buildWaiters: s.buildWaiters.length, leases: s.leases.length }
      else await sleep(50)
    }
    await sleep(1000)
    fs.appendFileSync(${JSON.stringify(builds)}, 'x')
    fs.writeFileSync(CACHE, 'app')
    L.releaseBuild()
  }
  const c = await L.claimLease(
    { worktree: wt, platform: 'ios', kind: 'iphone', pool, create },
    { waitMs: 20_000, pollMs: 100 }
  )
  await sleep(500)
  L.release(wt)
  return { built: Boolean(r.ok), cached: Boolean(r.cached), lease: Boolean(c.lease), waiterHeldLease, seen }
`

for (const budget of ['9', '8'])
  test(`two same-fingerprint ups build once and never deadlock (budget ${budget}, 1 iOS)`, async () => {
    const box = sandbox({
      WW_VERIFY_MEMORY_BUDGET_GB: budget,
      WW_VERIFY_MAX_IOS: '1',
      WW_VERIFY_EST_IOS_GB: '3.4',
      WW_VERIFY_EST_METRO_GB: '0.6',
      WW_VERIFY_EST_IOS_BUILD_GB: '6',
    })
    const cache = path.join(box.home, 'cached.app')
    const builds = path.join(box.home, 'builds-run')
    const results = await Promise.all(
      ['w1', 'w2'].map((name) =>
        child(box, upLike(box, box.worktree(name), cache, builds))
      )
    )
    assert.equal(fs.readFileSync(builds, 'utf8'), 'x', 'exactly one build')
    assert.deepEqual(results.map((r) => [r.built, r.cached, r.lease]).sort(), [
      [false, true, true],
      [true, false, true],
    ])
    assert.ok(results.every((r) => !r.waiterHeldLease))
    assert.deepEqual(results.find((r) => r.built).seen, {
      buildWaiters: 1,
      leases: 0,
    })
    assert.equal(box.lockFiles().length, 0)
  })

test('a device claim yields to an earlier build that waits for memory', async () => {
  const box = sandbox({
    WW_VERIFY_MEMORY_BUDGET_GB: '8',
    WW_VERIFY_MAX_ANDROID: '1',
    WW_VERIFY_EST_IOS_GB: '3.4',
    WW_VERIFY_EST_ANDROID_GB: '3.2',
    WW_VERIFY_EST_METRO_GB: '0.6',
    WW_VERIFY_EST_ANDROID_BUILD_GB: '6.5',
  })
  const holder = box.worktree('holder')
  assert.ok((await child(box, claim(holder))).key) // 4 GB
  const builder = child(
    box,
    `return L.acquireBuild(
       { worktree: ${JSON.stringify(box.worktree('builder'))}, platform: 'android', fingerprint: 'f' },
       { waitMs: 3000, pollMs: 100 }
     ).then((r) => r.wait ?? 'ok')`
  )
  await new Promise((r) => setTimeout(r, 600))
  const late = await child(box, claim(box.worktree('late'), 0, 'android'))
  assert.match(late.wait, /yielding memory to an earlier android build/)
  assert.match(
    await builder,
    /memory budget: 4 GB in use \+ 6.5 GB build > 8 GB; held by ios lease holder/
  )
})

test('an orphaned build group is killed, its slot freed and its dirs removed', async () => {
  const box = sandbox()
  const wt = box.worktree('orphan')
  const dir = path.join(wt, '.verify/DerivedData')
  fs.mkdirSync(dir, { recursive: true })
  // A detached group running "from" the worktree, with a child in a process
  // group of its own (as Xcode runs its compilers), and an unrelated group.
  const group = spawn(
    '/bin/sh',
    ['-c', `perl -e 'setpgrp(0, 0); sleep 300' & sleep 300; echo ${wt}`],
    { detached: true, stdio: 'ignore' }
  )
  let compiler
  for (let i = 0; i < 50 && !compiler; i++) {
    await new Promise((r) => setTimeout(r, 100))
    compiler = spawnSync('pgrep', ['-P', String(group.pid), 'perl'], {
      encoding: 'utf8',
    }).stdout.trim()
  }
  assert.ok(compiler, 'the child in its own group started')
  const stranger = spawn('/bin/sh', ['-c', 'sleep 300; echo elsewhere'], {
    detached: true,
    stdio: 'ignore',
  })
  try {
    const now = Date.now()
    const entry = (pgid, worktree, dirs) => ({
      pid: 999999,
      pgid,
      worktree,
      platform: 'ios',
      fingerprint: 'f',
      dirs,
      startedAt: now,
      seenAt: now,
    })
    fs.writeFileSync(
      buildsFile(box),
      JSON.stringify([entry(group.pid, wt, [dir])])
    )
    const before = await child(box, build(process.pid))
    assert.match(before.wait, /1 of 1 build slots busy/)
    const reaped = await child(
      box,
      `return (await L.reapBuilds()).map((b) => b.pgid)`
    )
    assert.deepEqual(reaped, [group.pid])
    assert.throws(() => process.kill(-group.pid, 0), /ESRCH/)
    assert.throws(() => process.kill(Number(compiler), 0), /ESRCH/)
    assert.ok(!fs.existsSync(dir))
    assert.deepEqual(await child(box, build(process.pid)), { ok: true })
    // A live group that runs nothing from the worktree is never killed.
    fs.writeFileSync(
      buildsFile(box),
      JSON.stringify([entry(stranger.pid, wt, [])])
    )
    await child(box, `return (await L.reapBuilds()).length`)
    assert.equal(stranger.exitCode, null)
    assert.equal(stranger.signalCode, null)
  } finally {
    for (const p of [group, stranger])
      try {
        process.kill(-p.pid, 'SIGKILL')
      } catch {
        // gone
      }
  }
})

test('the install record is cleared before installing and set only after', async () => {
  const box = sandbox()
  const installs = path.join(box.home, 'installs.json')
  fs.writeFileSync(installs, JSON.stringify({ dev: { fingerprint: 'old' } }))
  const verify = (installHash) => `
    const V = await import(${JSON.stringify(VERIFY)})
    const read = () => JSON.parse(fs.readFileSync(${JSON.stringify(installs)}, 'utf8')).dev ?? null
    let during
    try {
      V.installRecorded('dev', { fingerprint: 'new', hash: 'h', artifact: 'a.app' }, {
        install: () => { during = read() },
        installedHash: () => ${JSON.stringify(installHash)},
        name: 'Device',
      })
    } catch (error) {
      return { during, after: read(), error: error.message }
    }
    return { during, after: read() }
  `
  const failed = await child(box, verify('other'))
  assert.equal(failed.during, null)
  assert.equal(failed.after, null)
  assert.match(failed.error, /does not run the binary just installed/)
  const ok = await child(box, verify('h'))
  assert.equal(ok.during, null)
  assert.equal(ok.after.fingerprint, 'new')
  assert.equal(ok.after.hash, 'h')
})

test('monkey: popups the app owns are its focus; other windows are not', async () => {
  const { androidFocus, focusIsOurs, isStuck } = await import(MONKEY)
  const app =
    'mFocusedApp=ActivityRecord{1a u0 com.leviwilkerson.jwtimedev/.MainActivity t9}'
  assert.ok(
    focusIsOurs(
      `mCurrentFocus=Window{2b u0 com.leviwilkerson.jwtimedev/com.leviwilkerson.jwtimedev.MainActivity}\n${app}`
    )
  )
  assert.ok(
    focusIsOurs(`mCurrentFocus=Window{3c u0 PopupWindow:4f3e2d1}\n${app}`)
  )
  assert.ok(focusIsOurs(`mCurrentFocus=null\n${app}`))
  assert.equal(
    androidFocus(`mCurrentFocus=Window{3c u0 PopupWindow:4f3e2d1}\n${app}`),
    'popup'
  )
  assert.ok(
    !focusIsOurs(`mCurrentFocus=Window{4d u0 NotificationShade}\n${app}`)
  )
  assert.ok(
    !focusIsOurs(
      'mCurrentFocus=Window{5e u0 com.google.android.apps.nexuslauncher/com.google.android.apps.nexuslauncher.NexusLauncherActivity}\nmFocusedApp=ActivityRecord{6f u0 com.google.android.apps.nexuslauncher/.NexusLauncherActivity t1}'
    )
  )
  assert.ok(
    !focusIsOurs(
      `mCurrentFocus=Window{7a u0 com.google.android.gms/com.google.android.location.settings.LocationOffWarningActivity}\n${app}`
    )
  )
  assert.ok(!isStuck(10, 40))
  assert.ok(isStuck(11, 40))
})

test('monkey: a run that cannot reach the app fails as stuck', async () => {
  const { runMonkey } = await import(MONKEY)
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wwv-monkey-'))
  homes.push(outDir)
  const launcher =
    'mCurrentFocus=Window{1 u0 com.google.android.apps.nexuslauncher/x.Launcher}\nmFocusedApp=ActivityRecord{2 u0 com.google.android.apps.nexuslauncher/x.Launcher t1}'
  const calls = []
  const { summary } = await runMonkey({
    platform: 'android',
    device: { id: 'emulator-0' },
    steps: 40,
    seed: 1,
    scenario: 'pioneer',
    eval: async () => ({ errors: 0 }),
    agentDevice: () => ({ stdout: '{}', stderr: '' }),
    shot: () => 'shot.png',
    sleep: async () => {},
    relaunch: async () => calls.push('relaunch'),
    run: (cmd, args) => {
      calls.push(args.join(' '))
      return { stdout: args.join(' ').includes('dumpsys') ? launcher : '' }
    },
    outDir,
    root: outDir,
  })
  assert.equal(summary.ok, false)
  assert.equal(summary.failure.kind, 'stuck')
  assert.equal(summary.actions, 0)
  assert.equal(summary.refocused, 11)
  assert.equal(calls[0], 'relaunch', 'each run starts from a relaunch')
  assert.ok(
    calls.some((c) => c.endsWith('input keyevent 4')),
    'stuck runs press back'
  )
})
