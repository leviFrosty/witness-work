import { timingSafeEqual } from '../crypto'
import { apiError } from '../errors'
import type { AppContext } from '../types'
import type { ResetUsageResult } from './meterDO'

/**
 * `POST /admin/scribe/reset` (`x-ww-admin-token`): sets an account's Scribe
 * AI windows back to unused, and its pages for the day. Missing
 * configuration and every auth failure are the same 404 as an unknown route.
 * The account id selects the meter; it's never logged or returned.
 */

const ACCOUNT_ID = /^[A-Za-z0-9_-]{8,64}$/

export interface ScribeResetMeter {
  resetUsage(now?: number): Promise<ResetUsageResult> | ResetUsageResult
}

export const handleScribeAdminReset = async (
  request: Request,
  dependencies: { adminToken: string | undefined; meterFor(accountId: string): ScribeResetMeter }
): Promise<Response> => {
  const expected = dependencies.adminToken
  const supplied = request.headers.get('x-ww-admin-token') ?? ''
  if (!expected || !timingSafeEqual(supplied, expected)) return apiError(404, 'not_found')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError(400, 'bad_request', { message: 'Invalid JSON' })
  }
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  // `meterId` is what `pnpm admin:reset-usage` sent to Notes Import's reset.
  const accountId = record.accountId ?? record.meterId
  if (typeof accountId !== 'string' || !ACCOUNT_ID.test(accountId))
    return apiError(400, 'bad_request', { message: 'Invalid accountId' })

  const result = await dependencies.meterFor(accountId).resetUsage()
  console.log(
    JSON.stringify({
      event: 'scribe_admin_reset',
      previous: result.previous,
    })
  )
  return Response.json({ ok: true, previous: result.previous })
}

export const handleScribeAdminResetRequest = (ctx: AppContext) =>
  handleScribeAdminReset(ctx.req.raw, {
    adminToken: ctx.env.ADMIN_API_TOKEN,
    meterFor: (accountId) =>
      ctx.env.SCRIBE_METER.get(ctx.env.SCRIBE_METER.idFromName(accountId)),
  })
