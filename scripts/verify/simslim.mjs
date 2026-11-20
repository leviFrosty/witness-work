import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

export const PROFILE = fileURLToPath(
  new URL('./simslim-profile.json', import.meta.url)
)
export const INSTALL = 'brew install mobai-app/tap/simslim'

const BOOT_TIMEOUT_MS = 10 * 60_000
const LIVE_TIMEOUT_MS = 3 * 60_000

export function simslimBin(env = process.env) {
  const setting = env.WW_VERIFY_SIMSLIM
  if (setting === '0') return null
  if (setting && setting !== '1') return fs.existsSync(setting) ? setting : null
  const found = ['/opt/homebrew/bin/simslim', '/usr/local/bin/simslim'].find(
    (p) => fs.existsSync(p)
  )
  if (found) return found
  const which = spawnSync('which', ['simslim'], { encoding: 'utf8' })
  return which.status === 0 ? which.stdout.trim() : null
}

export function parseServices(value) {
  if (value === undefined || value === false) return []
  if (value === true)
    throw new Error('--services needs a value, e.g. --services widgets,store')
  return [
    ...new Set(
      String(value)
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ]
}

function simslim(bin, args, timeout) {
  const result = spawnSync(bin, args, {
    encoding: 'utf8',
    timeout,
    maxBuffer: 16 * 1024 * 1024,
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  return {
    ok: result.status === 0,
    output,
    json: () => JSON.parse(result.stdout),
  }
}

function profiles(bin) {
  const result = simslim(bin, ['profiles', '--json'], LIVE_TIMEOUT_MS)
  if (!result.ok) throw new Error(`simslim profiles failed: ${result.output}`)
  return result.json()
}

export function unknownServices(bin, services) {
  const known = new Set(['all'])
  for (const category of profiles(bin)) {
    known.add(category.id)
    for (const label of category.labels ?? []) known.add(label)
  }
  return services.filter((id) => !known.has(id))
}

export function expandServices(bin, services) {
  return services.includes('all') ? profiles(bin).map((c) => c.id) : services
}

export const bootSlim = (bin, udid) =>
  simslim(bin, ['on', udid, '--profile', PROFILE], BOOT_TIMEOUT_MS)

export const matchesProfile = (bin, udid) =>
  simslim(bin, ['verify', udid, '--profile', PROFILE], LIVE_TIMEOUT_MS).ok

export const slimLive = (bin, udid) =>
  simslim(
    bin,
    ['on', udid, '--no-reboot', '--profile', PROFILE],
    BOOT_TIMEOUT_MS
  )

export const enableLive = (bin, udid, services) =>
  simslim(bin, ['enable', udid, services.join(',')], LIVE_TIMEOUT_MS)
