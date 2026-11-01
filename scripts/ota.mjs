import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { loadLocalEnv, validateLocalEnv } from './with-local-env.mjs'
import { isConfirmed, refusal } from './release-confirm.mjs'
import { prepareHermesMaps } from './ota-source-maps.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const targets = JSON.parse(
  fs.readFileSync(new URL('../config/ota-environments.json', import.meta.url))
)

export function deploymentPlan(
  variant,
  platform,
  args,
  inherited = process.env
) {
  const target = targets[variant]
  if (!target || !['ios', 'android'].includes(platform))
    throw new Error(
      'Usage: ota.mjs <development|beta|production> <ios|android> [--dry-run] [--message text]'
    )
  let dryRun = false
  let message
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') dryRun = true
    else if (args[i] === '--message' && args[i + 1]) message = args[++i]
    else throw new Error(`Unknown OTA argument: ${args[i]}`)
  }
  const version = JSON.parse(
    fs.readFileSync(new URL('../package.json', import.meta.url))
  ).version
  if (
    !dryRun &&
    variant === 'production' &&
    !isConfirmed(version, inherited.WW_RELEASE_CONFIRM)
  )
    throw new Error(refusal(version))
  return {
    variant,
    platform,
    channel: target.channel,
    baseURL: target.baseURL,
    bucketName: target.bucketName,
    databaseId: target.databaseId,
    dryRun,
    message,
  }
}

export const signingKeyItem = (channel) =>
  `WitnessWork OTA signing (${channel})`

export function signingKeyRead(channel, inherited = process.env) {
  const env = { ...inherited }
  const args = ['item', 'get', signingKeyItem(channel)]
  if (channel === 'production') delete env.OP_SERVICE_ACCOUNT_TOKEN
  else args.push('--vault', 'Agents')
  args.push('--fields', 'notesPlain', '--format', 'json', '--reveal')
  return { args, env }
}

function withSigningKey(channel, run) {
  const { args, env } = signingKeyRead(channel)
  const read = spawnSync('op', args, {
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  let pem
  try {
    pem = JSON.parse(read.stdout).value?.trim()
  } catch {
    pem = undefined
  }
  if (read.status !== 0 || !pem?.startsWith('-----BEGIN '))
    throw new Error(
      channel === 'production'
        ? `Couldn't read "${signingKeyItem(channel)}" through the 1Password app; approve the prompt on this Mac (see docs/ota-updates.md)`
        : `Couldn't read "${signingKeyItem(channel)}" from the Agents vault`
    )
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-ota-key-'))

  const interrupted = () => (process.exitCode = 130)
  process.on('SIGINT', interrupted)
  process.on('SIGTERM', interrupted)
  try {
    const file = path.join(directory, 'private-key.pem')
    fs.writeFileSync(file, `${pem}\n`, { mode: 0o600 })
    return run(file)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
    process.off('SIGINT', interrupted)
    process.off('SIGTERM', interrupted)
  }
}

function main() {
  const [variant, platform, ...args] = process.argv.slice(2)
  const plan = deploymentPlan(variant, platform, args)
  if (plan.dryRun) {
    console.log(JSON.stringify(plan, null, 2))
    return
  }
  if (variant !== 'development') {
    const status = spawnSync('git', ['status', '--porcelain'], {
      cwd: root,
      encoding: 'utf8',
    })
    if (status.status !== 0 || status.stdout.trim())
      throw new Error(
        'Commit all changes before publishing Beta or production OTA code'
      )
  }
  if (variant === 'production') {
    const landed = spawnSync(
      'git',
      ['merge-base', '--is-ancestor', 'HEAD', 'origin/main'],
      { cwd: root }
    )
    if (landed.status !== 0)
      throw new Error('Production OTA code must be on origin/main')
  }
  const { env } = loadLocalEnv(root, variant)

  env.NODE_ENV = 'production'

  if (
    variant === 'development' &&
    platform === 'android' &&
    env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY?.startsWith('test_')
  )
    delete env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY
  validateLocalEnv(env, platform, { allowUnavailablePurchases: true })
  const worktrees = spawnSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: root,
    encoding: 'utf8',
  })
  const mainCheckout = worktrees.stdout?.match(/^worktree (.+)$/m)?.[1] ?? root
  const findPrivateFile = (relative) =>
    [root, mainCheckout]
      .map((directory) => path.join(directory, relative))
      .find((file) => fs.existsSync(file))
  const credentialsFile = findPrivateFile(
    `.env.hotupdater.${plan.channel}.local`
  )
  if (!credentialsFile)
    throw new Error('Missing OTA provider credentials; see docs/ota-updates.md')
  Object.assign(env, dotenv.parse(fs.readFileSync(credentialsFile)))
  for (const key of [
    'HOT_UPDATER_CLOUDFLARE_API_TOKEN',
    'HOT_UPDATER_R2_ACCESS_KEY_ID',
    'HOT_UPDATER_R2_SECRET_ACCESS_KEY',
    'EXPO_PUBLIC_HOT_UPDATER_API_KEY',
  ])
    if (!env[key]?.trim()) throw new Error(`${key} is missing for ${variant}`)
  if (env.HOT_UPDATER_API_KEY !== env.EXPO_PUBLIC_HOT_UPDATER_API_KEY)
    throw new Error(
      'The build client key does not match the selected update service'
    )
  env.WW_OTA_DEPLOY = '1'
  env.EXPO_PUBLIC_COMMIT_HASH = spawnSync(
    'git',
    ['rev-parse', '--short', 'HEAD'],
    { cwd: root, encoding: 'utf8' }
  ).stdout.trim()

  const result = withSigningKey(plan.channel, (signingKey) => {
    const signing = { ...env, HOT_UPDATER_SIGNING_KEY_PATH: signingKey }
    const fingerprint = spawnSync(
      process.execPath,
      [path.join(root, 'scripts/ota-fingerprint.mjs'), '--write'],
      { cwd: root, env: signing, stdio: 'inherit' }
    )
    if (fingerprint.error) throw fingerprint.error
    if (fingerprint.status !== 0)
      throw new Error('Could not prepare the selected environment fingerprint')
    return spawnSync(
      path.join(root, 'node_modules/.bin/hot-updater'),
      [
        'deploy',
        '--platform',
        platform,
        '--channel',
        plan.channel,
        '--bundle-output-path',
        'dist/hot-updater',
        ...(plan.message ? ['--message', plan.message] : []),
      ],
      { cwd: root, env: signing, stdio: 'inherit' }
    )
  })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
  if (result.status === 0 && env.POSTHOG_CLI_API_KEY?.trim()) {
    const output = path.join(root, '.hot-updater/output')
    fs.mkdirSync(output, { recursive: true })
    const maps = fs.mkdtempSync(path.join(output, 'source-maps-'))
    try {
      prepareHermesMaps(
        path.join(root, 'dist/hot-updater-build'),
        maps,
        platform
      )
      const upload = spawnSync(
        'posthog-cli',
        [
          'hermes',
          'upload',
          '--directory',
          maps,
          '--release-mode',
          'symbol-set',
          '--release-name',
          'witness-work',
          '--release-version',
          env.EXPO_PUBLIC_COMMIT_HASH,
        ],
        { cwd: root, env, stdio: 'inherit' }
      )
      if (upload.error || upload.status !== 0)
        throw new Error('PostHog source map upload failed')
    } catch {
      console.warn('OTA published, but PostHog source map upload failed')
    } finally {
      fs.rmSync(maps, { recursive: true, force: true })
    }
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main()
