/**
 * Puts both platforms' responses into one shape. Pure, so it's unit-tested
 * without an Expo runtime.
 */

/** Standard or padded base64, or base64url, as unpadded base64url. */
export const toUnpaddedB64u = (value: string): string =>
  value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

type PrfOutput = { enabled?: boolean; results?: { first: string } }

const normalizePrf = (prf: unknown): PrfOutput | null => {
  if (typeof prf !== 'object' || prf === null) return null
  const { enabled, results } = prf as { enabled?: unknown; results?: unknown }
  const out: PrfOutput = {}
  if (typeof enabled === 'boolean') out.enabled = enabled
  const first =
    typeof results === 'object' && results !== null
      ? (results as { first?: unknown }).first
      : undefined
  if (typeof first === 'string' && first.length > 0) {
    out.results = { first: toUnpaddedB64u(first) }
  }
  return Object.keys(out).length > 0 ? out : null
}

/**
 * A registration or authentication response JSON with `clientExtensionResults`
 * always present and its `prf` as `{ enabled?, results?: { first } }`, `first`
 * unpadded base64url. iOS builds that shape itself; Android's provider may pad,
 * add `second`, or leave `clientExtensionResults` out.
 */
export const normalizeResponseJson = (json: string): string => {
  const response = JSON.parse(json) as Record<string, unknown>
  const raw = response.clientExtensionResults
  const results =
    typeof raw === 'object' && raw !== null
      ? { ...(raw as Record<string, unknown>) }
      : {}
  const prf = normalizePrf(results.prf)
  if (prf) results.prf = prf
  else delete results.prf
  return JSON.stringify({ ...response, clientExtensionResults: results })
}
