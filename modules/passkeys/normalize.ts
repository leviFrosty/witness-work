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
