import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import {
  HOME as VERIFY_HOME,
  acquireBuild,
  releaseBuild,
  withMutex,
} from '../verify/leases.mjs'
import {
  ROOT,
  assertDevArtifact,
  buildNative,
  fail,
  log,
  readJson,
  removeBuildDirs,
  run,
  shutdownWarmDevice,
  waitLogger,
  writeJson,
} from '../verify/ww-verify.mjs'

export const BUILD_DIR = path.join(VERIFY_HOME, 'perf-builds')
const INDEX = path.join(BUILD_DIR, 'index.json')

function sourceDir(sha) {
  const name = `perf-${sha.slice(0, 12)}`
  if (process.env.WW_PERF_SOURCE_DIR)
    return path.join(process.env.WW_PERF_SOURCE_DIR, name)
  const main = run('git', ['worktree', 'list', '--porcelain'], {
    cwd: ROOT,
  }).stdout.match(/^worktree (.+)$/m)[1]
  return path.join(`${main}-worktrees`, name)
}
const KEEP = Number(process.env.WW_PERF_KEEP_BUILDS) || 6

const BUILD_VERSION = 2

const PROBE_FILE = 'src/app/dev-harness/perfSetup.ts'

export const API_PORT = Number(process.env.WW_PERF_API_PORT) || 8780
export const API_BASE = `http://127.0.0.1:${API_PORT}`

export function resolveSha(ref) {
  const result = run('git', ['rev-parse', '--verify', `${ref}^{commit}`], {
    cwd: ROOT,
    check: false,
  })
  if (result.status !== 0) fail(`Unknown ref ${ref}`)
  const sha = result.stdout.trim()
  const probe = run('git', ['cat-file', '-e', `${sha}:${PROBE_FILE}`], {
    cwd: ROOT,
    check: false,
  })
  if (probe.status !== 0)
    fail(
      `${ref} (${sha.slice(0, 12)}) has no ${PROBE_FILE}; profile a commit that contains scripts/perf's app-side setup (rebase it onto perf-profiling)`
    )
  return sha
}

export function sourceKey(sha) {
  const tree = run('git', ['ls-tree', '-r', sha], { cwd: ROOT }).stdout
  const relevant = tree
    .split('\n')
    .filter(
      (line) =>
        line &&
        !/\t(docs\/|scripts\/perf\/|scripts\/tests\/|.*\.md$)/.test(line)
    )
    .join('\n')
  return crypto.createHash('sha256').update(relevant).digest('hex').slice(0, 16)
}

const keys = new Map()
function cacheKey(platform, sha) {
  if (!keys.has(sha)) keys.set(sha, sourceKey(sha))
  return `${platform}-${keys.get(sha)}-v${BUILD_VERSION}`
}

export function cachedPerfBuild(platform, sha) {
  const entry = readJson(INDEX, {})[cacheKey(platform, sha)]
  return entry && fs.existsSync(entry.path) ? entry : null
}

function cache(platform, sha, artifact, details) {
  assertDevArtifact(artifact)
  fs.mkdirSync(BUILD_DIR, { recursive: true })
  const key = cacheKey(platform, sha)
  const target = path.join(
    BUILD_DIR,
    `${key}.${platform === 'ios' ? 'app' : 'apk'}`
  )
  const tmp = `${target}.tmp-${process.pid}`
  fs.rmSync(tmp, { recursive: true, force: true })
  run('ditto', [artifact, tmp])
  return withMutex(() => {
    fs.rmSync(target, { recursive: true, force: true })
    fs.renameSync(tmp, target)
    const index = readJson(INDEX, {})
    index[key] = {
      path: target,
      sha,
      platform,
      builtAt: Date.now(),
      ...details,
    }
    const stale = Object.entries(index)
      .filter(([, e]) => e.platform === platform)
      .sort((a, b) => b[1].builtAt - a[1].builtAt)
      .slice(KEEP)
    for (const [k, e] of stale) {
      fs.rmSync(e.path, { recursive: true, force: true })
      delete index[k]
    }
    writeJson(INDEX, index)
    return index[key]
  })
}

function sourceTree(sha) {
  const dir = sourceDir(sha)
  if (!fs.existsSync(path.join(dir, '.git'))) {
    fs.mkdirSync(path.dirname(dir), { recursive: true })
    run('git', ['worktree', 'prune'], { cwd: ROOT, check: false })
    log(`checking out ${sha.slice(0, 12)} into ${dir}`)
    run('git', ['worktree', 'add', '--detach', '--force', dir, sha], {
      cwd: ROOT,
    })
  }
  if (!fs.existsSync(path.join(dir, 'node_modules/.modules.yaml'))) {
    log(`installing dependencies in ${path.basename(dir)}`)
    run('pnpm', ['install', '--frozen-lockfile'], {
      cwd: dir,
      timeout: 15 * 60_000,
      env: { CI: '1', HUSKY: '0' },
    })
  }
  return dir
}

