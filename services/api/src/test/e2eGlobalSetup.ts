import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The local worker's `AUTH_LEGACY` (`[env.dev.vars]`, as Beta's) is `off`
 * (witness-work ADR 0038 §11), but production still serves the pre-session ways of
 * signing requests until its launch runbook turns them off, and these suites
 * keep covering them. So against the local launcher's worker, KV
 * `auth:legacy` is `on` for the run; the legacy-switch tests turn it off and
 * back on themselves. A deployed worker (`WW_API_URL`) is left alone.
 */
export default function setup(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
  if (process.env.WW_API_URL || !existsSync(join(root, '.verify', 'state.json'))) return
  const result = spawnSync(
    process.execPath,
    [join(root, 'scripts/verify/dev.mjs'), 'kv', 'put', 'auth:legacy', 'on'],
    { cwd: root, encoding: 'utf8' }
  )
  if (result.status !== 0) throw new Error(`kv put auth:legacy failed: ${result.stderr}`)
}
