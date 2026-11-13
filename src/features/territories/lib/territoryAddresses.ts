import apis from '@/constants/apis'
import { HttpError } from '@/lib/http/request'
import { accountSessions } from '@/lib/serverAccount'
import { AccountSessionError } from '@/lib/serverAccount/session'
import type { Coordinate } from '@/types/contact'
import type { FoundAddress } from '@/features/territories/lib/houses'

export type AddressLookup =
  | { ok: true; addresses: FoundAddress[] }
  | { ok: false; reason: 'signedOut' | 'tooLarge' | 'busy' | 'failed' }

const TIMEOUT_MS = 65_000

const isAddress = (value: unknown): value is FoundAddress => {
  const entry = value as Record<string, unknown> | null
  return (
    typeof entry?.street === 'string' &&
    typeof entry.number === 'string' &&
    entry.street.trim().length > 0 &&
    entry.number.trim().length > 0
  )
}

export const readAddresses = (data: unknown): FoundAddress[] | null => {
  const body = data as Record<string, unknown> | null
  if (body?.ok !== true || !Array.isArray(body.addresses)) return null
  return body.addresses
    .filter(isAddress)
    .map(({ street, number }) => ({ street, number }))
}

export const lookupAddressReason = (
  error: unknown
): Extract<AddressLookup, { ok: false }>['reason'] => {
  if (error instanceof AccountSessionError)
    return error.failure === 'rateLimited' ? 'busy' : 'signedOut'
  if (error instanceof HttpError) {
    if (error.serverCode === 'area_too_large') return 'tooLarge'
    if (error.status === 429 || error.status === 503) return 'busy'
  }
  return 'failed'
}

export const lookupTerritoryAddresses = async (
  outline: readonly Coordinate[],
  signal?: AbortSignal
): Promise<AddressLookup> => {
  try {
    const { data } = await accountSessions.request<unknown>({
      url: apis.territoryAddresses,
      method: 'POST',
      json: {
        outline: outline.map(({ latitude, longitude }) => ({
          latitude,
          longitude,
        })),
      },
      timeoutMs: TIMEOUT_MS,
      signal,
    })
    const addresses = readAddresses(data)
    return addresses ? { ok: true, addresses } : { ok: false, reason: 'failed' }
  } catch (error) {
    return { ok: false, reason: lookupAddressReason(error) }
  }
}
