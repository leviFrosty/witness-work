import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { reserveWebPort, runJob } from './jobs.mjs'

const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(
  /\/$/,
  ''
)
const STAMP = path.join(ROOT, '.verify/web-build.json')
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

export async function webTest(args = []) {
  const env = process.env
  const own = !env.E2E_HOST && !env.E2E_EXTERNAL
  const rest = args.filter((arg) => arg !== '--no-build')
  if (own && !args.includes('--no-build')) {
    const built = await webBuild([])
    if (built !== 0) return built
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
  return runJob({
    cls: 'web-test',
    cwd: ROOT,
    env: toolEnv(),
    argv,
    prepare: () => {
      if (!own || env.E2E_PORT) return {}
      const port = reserveWebPort()
      if (!port) throw new Error('No free web port in 8130-8159')
      log(`serving dist/ on 127.0.0.1:${port} for this run`)
      return { E2E_PORT: String(port) }
    },
  })
}

export async function webDev(args = []) {
  let port
  const status = await runJob({
    cls: 'web-dev',
    cwd: ROOT,
    env: toolEnv(),
    argv: ['node', 'scripts/web.mjs', 'start', ...args],
    prepare: () => {
      if (has(args, '--port')) return {}
      port = reserveWebPort()
      if (!port) throw new Error('No free web port in 8130-8159')
      log(
        `Expo web dev server on http://localhost:${port}; stop it as soon as the check is done`
      )
      return { WW_WEB_PORT: String(port) }
    },
  })
  return status
}
