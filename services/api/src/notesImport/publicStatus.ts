import type { Environment } from '../types'
import { getNotesImportConfig } from './config'
import { getNotesImportStatus, type NotesImportStatusResponse } from './status'

const FRESHNESS_MS = 30_000
const completed = new WeakMap<
  Environment,
  {
    expiresAt: number
    status: NotesImportStatusResponse
  }
>()

/**
 * Public UI hints only. Enforcement calls getNotesImportStatus directly and
 * always rechecks the kill-switch. Environment identity isolates deployments
 * and bindings. Only completed data crosses requests: Workers I/O and pending
 * promises belong to the request that created them.
 */
export async function getPublicNotesImportStatus(
  env: Environment,
  waitUntil?: (promise: Promise<unknown>) => void,
): Promise<NotesImportStatusResponse> {
  const now = Date.now()
  const cached = completed.get(env)
  if (cached && now < cached.expiresAt) return cached.status

  const status = await getNotesImportStatus({
    kv: env.NOTES_KV,
    env,
    apiKey: env.OPENROUTER_API_KEY,
    config: getNotesImportConfig(env),
    waitUntil,
  })
  // Do not turn a transient fail-open response into a cached availability claim.
  if (!status.available || status.limits) {
    completed.set(env, { status, expiresAt: now + FRESHNESS_MS })
  }
  return status
}
