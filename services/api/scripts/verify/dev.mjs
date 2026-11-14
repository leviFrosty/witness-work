#!/usr/bin/env node
/**
 * Isolated local ww-api for agent verification (see .agents/skills/verify-ww-api).
 *
 *   node scripts/verify/dev.mjs up [--persist-to <dir>] [--secrets-from <env file>] [--photo-limit-bytes <n>]
 *   node scripts/verify/dev.mjs doctor
 *   node scripts/verify/dev.mjs url
 *   node scripts/verify/dev.mjs kv <get|put|delete> <key> [value]
 *   node scripts/verify/dev.mjs down [--wipe]
 *
 * `up` runs `wrangler dev --env dev` on a free port in 8790-8799 with its own
 * inspector port, persistence dir, and a generated vars file holding synthetic
 * tokens. It never touches port 8787, `.wrangler/state`, or `.dev.vars`, and
 * `down` only kills the process group it started. No new dependencies.
 */

import { spawn, spawnSync, execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const VERIFY_DIR = join(ROOT, '.verify')
const STATE_PATH = join(VERIFY_DIR, 'state.json')
const LOG_PATH = join(VERIFY_DIR, 'wrangler.log')
const VARS_PATH = join(VERIFY_DIR, 'dev.vars.env')
const ARTIFACTS_DIR = join(VERIFY_DIR, 'artifacts')
const DEFAULT_PERSIST = join(VERIFY_DIR, 'wrangler-state')
const WRANGLER_BIN = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js')

const HTTP_PORTS = [8790, 8799]
const INSPECTOR_PORTS = [9240, 9259]
const FORBIDDEN_PORTS = new Set([8787, 9229])
const READY_TIMEOUT_MS = 90_000

/** Optional real credentials passed through when present (names only). */
const OPTIONAL_SECRETS = [
  'HERE_API_KEY',
  'OPENROUTER_API_KEY',
  'REVENUECAT_API_KEY',
  'APPLE_TEAM_ID',
  // Buddies Android pushes: FCM is plain HTTPS, so unlike APNs it works from
  // `wrangler dev`. Pass the key minified to one line (`jq -c`).
  'FCM_SERVICE_ACCOUNT_JSON',
  // Notes Import analytics. Point POSTHOG_HOST at a local catcher to inspect
  // events; the real project token would send test runs to production PostHog.
  'POSTHOG_PROJECT_TOKEN',
  'POSTHOG_HOST',
  // Account Supporter status (ADR 0029): point at a local fake RevenueCat
  // (`pnpm test:e2e` serves one there); development workers only.
  'REVENUECAT_API_URL',
  // MapKit JS tokens (POST /maps/v1/mapkit-tokens): a throwaway P-256 key is
  // enough locally (Apple never sees it). The PEM goes on one line with `\n`
  // escapes. Without these the route answers 503 maps_unconfigured.
  'MAPKIT_JS_PRIVATE_KEY',
  'MAPKIT_JS_KEY_ID',
  'MAPKIT_JS_ORIGINS',
  // Web sign-up's Turnstile secret. Unset, the local worker uses Cloudflare's
  // always-passing test secret; `2x0000000000000000000000000000000AA` always
  // fails and `3x0000000000000000000000000000000AA` answers "already spent".
  'TURNSTILE_SECRET_KEY',
]
/** Synthetic, verification-only Apple team id when none is provided. */
const SYNTHETIC_TEAM_ID = 'VERIFY0000'

const fail = (message, code = 1) => {
  console.error(`verify: ${message}`)
  process.exit(code)
}

const readState = () => {
  if (!existsSync(STATE_PATH)) return null
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8'))
  } catch {
    return null
  }
}

const isAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

const portIsFree = (port) =>
  new Promise((done) => {
    const server = createServer()
    server.once('error', () => done(false))
    server.listen({ port, host: '127.0.0.1', exclusive: true }, () =>
      server.close(() => done(true))
    )
  })

const pickPort = async ([from, to], exclude = new Set()) => {
  for (let port = from; port <= to; port++) {
    if (FORBIDDEN_PORTS.has(port) || exclude.has(port)) continue
    if (await portIsFree(port)) return port
  }
  fail(`no free port in ${from}-${to}`)
}

