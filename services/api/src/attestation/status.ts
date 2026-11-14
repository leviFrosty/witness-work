import type { Environment } from '../types'
import { attestationProviders, type AttestationProviders } from './providers'

/**
 * `GET /attestation/v1/status`: which attestation providers this worker
 * accepts, for opening account sessions (witness-work
 * `docs/scribe-ai-protocol.md` → Routes). `capabilities` is the same
 * `{ appAttest, playIntegrity? }` that `GET /notes-import/status` carries,
 * from the same builder; the app reads it here once Notes Import is gone.
 * `providers` is the same object under the name this route answered with
 * before, kept for builds that read it.
 */

export interface AttestationStatusResponse {
  ok: true
  capabilities: AttestationProviders
  /** @deprecated The same object as `capabilities`. */
  providers: AttestationProviders
}

const FRESHNESS_MS = 30_000
const cache = new WeakMap<Environment, { expiresAt: number; status: AttestationStatusResponse }>()

/** Config only, no I/O; reused per isolate for 30 s like the status it replaces. */
export const attestationStatus = (
  env: Environment,
  now: number = Date.now()
): AttestationStatusResponse => {
  const cached = cache.get(env)
  if (cached && now < cached.expiresAt) return cached.status
  const capabilities = attestationProviders(env)
  const status: AttestationStatusResponse = {
    ok: true,
    capabilities,
    providers: capabilities,
  }
  cache.set(env, { status, expiresAt: now + FRESHNESS_MS })
  return status
}
