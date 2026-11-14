import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isConfirmed, refusal } from './release-confirm.mjs'
import {
  INTEGRATION_BRANCH,
  PRODUCTION_TOKEN_ITEM,
  deployTokenRead,
  gitState,
  profiles,
  wranglerEnv,
} from './web-host.mjs'
import {
  FRAME_ENVIRONMENTS,
  appOriginsFor,
  frameHeadersFile,
} from '../web/maps-frame/src/headers.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
export const FRAME_DIR = path.join(root, 'web/maps-frame')
export const WRANGLER_CONFIG = 'web/maps-frame/wrangler.jsonc'
const dist = path.join(FRAME_DIR, 'dist')

const usage = [
  'Usage: web-maps.mjs build <beta|production> [--out <dir>]',
  '       web-maps.mjs deploy <beta|production> [--dry-run] [--preview]',
  '       web-maps.mjs serve [beta|production] [--port 8789]',
].join('\n')

const short = (sha) => sha?.slice(0, 9) ?? 'missing'

const packageVersion = () =>
  JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version

export function frameAppOrigins(target) {
  const environment = FRAME_ENVIRONMENTS[target]
  if (!environment) throw new Error(usage)
  return appOriginsFor(environment.origin, profiles)
}

export async function buildFrame(target, out = dist) {
  const origins = frameAppOrigins(target)
  const { build } = await import('esbuild')
  fs.rmSync(out, { recursive: true, force: true })
  fs.cpSync(path.join(FRAME_DIR, 'public'), out, { recursive: true })
  await build({
    entryPoints: [path.join(FRAME_DIR, 'src/frame.ts')],
    outfile: path.join(out, 'frame.js'),
    bundle: true,
    format: 'esm',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    define: { WW_MAPS_APP_ORIGINS: JSON.stringify(origins) },
    logLevel: 'warning',
  })
  fs.writeFileSync(path.join(out, '_headers'), frameHeadersFile(origins))
  return { out, origins }
}

export function wranglerArgs(target, { preview = false, commit } = {}) {
  return [
    ...(preview ? ['versions', 'upload'] : ['deploy']),
    '--config',
    WRANGLER_CONFIG,
    '--env',
    target,
    '--message',
    `maps ${short(commit)}`,
  ]
}

export function deployPlan(
  target,
  args,
  { env = process.env, git, version = packageVersion() } = {}
) {
  const environment = FRAME_ENVIRONMENTS[target]
  if (!environment) throw new Error(usage)
  const options = { dryRun: false, preview: false }
  for (const arg of args) {
    if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--preview') options.preview = true
    else throw new Error(`Unknown maps deploy argument: ${arg}`)
  }
  if (target === 'production' && !isConfirmed(version, env.WW_RELEASE_CONFIRM))
    throw new Error(refusal(version))
  if (options.preview && target !== 'beta')
    throw new Error('Only beta uploads preview versions')
  const blocked = []
  if (!git.clean)
    blocked.push('Commit all changes first: frame deploys ship committed code')
  if (target === 'beta' && !options.preview && git.head !== git.integrationHead)
    blocked.push(
      `maps-beta serves only the latest ${INTEGRATION_BRANCH}: deploy from a clean checkout of origin/${INTEGRATION_BRANCH} (HEAD ${short(git.head)}, origin ${short(git.integrationHead)})`
    )
  if (target === 'production') {
    if (!git.onMain)
      blocked.push('Production frame code must be on origin/main')
    if (!git.tags.includes(`v${version}`))
      blocked.push(
        `Production deploys the release commit: tag v${version} must point at HEAD`
      )
  }
  return {
    target,
    worker: environment.worker,
    host: options.preview
      ? 'a preview URL on workers.dev'
      : new URL(environment.origin).host,
    appOrigins: frameAppOrigins(target),
    version,
    commit: git.head,
    ...options,
    build: `node scripts/web-maps.mjs build ${target}`,
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
      `Couldn't read "${PRODUCTION_TOKEN_ITEM}" through the 1Password app; approve the prompt on this Mac (docs/web-hosting.md)`
    )
  return token
}

async function deploy(target, args) {
  let git = gitState()
  let plan = deployPlan(target, args, { git })
  if (!plan.dryRun) {
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
  if (plan.dryRun) console.log(JSON.stringify(plan, null, 2))
  if (plan.blocked.length) {
    console.error(plan.blocked.map((reason) => `refused: ${reason}`).join('\n'))
    process.exitCode = 1
    return
  }
  if (plan.dryRun) return
  await buildFrame(target)
  const token = target === 'production' ? readProductionToken() : undefined
  const status = run(wrangler, wranglerArgs(target, { ...plan }), {
    env: wranglerEnv(target, process.env, token),
  })
  if (status !== 0) throw new Error(`wrangler exited with ${status}`)
  console.log(
    `MAPS_RESULT target=${target} worker=${plan.worker} commit=${short(git.head)} status=${plan.preview ? 'preview' : 'deployed'}`
  )
}

async function serve(args) {
  const target = args[0]?.startsWith('--') ? 'beta' : (args.shift() ?? 'beta')
  let port = '8789'
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && /^\d+$/.test(args[i + 1] ?? ''))
      port = args[++i]
    else throw new Error(usage)
  }
  await buildFrame(target)
  process.exitCode = run(wrangler, [
    'dev',
    '--config',
    WRANGLER_CONFIG,
    '--port',
    port,
  ])
}

async function main() {
  const [command, target, ...args] = process.argv.slice(2)
  if (command === 'build') {
    let out = dist
    if (args[0] === '--out' && args[1]) out = path.resolve(args[1])
    else if (args.length) throw new Error(usage)
    const built = await buildFrame(target, out)
    console.log(
      `Built the ${target} maps frame in ${path.relative(root, built.out)} for ${built.origins.join(', ')}`
    )
  } else if (command === 'deploy') await deploy(target, args)
  else if (command === 'serve') await serve([target, ...args].filter(Boolean))
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