/** pid -> parent pid for every process, from `ps`. */
const processTable = () => {
  const out = execFileSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8' })
  const table = new Map()
  for (const line of out.split('\n')) {
    const [pid, ppid] = line.trim().split(/\s+/).map(Number)
    if (pid) table.set(pid, ppid)
  }
  return table
}

const descendants = (root) => {
  const table = processTable()
  const found = new Set([root])
  let grew = true
  while (grew) {
    grew = false
    for (const [pid, ppid] of table) {
      if (found.has(ppid) && !found.has(pid)) {
        found.add(pid)
        grew = true
      }
    }
  }
  return found
}

/** PIDs listening on a TCP port (empty when lsof is missing or nothing listens). */
const listeners = (port) => {
  const result = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
    encoding: 'utf8',
  })
  return (result.stdout ?? '')
    .split('\n')
    .map((line) => Number(line.trim()))
    .filter(Boolean)
}

const fetchJson = async (url, init = {}, timeoutMs = 5_000) => {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  const text = await response.text()
  let body = null
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  return { status: response.status, headers: response.headers, body }
}

const healthy = async (url) => {
  try {
    const { status, body } = await fetchJson(`${url}/health`, {}, 3_000)
    return status === 200 && body?.status === 'ok'
  } catch {
    return false
  }
}

const gitSha = () => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

const parseFlags = (args) => {
  const flags = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!arg.startsWith('--')) continue
    const [name, inline] = arg.slice(2).split('=', 2)
    if (inline !== undefined) flags[name] = inline
    else if (args[i + 1] && !args[i + 1].startsWith('--')) flags[name] = args[++i]
    else flags[name] = true
  }
  return flags
}

/** Reads KEY=value lines (dotenv subset) and keeps only allowlisted names. */
const readAllowlistedEnvFile = (path) => {
  const values = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (!match || !OPTIONAL_SECRETS.includes(match[1])) continue
    let value = match[2]
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1)
    if (value) values[match[1]] = value
  }
  return values
}

/**
 * Double-quoted, except JSON values (a service-account key), which go in
 * single quotes: dotenv reads those literally, keeping the JSON's own escapes.
 */
const quoteEnv = (value) => {
  const text = String(value)
  return text.includes('"') && !text.includes("'")
    ? `'${text}'`
    : JSON.stringify(text)
}

const writeVarsFile = (flags, previousTokens, vars = {}) => {
  const fromFile = flags['secrets-from']
    ? readAllowlistedEnvFile(resolve(String(flags['secrets-from'])))
    : {}
  const optional = {}
  for (const name of OPTIONAL_SECRETS) {
    const value = process.env[name] || fromFile[name]
    if (value) optional[name] = value
  }
  // Synthetic per-state tokens; reused across restarts (and from the persist
  // dir) so tests and persisted counts keep working.
  const tokens = {
    devBypass: `verify-bypass-${randomBytes(16).toString('hex')}`,
    admin: `verify-admin-${randomBytes(16).toString('hex')}`,
    // Signs session access tokens; tests get theirs from POST /accounts/v1/sessions.
    accountToken: `verify-account-token-${randomBytes(24).toString('hex')}`,
    // Signs browser live socket tickets (POST /accounts/v1/live/ticket).
    liveTicket: `verify-live-ticket-${randomBytes(24).toString('hex')}`,
    // The RevenueCat webhook's Authorization secret.
    revenueCatWebhook: `verify-revenuecat-${randomBytes(16).toString('hex')}`,
    // Passkey challenge and ticket MAC keys (ADR 0038).
    passkeyChallenge: `verify-passkey-challenge-${randomBytes(24).toString('hex')}`,
    accountTicket: `verify-account-ticket-${randomBytes(24).toString('hex')}`,
    ...previousTokens,
  }
  const lines = [
    '# Generated by scripts/verify/dev.mjs. Synthetic local-only values.',
    `NOTES_IMPORT_DEV_BYPASS_TOKEN=${quoteEnv(tokens.devBypass)}`,
    `ADMIN_API_TOKEN=${quoteEnv(tokens.admin)}`,
    `ACCOUNT_TOKEN_SECRET=${quoteEnv(tokens.accountToken)}`,
    `LIVE_TICKET_SECRET=${quoteEnv(tokens.liveTicket)}`,
    `REVENUECAT_WEBHOOK_AUTHORIZATION=${quoteEnv(tokens.revenueCatWebhook)}`,
    `PASSKEY_CHALLENGE_SECRET=${quoteEnv(tokens.passkeyChallenge)}`,
    `ACCOUNT_TICKET_SECRET=${quoteEnv(tokens.accountTicket)}`,
    `APPLE_TEAM_ID=${quoteEnv(optional.APPLE_TEAM_ID ?? SYNTHETIC_TEAM_ID)}`,
    ...OPTIONAL_SECRETS.filter((n) => n !== 'APPLE_TEAM_ID' && optional[n]).map(
      (name) => `${name}=${quoteEnv(optional[name])}`
    ),
    // Non-secret overrides of wrangler.toml vars (`up --photo-limit-bytes`).
    ...Object.entries(vars).map(([name, value]) => `${name}=${quoteEnv(value)}`),
  ]
  writeFileSync(VARS_PATH, `${lines.join('\n')}\n`, { mode: 0o600 })
  return {
    tokens,
    configured: Object.fromEntries(OPTIONAL_SECRETS.map((n) => [n, Boolean(optional[n])])),
    // Not a secret: where `pnpm test:e2e` serves its fake RevenueCat.
    revenueCatApiUrl: optional.REVENUECAT_API_URL ?? null,
  }
}