export function removeSourceTree(sha) {
  const dir = sourceDir(sha)
  if (!fs.existsSync(dir)) return
  run('git', ['worktree', 'remove', '--force', dir], {
    cwd: ROOT,
    check: false,
  })
  fs.rmSync(dir, { recursive: true, force: true })
}

export function probeEnv() {
  return {
    WW_PERF_PROBE: '1',
    WW_VERIFY_API_BASE_URL: API_BASE,
    WW_VERIFY_API_DEV_BYPASS: '',
  }
}

function bundleStats(dir, platform) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), `ww-perf-export-`))
  try {
    log(`exporting the ${platform} bundle for its sizes`)
    run(
      'pnpm',
      [
        'exec',
        'node',
        'scripts/with-local-env.mjs',
        'development',
        platform,
        '--',
        'expo',
        'export',
        '--platform',
        platform,
        '--output-dir',
        out,
        '--no-bytecode',
        '--source-maps',
        '--max-workers',
        process.env.WW_VERIFY_METRO_WORKERS || '2',
      ],
      { cwd: dir, timeout: 15 * 60_000 }
    )
    const jsDir = path.join(out, '_expo/static/js', platform)
    const files = fs.readdirSync(jsDir)
    const js = path.join(
      jsDir,
      files.find((f) => /\.(js|hbc)$/.test(f))
    )
    const map = files.find((f) => f.endsWith('.map'))
    const modules = map
      ? (readJson(path.join(jsDir, map), {}).sources?.length ?? null)
      : null
    const require = createRequire(path.join(dir, 'node_modules/react-native/'))
    const hermesc = path.join(
      path.dirname(require.resolve('hermes-compiler/package.json')),
      'hermesc/osx-bin/hermesc'
    )
    const hbc = path.join(out, 'bundle.hbc')
    run(hermesc, ['-O', '-emit-binary', '-out', hbc, js])
    return {
      jsBytes: fs.statSync(js).size,
      hbcBytes: fs.statSync(hbc).size,
      modules,
    }
  } finally {
    fs.rmSync(out, { recursive: true, force: true })
  }
}

export function embeddedBundleBytes(platform, artifact) {
  if (platform === 'ios') {
    const file = path.join(artifact, 'main.jsbundle')
    return fs.existsSync(file) ? fs.statSync(file).size : null
  }
  const listing = run('unzip', ['-lv', artifact], { check: false }).stdout
  const line = listing
    .split('\n')
    .find((l) => l.trim().endsWith('assets/index.android.bundle'))
  return line ? Number(line.trim().split(/\s+/)[0]) : null
}

export async function resolvePerfBuild(platform, sha, flags) {
  const cached = () => (flags.rebuild ? null : cachedPerfBuild(platform, sha))
  if (cached()) return cached()
  const dir = sourceTree(sha)
  const stats = flags['no-static'] ? null : bundleStats(dir, platform)
  const waitLog = waitLogger()
  const slot = await acquireBuild(
    { worktree: ROOT, platform, fingerprint: `perf-${sha.slice(0, 12)}` },
    {
      waitMs: Number(flags.wait ?? 60) * 60_000,
      ready: cached,
      shutdown: shutdownWarmDevice,
      onWait: (r) =>
        waitLog(
          `waiting to build ${platform} Release ${sha.slice(0, 12)} (#${r.position} of ${r.queued}): ${r.wait} (see wwv status)`
        ),
    }
  )
  if (slot.cached) return slot.cached
  if (!slot.ok) fail(`Could not start a ${platform} build: ${slot.wait}`)
  try {
    fs.mkdirSync(path.join(ROOT, '.verify'), { recursive: true })
    const artifact = await buildNative(platform, {
      root: dir,
      configuration: 'Release',
      logPath: path.join(ROOT, '.verify', `perf-build-${platform}.log`),
      env: probeEnv(),
    })
    return cache(platform, sha, artifact, {
      apiBase: API_BASE,
      static: stats && {
        ...stats,
        embeddedHbcBytes: embeddedBundleBytes(platform, artifact),
      },
    })
  } finally {
    releaseBuild()
    if (!flags['keep-build-dirs']) removeBuildDirs(platform, dir)
  }
}
