// Serves and deploys the web app's Worker (web/host, docs/web-hosting.md).
//
//   node scripts/web-host.mjs deploy <dev|beta|production> [--dry-run] [--prebuilt] [--preview]
//   node scripts/web-host.mjs serve [local|dev|beta|production] [--port 8788] [--ip 0.0.0.0]
//
// A web deploy is a release (ADR 0037 §4). dev serves only the integration
// branch's latest commit; production needs the user's SHIP-PROD-X.Y.Z keyword
// and a Cloudflare token read through the 1Password app, which a person
// approves. Never from CI.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isConfirmed, refusal } from './release-confirm.mjs'
import {
  buildSteps,
  checkExport,
  environments as profiles,
  listFiles,
  loadWebEnv,
  servedFiles,
} from './web.mjs'
import { headersFile } from '../web/host/src/headers.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
export { profiles }
// The web launch's integration branch; app-dev follows `main` once it lands.
export const INTEGRATION_BRANCH = 'feat/web-device-sign-in'
export const PRODUCTION_TOKEN_ITEM = 'WitnessWork web deploy (production)'
export const WRANGLER_CONFIG = 'web/host/wrangler.jsonc'
/** Written next to the export; records which profile and commit it holds. */
export const STAMP = '.ww-web-build.json'
const GENERATED = new Set([STAMP, '_headers', '.assetsignore'])
// Source maps go to error tracking, not the public origin; they also break
// the per-file limit on unminified builds.
const NOT_UPLOADED = ['*.map', STAMP]
const dist = path.join(root, 'dist')

const usage = [
  'Usage: web-host.mjs deploy <dev|beta|production> [--dry-run] [--prebuilt] [--preview]',
  '       web-host.mjs serve [local|dev|beta|production] [--port 8788] [--ip 0.0.0.0]',
].join('\n')

const short = (sha) => sha?.slice(0, 9) ?? 'missing'

const packageJson = () =>
  JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

/** The repository state the deploy gates check. */
export function gitState(cwd = root) {
  const git = (...args) => spawnSync('git', args, { cwd, encoding: 'utf8' })
  const status = git('status', '--porcelain')
  return {
    clean: status.status === 0 && !status.stdout.trim(),
    head: git('rev-parse', 'HEAD').stdout.trim(),
    integrationHead:
      git(
        'rev-parse',
        '--verify',
        '--quiet',
        `refs/remotes/origin/${INTEGRATION_BRANCH}`
      ).stdout.trim() || undefined,
    onMain:
      git('merge-base', '--is-ancestor', 'HEAD', 'origin/main').status === 0,
    tags: git('tag', '--points-at', 'HEAD').stdout.split('\n').filter(Boolean),
  }
}

export function wranglerArgs(target, { preview = false, commit } = {}) {
  return [
    ...(preview ? ['versions', 'upload'] : ['deploy']),
    '--config',
    WRANGLER_CONFIG,
    '--env',
    target,
    '--message',
    `web ${short(commit)}`,
  ]
}

/**
 * What a deploy would do, and why it can't. Throws for bad usage and for a
 * production deploy without the user's keyword, dry runs included; returns
 * every other refusal in `blocked`.
 */
export function deployPlan(
  target,
  args,
  { env = process.env, git, version = packageJson().version } = {}
) {
  const profile = profiles[target]
  if (!profile?.worker) throw new Error(usage)
  const options = { dryRun: false, prebuilt: false, preview: false }
  for (const arg of args) {
    if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--prebuilt') options.prebuilt = true
    else if (arg === '--preview') options.preview = true
    else throw new Error(`Unknown web deploy argument: ${arg}`)
  }
  if (target === 'production' && !isConfirmed(version, env.WW_RELEASE_CONFIRM))
    throw new Error(refusal(version))
  if (options.preview && target !== 'dev')
    throw new Error('Only dev uploads preview versions')
  const blocked = []
  if (!git.clean)
    blocked.push('Commit all changes first: web deploys ship committed code')
  // A preview version gets its own workers.dev URL and leaves app-dev alone.
  if (target === 'dev' && !options.preview && git.head !== git.integrationHead)
    blocked.push(
      `app-dev serves only the latest ${INTEGRATION_BRANCH}: deploy from a clean checkout of origin/${INTEGRATION_BRANCH} (HEAD ${short(git.head)}, origin ${short(git.integrationHead)})`
    )
  if (target === 'production') {
    if (!git.onMain) blocked.push('Production web code must be on origin/main')
    if (!git.tags.includes(`v${version}`))
      blocked.push(
        `Production deploys the release commit: tag v${version} must point at HEAD`
      )
  }
  return {
    target,
    worker: profile.worker,
    host: options.preview ? 'a preview URL on workers.dev' : profile.host,
    apiOrigin: profile.apiOrigin,
    csp: profile.csp,
    version,
    commit: git.head,
    ...options,
    build: options.prebuilt
      ? `dist/ as stamped (${target} at ${short(git.head)})`
      : `pnpm run web:build --env ${target}: ${buildSteps(target)
          .map((step) => step.name)
          .join(', then ')}`,
    credential:
      target === 'production'
        ? `"${PRODUCTION_TOKEN_ITEM}" through the 1Password app, approved on this Mac`
        : "wrangler's own login on this Mac",
    command: [
      'wrangler',
      ...wranglerArgs(target, { ...options, commit: git.head }),
    ],
    blocked,
  }
}