/** True only when `pid` is still the wrangler we launched (guards pid reuse). */
const isOurWrangler = (pid) => {
  if (!isAlive(pid)) return false
  const result = spawnSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' })
  return (result.stdout ?? '').includes(WRANGLER_BIN)
}

const killTree = async (pid) => {
  if (!isOurWrangler(pid)) return []
  const pids = [...descendants(pid)]
  try {
    process.kill(-pid, 'SIGTERM') // the detached process group we created
  } catch {
    // group already gone
  }
  for (const each of pids) {
    try {
      process.kill(each, 'SIGTERM')
    } catch {
      // already exited
    }
  }
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline && pids.some(isAlive)) {
    await new Promise((r) => setTimeout(r, 200))
  }
  for (const each of pids.filter(isAlive)) {
    try {
      process.kill(each, 'SIGKILL')
    } catch {
      // already exited
    }
  }
  return pids
}

/**
 * Workers this checkout's launcher started that the state file no longer
 * records. Two overlapping `up`s can each start one, and the later state file
 * hides the earlier worker, which then runs (watching files, using CPU) until
 * reboot. A launcher worker leads its own process group and reads this
 * checkout's vars file, so nothing else matches.
 */
const strayWorkers = (keep) => {
  const out = execFileSync('ps', ['-A', '-o', 'pid=,pgid=,command='], { encoding: 'utf8' })
  const strays = []
  for (const line of out.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)
    if (!match) continue
    const [pid, pgid] = [Number(match[1]), Number(match[2])]
    const command = match[3]
    if (pid === pgid && pid !== keep && command.includes(WRANGLER_BIN) && command.includes(VARS_PATH))
      strays.push(pid)
  }
  return strays
}

const stopStrayWorkers = async (keep) => {
  for (const pid of strayWorkers(keep)) {
    if ((await killTree(pid)).length) console.error(`verify: stopped stray worker pid ${pid} that no state file recorded`)
  }
}

const tailLog = (lines = 40) => {
  if (!existsSync(LOG_PATH)) return ''
  return readFileSync(LOG_PATH, 'utf8').split('\n').slice(-lines).join('\n')
}

/**
 * `--photo-limit-bytes <n>`: the worker's `SYNC_PHOTO_LIMIT_BYTES`, so an
 * account's photo storage fills after a few bytes (Cloud Sync's full state).
 * Not a secret; recorded in the state file.
 */
const photoLimitFlag = (flags) => {
  const value = flags['photo-limit-bytes']
  if (value === undefined) return null
  if (!/^[1-9]\d*$/.test(String(value)))
    fail('--photo-limit-bytes needs a positive integer')
  return String(value)
}

