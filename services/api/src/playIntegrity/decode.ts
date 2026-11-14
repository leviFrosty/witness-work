import { z } from 'zod'
import { tokenPayloadSchema, type TokenPayload } from './verdict'

/**
 * Decodes a standard-request integrity token through Google's server API.
 * Standard tokens can only be decrypted by Google; the payload is never logged.
 */

const decodeResponseSchema = z.object({
  tokenPayloadExternal: tokenPayloadSchema,
})

export type DecodeResult =
  | { ok: true; payload: TokenPayload }
  /** Google rejected the token itself (malformed, wrong app, expired). */
  | { ok: false; kind: 'invalid_token'; status: number }
  /** Our credentials, quota, or Google's availability; never the client's fault. */
  | { ok: false; kind: 'unavailable'; status: number }

export const decodeIntegrityToken = async (args: {
  packageName: string
  integrityToken: string
  accessToken: string
  fetch: typeof fetch
}): Promise<DecodeResult> => {
  const response = await args.fetch(
    `https://playintegrity.googleapis.com/v1/${encodeURIComponent(args.packageName)}:decodeIntegrityToken`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ integrityToken: args.integrityToken }),
    }
  )
  if (!response.ok) {
    // 400 is INVALID_ARGUMENT: the token could not be decoded for this package.
    // 401/403/429/5xx are configuration, quota, or availability problems.
    return response.status === 400
      ? { ok: false, kind: 'invalid_token', status: response.status }
      : { ok: false, kind: 'unavailable', status: response.status }
  }
  const parsed = decodeResponseSchema.safeParse(
    await response.json().catch(() => null)
  )
  return parsed.success
    ? { ok: true, payload: parsed.data.tokenPayloadExternal }
    : { ok: false, kind: 'unavailable', status: response.status }
}