/**
 * How `op` reads the production Cloudflare token: through the 1Password app,
 * never the agents' service account, so a person approves each read and the
 * item can live in a vault the service account can't open.
 */
export function deployTokenRead(inherited = process.env) {
  const env = { ...inherited }
  delete env.OP_SERVICE_ACCOUNT_TOKEN
  return {
    args: [
      'item',
      'get',
      PRODUCTION_TOKEN_ITEM,
      '--fields',
      'credential',
      '--reveal',
    ],
    env,
  }
}

/** The environment wrangler runs with: the right credential and no other. */
export function wranglerEnv(target, inherited = process.env, token) {
  const env = { ...inherited }
  delete env.OP_SERVICE_ACCOUNT_TOKEN
  delete env.CLOUDFLARE_API_TOKEN
  delete env.CLOUDFLARE_API_KEY
  delete env.CLOUDFLARE_EMAIL
  if (target === 'production') {
    if (!token?.trim()) throw new Error('Production deploys need their token')
    env.CLOUDFLARE_API_TOKEN = token.trim()
  }
  return env
}

/** Sha256 of every file the export produced. */
export function fileDigests(dir) {
  const digests = {}
  for (const file of listFiles(dir))
    if (!GENERATED.has(file))
      digests[file] = crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(dir, file)))
        .digest('hex')
  return digests
}

export function writeStamp(dir, target, commit) {
  fs.writeFileSync(
    path.join(dir, STAMP),
    `${JSON.stringify({ target, commit, files: fileDigests(dir) }, null, 2)}\n`
  )
}

/** Refuses an export built for another profile or commit, or changed since. */
export function checkStamp(dir, target, commit) {
  let stamp
  try {
    stamp = JSON.parse(fs.readFileSync(path.join(dir, STAMP), 'utf8'))
  } catch {
    throw new Error(
      `dist/ has no build stamp; build it with pnpm web:deploy:${target} instead of --prebuilt`
    )
  }
  if (stamp.target !== target || stamp.commit !== commit)
    throw new Error(
      `dist/ holds ${stamp.target} at ${short(stamp.commit)}, not ${target} at ${short(commit)}`
    )
  const now = fileDigests(dir)
  const changed = [
    ...new Set([...Object.keys(now), ...Object.keys(stamp.files ?? {})]),
  ].filter((file) => now[file] !== stamp.files?.[file])
  if (changed.length)
    throw new Error(
      `dist/ changed since it was built: ${changed.slice(0, 5).join(', ')}`
    )
}

/** Writes the profile's `_headers` and what not to upload into the export. */
export function prepareAssets(dir, target) {
  const profile = profiles[target]
  if (!profile) throw new Error(`Unknown web profile ${target}`)
  if (!fs.existsSync(path.join(dir, 'index.html')))
    throw new Error('dist/index.html is missing; build the web app first')
  fs.writeFileSync(path.join(dir, '_headers'), headersFile(profile))
  fs.writeFileSync(
    path.join(dir, '.assetsignore'),
    `${NOT_UPLOADED.join('\n')}\n`
  )
}

/**
 * The profile's origins the build never mentions. The CSP allows exactly these,
 * so a build pointed elsewhere would have its requests reported or blocked.
 */