async function up(args) {
  const flags = parseFlags(args)
  const photoLimitBytes = photoLimitFlag(flags)
  const existing = readState()
  const sameVars =
    photoLimitBytes == null || photoLimitBytes === (existing?.photoLimitBytes ?? null)
  if (
    existing &&
    isOurWrangler(existing.pid) &&
    sameVars &&
    (await healthy(existing.url))
  ) {
    console.log(`verify: reusing running worker pid ${existing.pid} at ${existing.url}`)
    console.log(existing.url)
    return
  }
  if (existing && isOurWrangler(existing.pid)) {
    console.error(
      sameVars
        ? `verify: recorded pid ${existing.pid} is alive but unhealthy; restarting it`
        : `verify: restarting pid ${existing.pid} with --photo-limit-bytes ${photoLimitBytes}`
    )
    await killTree(existing.pid)
  }
  if (!existsSync(WRANGLER_BIN)) fail('wrangler is not installed; run `pnpm install --frozen-lockfile`')
  if (existsSync(join(ROOT, '.dev.vars')) || existsSync(join(ROOT, '.dev.vars.dev'))) {
    console.error(
      'verify: note: a .dev.vars file exists in this checkout; the verify launcher uses .verify/dev.vars.env instead'
    )
  }

  mkdirSync(ARTIFACTS_DIR, { recursive: true })
  const persistDir = flags['persist-to']
    ? isAbsolute(String(flags['persist-to']))
      ? String(flags['persist-to'])
      : resolve(ROOT, String(flags['persist-to']))
    : existing?.persistDir ?? DEFAULT_PERSIST
  mkdirSync(persistDir, { recursive: true })

  // The accounts database's migrations, into this run's local D1 (idempotent).
  const migrate = spawnSync(
    process.execPath,
    [WRANGLER_BIN, 'd1', 'migrations', 'apply', 'ww-accounts-dev', '--env', 'dev', '--local', '--persist-to', persistDir],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' } }
  )
  if (migrate.status !== 0) fail(`applying the accounts migrations failed:\n${migrate.stderr || migrate.stdout}`)

  await stopStrayWorkers()
  const port = await pickPort(HTTP_PORTS)
  const inspectorPort = await pickPort(INSPECTOR_PORTS)
  // The secrets that key persisted state (session MACs, challenge and
  // ticket keys, rate counter names) live with that state, so `down` and
  // `up --persist-to` the same dir finds it all again, as a deployed worker
  // with stable secrets would; `down --wipe` deletes them with it.
  const secretsPath = join(persistDir, 'verify-secrets.json')
  const persisted = existsSync(secretsPath)
    ? JSON.parse(readFileSync(secretsPath, 'utf8'))
    : {}
  const { tokens, configured, revenueCatApiUrl } = writeVarsFile(
    flags,
    { ...persisted, ...existing?.tokens },
    { ...(photoLimitBytes ? { SYNC_PHOTO_LIMIT_BYTES: photoLimitBytes } : {}) }
  )
  writeFileSync(secretsPath, `${JSON.stringify(tokens, null, 2)}\n`, { mode: 0o600 })

  const wranglerArgs = [
    WRANGLER_BIN,
    'dev',
    '--env',
    'dev',
    '--local',
    '--ip',
    '127.0.0.1',
    '--port',
    String(port),
    '--inspector-port',
    String(inspectorPort),
    '--persist-to',
    persistDir,
    '--env-file',
    VARS_PATH,
    '--show-interactive-dev-session=false',
    '--log-level',
    'info',
  ]
  const log = openSync(LOG_PATH, 'a')
  writeFileSync(log, `\n=== verify up ${new Date().toISOString()} port=${port}\n`)
  const child = spawn(process.execPath, wranglerArgs, {
    cwd: ROOT,
    detached: true, // own process group: `down` kills exactly this tree
    stdio: ['ignore', log, log],
    env: {
      ...process.env,
      // Keep real credentials out of the worker; only the vars file feeds it.
      CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false',
      WRANGLER_SEND_METRICS: 'false',
      NO_COLOR: '1',
      FORCE_COLOR: '0',
    },
  })
  child.unref()
  closeSync(log)

  const url = `http://127.0.0.1:${port}`
  const state = {
    pid: child.pid,
    port,
    inspectorPort,
    url,
    persistDir,
    startedAt: new Date().toISOString(),
    logPath: LOG_PATH,
    artifactsDir: ARTIFACTS_DIR,
    varsFile: VARS_PATH,
    root: ROOT,
    gitSha: gitSha(),
    env: 'dev',
    tokens,
    configured,
    revenueCatApiUrl,
    photoLimitBytes,
  }
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })

  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (!isAlive(child.pid)) {
      rmSync(STATE_PATH, { force: true })
      fail(`wrangler exited during startup. Last log lines:\n${tailLog()}`)
    }
    if (await healthy(url)) {
      console.log(`verify: worker ready (pid ${child.pid}, persist ${persistDir})`)
      console.log(url)
      return
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  await killTree(child.pid)
  rmSync(STATE_PATH, { force: true })
  fail(`worker not healthy after ${READY_TIMEOUT_MS / 1000}s. Last log lines:\n${tailLog()}`)
}

