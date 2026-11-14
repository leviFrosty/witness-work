import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isConfirmed, refusal } from './release-confirm.mjs'
import {
  associationFiles,
  buildSteps,
  checkAssociationFiles,
  checkExport,
  environments as profiles,
  listFiles,
  loadWebEnv,
  servedFiles,
} from './web.mjs'
import { headersFile, holdingHeadersFile } from '../web/host/src/headers.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
export { profiles }

export const INTEGRATION_BRANCH = 'main'
export const PRODUCTION_TOKEN_ITEM = 'WitnessWork web deploy (production)'
export const WRANGLER_CONFIG = 'web/host/wrangler.jsonc'

export const WELL_KNOWN_CONFIG = 'web/host/wrangler.well-known.jsonc'

export const WELL_KNOWN_DIR = 'dist-well-known'

export const STAMP = '.ww-web-build.json'
const GENERATED = new Set([STAMP, '_headers', '.assetsignore'])

const NOT_UPLOADED = ['*.map', STAMP]
const dist = path.join(root, 'dist')

const usage = [
  'Usage: web-host.mjs deploy <beta|production> [--dry-run] [--prebuilt]',
  '       web-host.mjs deploy <beta|production> --well-known-only [--dry-run] [--replace-app]',
  '       web-host.mjs serve [local|beta|production] [--port 8788] [--ip 0.0.0.0]',
].join('\n')

const short = (sha) => sha?.slice(0, 9) ?? 'missing'

const packageJson = () =>
  JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

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
    onIntegration:
      git('merge-base', '--is-ancestor', 'HEAD', `origin/${INTEGRATION_BRANCH}`)
        .status === 0,
    tags: git('tag', '--points-at', 'HEAD').stdout.split('\n').filter(Boolean),
  }
}

export function wranglerArgs(target, { wellKnownOnly = false, commit } = {}) {
  return [
    'deploy',
    '--config',
    wellKnownOnly ? WELL_KNOWN_CONFIG : WRANGLER_CONFIG,
    '--env',
    target,
    '--message',
    `${wellKnownOnly ? 'well-known' : 'web'} ${short(commit)}`,
  ]
}

const APP_STORE = 'https://apps.apple.com/us/app/jw-time/id6469723047'
const GOOGLE_PLAY =
  'https://play.google.com/store/apps/details?id=com.leviwilkerson.jwtime'

export const HOLDING_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>WitnessWork</title>
</head>
<body>
<p>WitnessWork on the web is coming soon.</p>
<p>Get the app: <a href="${APP_STORE}">App Store</a> · <a href="${GOOGLE_PLAY}">Google Play</a></p>
</body>
</html>
`

export function wellKnownBundle(target) {
  return {
    ...associationFiles(target),
    'index.html': HOLDING_PAGE,
    _headers: holdingHeadersFile(profiles[target]),
  }
}

export const servesApp = ({ status, body } = {}) =>
  status >= 200 && status < 300 && body !== HOLDING_PAGE

export const listing = (files) =>
  Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, contents]) => ({
      file,
      bytes: Buffer.byteLength(contents),
      sha256: crypto.createHash('sha256').update(contents).digest('hex'),
    }))

export function writeWellKnownBundle(dir, target) {
  const files = wellKnownBundle(target)
  fs.rmSync(dir, { recursive: true, force: true })
  for (const [file, contents] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    fs.writeFileSync(path.join(dir, file), contents)
  }
  const written = Object.fromEntries(
    listFiles(dir).map((file) => [
      file,
      fs.readFileSync(path.join(dir, file), 'utf8'),
    ])
  )
  if (JSON.stringify(listing(written)) !== JSON.stringify(listing(files)))
    throw new Error(`${path.basename(dir)}/ isn't the holding bundle`)
  checkAssociationFiles(dir, target)
}