export function missingOrigins(dir, target) {
  const { apiOrigin, posthogOrigin } = profiles[target]
  const scripts = servedFiles(dir)
    .filter((file) => file.endsWith('.js'))
    .map((file) => fs.readFileSync(path.join(dir, file)))
  return [apiOrigin, posthogOrigin].filter(
    (origin) => !scripts.some((bytes) => bytes.includes(origin))
  )
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    ...options,
  })
  if (result.error) throw result.error
  return result.status ?? 1
}

const wrangler = path.join(root, 'node_modules/.bin/wrangler')

function readProductionToken() {
  const { args, env } = deployTokenRead()
  const read = spawnSync('op', args, {
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  const token = read.stdout?.trim()
  if (read.status !== 0 || !token)
    throw new Error(
      `Couldn't read "${PRODUCTION_TOKEN_ITEM}" through the 1Password app; approve the prompt on this Mac (see docs/web-hosting.md)`
    )
  return token
}

function deploy(target, args) {
  let git = gitState()
  let plan = deployPlan(target, args, { git })
  // A real deploy compares against origin as it is now; a dry run stays
  // offline and uses the last fetch.
  if (!plan.dryRun && (target === 'dev' || target === 'production')) {
    const fetched = spawnSync(
      'git',
      ['fetch', '--quiet', 'origin', INTEGRATION_BRANCH, 'main'],
      { cwd: root, stdio: 'inherit' }
    )
    if (fetched.status !== 0)
      throw new Error("Couldn't fetch origin to check what may deploy")
    git = gitState()
    plan = deployPlan(target, args, { git })
  }
  if (plan.dryRun && plan.prebuilt)
    try {
      checkStamp(dist, target, git.head)
    } catch (error) {
      plan.blocked.push(error.message)
    }
  if (plan.dryRun) console.log(JSON.stringify(plan, null, 2))
  if (plan.blocked.length) {
    console.error(plan.blocked.map((reason) => `refused: ${reason}`).join('\n'))
    process.exitCode = 1
    return
  }
  if (plan.dryRun) return
  if (plan.prebuilt) checkStamp(dist, target, git.head)
  else {
    if (run('pnpm', ['run', 'web:build', '--env', target]) !== 0)
      throw new Error(`The ${target} web build failed`)
    writeStamp(dist, target, git.head)
  }
  prepareAssets(dist, target)
  // web:build's own checks, again on what uploads: the host's limits, and no
  // value a web build mustn't carry, such as this checkout's dev API bypass.
  checkExport(dist, loadWebEnv(root, target).excluded)
  const missing = missingOrigins(dist, target)
  if (missing.length)
    throw new Error(
      `The ${target} build never calls ${missing.join(' or ')}, which its CSP expects; check its profile in config/web-environments.json`
    )
  const token = target === 'production' ? readProductionToken() : undefined
  const status = run(wrangler, wranglerArgs(target, { ...plan }), {
    env: wranglerEnv(target, process.env, token),
  })
  if (status !== 0) throw new Error(`wrangler exited with ${status}`)
  console.log(
    `WEB_RESULT target=${target} worker=${plan.worker} commit=${short(git.head)} status=${plan.preview ? 'preview' : 'deployed'}`
  )
}

function serve(args) {
  const target = args[0]?.startsWith('--') ? 'local' : (args.shift() ?? 'local')
  let port = '8788'
  // `0.0.0.0` lets a browser in a container reach it (e2e/web/README.md).
  let ip
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && /^\d+$/.test(args[i + 1] ?? ''))
      port = args[++i]
    else if (args[i] === '--ip' && /^[\d.:a-f]+$/i.test(args[i + 1] ?? ''))
      ip = args[++i]
    else throw new Error(usage)
  }
  if (!profiles[target]) throw new Error(usage)
  prepareAssets(dist, target)
  process.exitCode = run(wrangler, [
    'dev',
    '--config',
    WRANGLER_CONFIG,
    ...(target === 'local' ? [] : ['--env', target]),
    '--port',
    port,
    ...(ip ? ['--ip', ip] : []),
  ])
}

function main() {
  const [command, target, ...args] = process.argv.slice(2)
  if (command === 'deploy') deploy(target, args)
  else if (command === 'serve') serve([target, ...args].filter(Boolean))
  else throw new Error(usage)
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