async function doctor() {
  const problems = []
  const ok = (line) => console.log(`ok    ${line}`)
  const bad = (line) => {
    problems.push(line)
    console.log(`FAIL  ${line}`)
  }

  const state = readState()
  if (!state) {
    bad(`no state file at ${STATE_PATH}; run \`node scripts/verify/dev.mjs up\``)
    return finishDoctor(problems)
  }
  ok(`state file ${STATE_PATH}`)
  if (state.root !== ROOT) bad(`state belongs to ${state.root}, not this checkout ${ROOT}`)
  else ok(`serves this checkout ${ROOT}`)

  if (!isOurWrangler(state.pid)) {
    bad(`recorded pid ${state.pid} is not our running wrangler; run \`up\` again`)
    return finishDoctor(problems)
  }
  ok(`pid ${state.pid} alive`)

  const owners = listeners(state.port)
  const tree = descendants(state.pid)
  if (owners.length === 0) bad(`nothing listens on port ${state.port}`)
  else if (!owners.every((pid) => tree.has(pid)))
    bad(`port ${state.port} is owned by pid(s) ${owners.join(',')}, not by our process tree`)
  else ok(`port ${state.port} owned by our process tree (${owners.join(',')})`)

  try {
    const health = await fetchJson(`${state.url}/health`)
    if (health.status === 200 && health.body?.status === 'ok')
      ok(`/health ok (versionId ${health.body.versionId ?? 'n/a'})`)
    else bad(`/health returned ${health.status}`)
  } catch (error) {
    bad(`/health unreachable: ${error.message}`)
  }

  const head = gitSha()
  if (state.gitSha && head && state.gitSha !== head)
    console.log(`warn  HEAD moved since up (${state.gitSha.slice(0, 7)} -> ${head.slice(0, 7)}); wrangler hot-reloads source, restart if bindings changed`)
  else ok(`git HEAD ${head?.slice(0, 7) ?? 'unknown'}`)

  try {
    // Unknown invite: `not_found` proves the relay is enabled; `disabled` means the kill switch is off.
    // The kill switch is checked first, so `upgrade_required` (dev's AUTH_LEGACY is off) proves it too.
    const probe = await fetchJson(`${state.url}/buddies/v1/invite/fetch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '198.51.100.1' },
      body: JSON.stringify({
        payload: Buffer.from(JSON.stringify({ inviteId: 'doctorProbe00000000000' })).toString('base64url'),
      }),
    })
    if (probe.status === 404 && probe.body?.error === 'not_found') ok('buddies relay enabled')
    else if (probe.status === 426) ok('buddies relay enabled (legacy auth off: `kv put auth:legacy on` re-allows it)')
    else if (probe.body?.error === 'disabled')
      bad('buddies disabled: KV buddies:enabled is not "true"; run `node scripts/verify/dev.mjs kv delete buddies:enabled`')
    else bad(`buddies probe returned ${probe.status} ${JSON.stringify(probe.body)}`)
  } catch (error) {
    bad(`buddies probe failed: ${error.message}`)
  }

  try {
    // Unknown blob: `not_found` proves photo blobs are on (BUDDIES_PHOTOS in dev) with a bucket bound.
    const zeros = Buffer.alloc(32).toString('base64url')
    const probe = await fetchJson(`${state.url}/buddies/v1/blob/get`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '198.51.100.3' },
      body: JSON.stringify({
        payload: Buffer.from(JSON.stringify({ inboxId: 'doctorProbe00000000000', blobId: zeros, token: zeros })).toString('base64url'),
      }),
    })
    if (probe.status === 404 && probe.body?.error === 'not_found') ok('buddies photos enabled')
    else if (probe.status === 426) ok('buddies photos enabled (legacy auth off)')
    else if (probe.body?.error === 'photos_disabled')
      bad('buddies photos disabled: KV buddies:photos is not "on"; run `node scripts/verify/dev.mjs kv delete buddies:photos`')
    else bad(`buddies photos probe returned ${probe.status} ${JSON.stringify(probe.body)}`)
  } catch (error) {
    bad(`buddies photos probe failed: ${error.message}`)
  }

  try {
    const verify = await fetchJson(`${state.url}/attestation/v1/verify`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ww-dev-bypass': state.tokens?.devBypass ?? '',
        'cf-connecting-ip': '198.51.100.2',
      },
      body: '{}',
    })
    if (verify.status === 200 && verify.body?.ok === true) ok('dev bypass configured (value hidden)')
    else bad(`dev bypass rejected: ${verify.status} (is APP_ATTEST_ENVIRONMENT=development?)`)
  } catch (error) {
    bad(`dev bypass probe failed: ${error.message}`)
  }

  try {
    // Unknown refresh token: `unauthorized` proves sessions are on; `disabled` means no ACCOUNT_TOKEN_SECRET.
    const probe = await fetchJson(`${state.url}/accounts/v1/sessions/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '198.51.100.4' },
      body: JSON.stringify({ refreshToken: Buffer.alloc(32).toString('base64url') }),
    })
    if (probe.status === 401 && probe.body?.error === 'unauthorized') ok('account sessions enabled')
    else if (probe.body?.error === 'disabled')
      bad('account sessions disabled: ACCOUNT_TOKEN_SECRET is missing; restart with `node scripts/verify/dev.mjs down && … up`')
    else bad(`account sessions probe returned ${probe.status} ${JSON.stringify(probe.body)}`)
  } catch (error) {
    bad(`account sessions probe failed: ${error.message}`)
  }

  try {
    // No token: `unauthorized` proves Shared Spaces is on; `disabled` means its kill switch is off.
    const probe = await fetchJson(`${state.url}/spaces/v1/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '198.51.100.5' },
      body: '{}',
    })
    if (probe.status === 401 && probe.body?.error === 'unauthorized') ok('shared spaces enabled')
    else if (probe.body?.error === 'disabled')
      bad('shared spaces disabled: KV spaces:enabled is not "true"; run `node scripts/verify/dev.mjs kv delete spaces:enabled`')
    else bad(`shared spaces probe returned ${probe.status} ${JSON.stringify(probe.body)}`)
  } catch (error) {
    bad(`shared spaces probe failed: ${error.message}`)
  }

  try {
    // A sign-in challenge: `disabled` means the passkey secrets or RP config are missing.
    const probe = await fetchJson(`${state.url}/accounts/v1/passkeys/challenge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '198.51.100.5' },
      body: JSON.stringify({ purpose: 'sign-in', rpId: 'localhost' }),
    })
    if (probe.status === 200 && probe.body?.options?.rpId === 'localhost') ok('passkeys enabled (RP IDs beta.app.witnesswork.app, localhost)')
    else if (probe.body?.error === 'disabled')
      bad('passkeys disabled: PASSKEY_CHALLENGE_SECRET / ACCOUNT_TICKET_SECRET missing; restart with `node scripts/verify/dev.mjs down && … up`')
    else bad(`passkeys probe returned ${probe.status} ${JSON.stringify(probe.body)}`)
  } catch (error) {
    bad(`passkeys probe failed: ${error.message}`)
  }

  try {
    // An empty approval open: 400 means the routes are on, 503 that they're off.
    const probe = await fetchJson(`${state.url}/accounts/v1/approval/open`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '198.51.100.6' },
      body: '{}',
    })
    if (probe.status === 400) ok('approvals enabled (approval/open validates)')
    else bad(`approval probe returned ${probe.status} ${JSON.stringify(probe.body)}`)
  } catch (error) {
    bad(`approval probe failed: ${error.message}`)
  }

  try {
    // Web sign-up's switch and Turnstile site key, as the web reads them.
    const config = await fetchJson(`${state.url}/app/v1/config`, { method: 'GET' })
    const web = config.body?.webSignup
    if (web?.enabled && web.turnstileSiteKey) ok(`web sign-up enabled (Turnstile site key ${web.turnstileSiteKey})`)
    else bad(`web sign-up off: ${JSON.stringify(web ?? config.body)} (KV accounts:web-signup, or Turnstile/passkey secrets missing)`)
  } catch (error) {
    bad(`web sign-up probe failed: ${error.message}`)
  }

  const configured = Object.entries(state.configured ?? {})
    .map(([name, on]) => `${name}=${on ? 'set' : 'unset'}`)
    .join(' ')
  ok(`optional credentials: ${configured || 'none'}`)
  ok(`photo storage limit: ${state.photoLimitBytes ? `${state.photoLimitBytes} bytes (--photo-limit-bytes)` : 'default'}`)
  ok(`url ${state.url}  log ${state.logPath}  artifacts ${state.artifactsDir}`)
  return finishDoctor(problems)
}