export function deployPlan(
  target,
  args,
  { env = process.env, git, version = packageJson().version } = {}
) {
  const profile = profiles[target]
  if (!profile?.worker) throw new Error(usage)
  const options = {
    dryRun: false,
    prebuilt: false,
    wellKnownOnly: false,
    replaceApp: false,
  }
  for (const arg of args) {
    if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--prebuilt') options.prebuilt = true
    else if (arg === '--well-known-only') options.wellKnownOnly = true
    else if (arg === '--replace-app') options.replaceApp = true
    else throw new Error(`Unknown web deploy argument: ${arg}`)
  }
  if (target === 'production' && !isConfirmed(version, env.WW_RELEASE_CONFIRM))
    throw new Error(refusal(version))
  if (options.wellKnownOnly && options.prebuilt)
    throw new Error(
      '--well-known-only builds its own bundle and deploys it to the host'
    )
  if (options.replaceApp && !options.wellKnownOnly)
    throw new Error('--replace-app goes with --well-known-only')
  const blocked = []
  if (!git.clean)
    blocked.push('Commit all changes first: web deploys ship committed code')

  if (options.wellKnownOnly && !git.onMain && !git.onIntegration)
    blocked.push(
      `The association files must have landed: deploy a commit on origin/main or origin/${INTEGRATION_BRANCH}`
    )
  if (target === 'production' && !options.wellKnownOnly) {
    if (!git.onMain) blocked.push('Production web code must be on origin/main')
    if (!git.tags.includes(`v${version}`))
      blocked.push(
        `Production deploys the release commit: tag v${version} must point at HEAD`
      )
  }
  return {
    target,
    worker: profile.worker,
    host: profile.host,
    apiOrigin: profile.apiOrigin,
    csp: profile.csp,
    version,
    commit: git.head,
    ...options,
    build: options.wellKnownOnly
      ? `${WELL_KNOWN_DIR}/: the ${target} association files, a holding page at /, and a 404 for everything else, with the Worker (web/host/src/worker.ts)`
      : options.prebuilt
        ? `dist/ as stamped (${target} at ${short(git.head)})`
        : `pnpm run web:build --env ${target}: ${buildSteps(target)
            .map((step) => step.name)
            .join(', then ')}`,
    ...(options.wellKnownOnly && {
      uploads: listing(wellKnownBundle(target)),
    }),
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

export function missingOrigins(dir, target) {
  const { apiOrigin, posthogOrigin, helpManifest, helpSearchOrigin } =
    profiles[target]
  const scripts = servedFiles(dir)
    .filter((file) => file.endsWith('.js'))
    .map((file) => fs.readFileSync(path.join(dir, file)))
  return [
    apiOrigin,
    posthogOrigin,
    new URL(helpManifest).origin,
    helpSearchOrigin,
  ].filter((origin) => !scripts.some((bytes) => bytes.includes(origin)))
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

async function deploy(target, args) {
  let git = gitState()
  let plan = deployPlan(target, args, { git })

  if (!plan.dryRun && (target === 'production' || plan.wellKnownOnly)) {
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
  if (plan.wellKnownOnly) return await deployWellKnown(target, plan, git)
  if (plan.prebuilt) checkStamp(dist, target, git.head)
  else {
    if (run('pnpm', ['run', 'web:build', '--env', target]) !== 0)
      throw new Error(`The ${target} web build failed`)
    writeStamp(dist, target, git.head)
  }
  prepareAssets(dist, target)
  checkAssociationFiles(dist, target)

  checkExport(dist, loadWebEnv(root, target).excluded, {
    serviceWorker: true,
  })
  const missing = missingOrigins(dist, target)
  if (missing.length)
    throw new Error(
      `The ${target} build never calls ${missing.join(' or ')}, which its CSP allows; check its profile in config/web-environments.json`
    )
  const token = target === 'production' ? readProductionToken() : undefined
  const status = run(wrangler, wranglerArgs(target, { ...plan }), {
    env: wranglerEnv(target, process.env, token),
  })
  if (status !== 0) throw new Error(`wrangler exited with ${status}`)
  console.log(
    `WEB_RESULT target=${target} worker=${plan.worker} commit=${short(git.head)} status=deployed`
  )
}

async function deployWellKnown(target, plan, git) {
  let answer
  try {
    const response = await fetch(`https://${plan.host}/`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    })
    answer = { status: response.status, body: await response.text() }
  } catch {}
  if (servesApp(answer) && !plan.replaceApp)
    throw new Error(
      `${plan.host} already serves the web app (${answer.status} at /), which --well-known-only would replace with the holding page; add --replace-app only if that's intended`
    )
  const dir = path.join(root, WELL_KNOWN_DIR)
  writeWellKnownBundle(dir, target)
  console.log(
    `Uploading to ${plan.worker} (${plan.host}), replacing what it serves:`
  )
  for (const { file, bytes, sha256 } of plan.uploads)
    console.log(`  ${file}  ${bytes} bytes  sha256 ${sha256}`)
  console.log('  the Worker, web/host/src/worker.ts')
  for (const [file, contents] of Object.entries(associationFiles(target)))
    console.log(`\n${file}:\n${contents}`)
  const token = target === 'production' ? readProductionToken() : undefined
  const status = run(wrangler, wranglerArgs(target, { ...plan }), {
    env: wranglerEnv(target, process.env, token),
  })
  if (status !== 0) throw new Error(`wrangler exited with ${status}`)
  console.log(
    `WEB_RESULT target=${target} worker=${plan.worker} commit=${short(git.head)} status=well-known-only`
  )
}

function serve(args) {
  const target = args[0]?.startsWith('--') ? 'local' : (args.shift() ?? 'local')
  let port = '8788'

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

async function main() {
  const [command, target, ...args] = process.argv.slice(2)
  if (command === 'deploy') await deploy(target, args)
  else if (command === 'serve') serve([target, ...args].filter(Boolean))
  else throw new Error(usage)
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