const finishDoctor = (problems) => {
  if (problems.length) {
    console.error(`verify: doctor found ${problems.length} problem(s)`)
    process.exit(1)
  }
  console.log('verify: doctor ok')
}

async function down(args) {
  const flags = parseFlags(args)
  const state = readState()
  if (!state) {
    console.log('verify: no recorded worker; nothing to stop')
  } else {
    const killed = await killTree(state.pid)
    rmSync(STATE_PATH, { force: true })
    console.log(
      killed.length
        ? `verify: stopped pid ${state.pid} and ${killed.length - 1} child process(es)`
        : `verify: recorded pid ${state.pid} is no longer our wrangler; state cleared`
    )
  }
  await stopStrayWorkers()
  rmSync(VARS_PATH, { force: true })
  if (flags.wipe) {
    const persistDir = state?.persistDir ?? DEFAULT_PERSIST
    rmSync(persistDir, { recursive: true, force: true })
    console.log(`verify: wiped ${persistDir}`)
  }
  console.log(`verify: kept logs ${LOG_PATH} and evidence ${ARTIFACTS_DIR}`)
}

function url() {
  const state = readState()
  if (!state) fail('no running worker; run `node scripts/verify/dev.mjs up` first')
  console.log(state.url)
}

function kv(args) {
  const [action, key, value] = args
  if (!['get', 'put', 'delete'].includes(action) || !key || (action === 'put' && value === undefined))
    fail('usage: dev.mjs kv <get|put|delete> <key> [value]')
  const persistDir = readState()?.persistDir ?? DEFAULT_PERSIST
  const result = spawnSync(
    process.execPath,
    [
      WRANGLER_BIN,
      'kv',
      'key',
      action,
      key,
      ...(action === 'put' ? [value] : []),
      '--binding',
      'NOTES_KV',
      '--env',
      'dev',
      '--local',
      '--persist-to',
      persistDir,
      ...(action === 'get' ? ['--text'] : []),
    ],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' } }
  )
  if (result.status !== 0) fail(`wrangler kv ${action} failed:\n${result.stderr || result.stdout}`)
  if (action === 'get') process.stdout.write(result.stdout)
  else console.log(`verify: kv ${action} ${key} ok`)
}

const [command, ...rest] = process.argv.slice(2)
const commands = { up, doctor, down, url, kv }
if (!commands[command]) {
  console.error('usage: node scripts/verify/dev.mjs <up|doctor|url|kv|down> [flags]')
  process.exit(2)
}
await commands[command](rest)
