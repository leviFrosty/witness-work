import type { AppContext, Environment } from '../types'
import { captureFailure } from '../sentry'
import { isPlainObject } from '../buddies/contracts'
import { buddiesErrorResponse } from '../buddies/errorResponse'
import { buddiesCallerKey } from '../buddies/limits'
import {
  ACCOUNT_LIMITS,
  approvalBlobTooLarge,
  parseApprovalBrowser,
  parseApprovalChannel,
  parseApprovalClaim,
  parseApprovalOpen,
  parseApprovalSend,
} from './contracts'
import { authenticateAccount, readPlainJson, type AccountAuth } from './auth'
import { guarded, refuseAtEdge, replyWith } from './signed'
import { counterName, refuseOverRateCounter } from './rateCounter'
import { recordActivity } from './activity'
import { accountsDb } from './store'
import { passkeyTokensReady } from './passkeyTokens'
import type { ApprovalLocation } from './approvalDO'

/**
 * Approving a browser from a phone (witness-work `docs/passkeys-protocol.md`,
 * "Approving a browser from a phone"): the browser, which has no account yet,
 * opens a channel and shows its QR code; a signed-in phone claims it, shows
 * the browser's hello and where it is, and sends the sealed account key; the
 * browser receives it with an `approval` ticket and opens its web session.
 * One `AccountApproval` Durable Object per channel relays it.
 *
 * Browser ops are plain JSON authorized by `browserToken` (`open` by nothing);
 * phone ops are Bearer requests of the claiming phone session. Web sessions
 * can't claim (`forbidden`).
 *
 * `approval/open` counts against the register edge tier and 60 per caller IP
 * a rolling hour; every other op against the read tier. `approval/send` logs
 * `device.approved` (the phone's session) once the channel took the key.
 *
 * The channel keeps the browser's coarse location from `request.cf` (city,
 * region, country, latitude, longitude) for its lifetime, never the IP;
 * `claim` answers the place and whether the phone is `far` from it.
 *
 * Privacy: nothing here logs or reports bodies, keys, tokens, account ids,
 * channel ids, or locations.
 */

const HOUR_MS = 60 * 60 * 1_000

const channel = (env: Environment, channelId: string) =>
  env.ACCOUNT_APPROVAL.get(env.ACCOUNT_APPROVAL.idFromName(channelId))

/** Accounts or tickets off answer `disabled`, then the edge tier. */
const precheck = async (
  c: AppContext,
  tier: 'inbox/register' | 'inbox/sync'
): Promise<Response | null> => {
  if (!c.env.ACCOUNTS_DB || !(await passkeyTokensReady(c.env)))
    return buddiesErrorResponse('disabled')
  return refuseAtEdge(c, tier)
}

const text = (value: unknown, max = 128): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.slice(0, max) : undefined

const coordinate = (value: unknown, limit: number): number | undefined => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return typeof value !== 'boolean' &&
    value != null &&
    value !== '' &&
    Number.isFinite(parsed) &&
    Math.abs(parsed) <= limit
    ? parsed
    : undefined
}

/** The request's coarse location from `request.cf`, each part when known. */
export const requestLocation = (c: AppContext): ApprovalLocation => {
  const cf = (c.req.raw as { cf?: Record<string, unknown> }).cf ?? {}
  const location: ApprovalLocation = {
    city: text(cf.city),
    region: text(cf.region),
    country: text(cf.country, 8),
    latitude: coordinate(cf.latitude, 90),
    longitude: coordinate(cf.longitude, 180),
  }
  return Object.fromEntries(
    Object.entries(location).filter(([, value]) => value !== undefined)
  ) as ApprovalLocation
}

/** 60 opens per caller IP a rolling hour; an outage admits. */
const refuseOverOpens = async (c: AppContext): Promise<Response | null> =>
  refuseOverRateCounter(
    c,
    await counterName(
      c.env,
      'approval-open',
      buddiesCallerKey(c.req.header('CF-Connecting-IP'))
    ),
    [{ key: 'opens', limit: ACCOUNT_LIMITS.approvalOpensPerHour, windowMs: HOUR_MS }],
    'approval/open',
    { limitName: 'opensPerHour', count: true }
  )

/** The phone's session: Bearer, live; a web session is `forbidden`. */
const phoneSession = async (
  c: AppContext
): Promise<{ account: AccountAuth } | { refusal: Response }> => {
  const auth = await authenticateAccount(c, { requireLiveSession: true })
  if (!auth.ok) return { refusal: auth.response }
  if (auth.account.platform === 'web') return { refusal: buddiesErrorResponse('forbidden') }
  return { account: auth.account }
}

const handleOpen = guarded('approval/open', async (c) => {
  const refused = await precheck(c, 'inbox/register')
  if (refused) return refused
  const body = await readPlainJson(c)
  if (approvalBlobTooLarge(body)) return buddiesErrorResponse('too_large')
  const request = parseApprovalOpen(body)
  if (!request) return buddiesErrorResponse('bad_request')
  const overOpens = await refuseOverOpens(c)
  if (overOpens) return overOpens
  return replyWith(
    c,
    await channel(c.env, request.channelId).open({ ...request, location: requestLocation(c) })
  )
})

const handleClaim = guarded('approval/claim', async (c) => {
  const refused = await precheck(c, 'inbox/sync')
  if (refused) return refused
  const phone = await phoneSession(c)
  if ('refusal' in phone) return phone.refusal
  const request = parseApprovalClaim(await readPlainJson(c))
  if (!request) return buddiesErrorResponse('bad_request')
  return replyWith(
    c,
    await channel(c.env, request.channelId).claim({
      ...request,
      accountId: phone.account.accountId,
      sessionId: phone.account.sessionId,
      location: requestLocation(c),
    })
  )
})

/** A body with `browserToken` is the browser's; otherwise the phone's (Bearer). */
const isBrowser = (body: unknown) => isPlainObject(body) && 'browserToken' in body

const handleStatus = guarded('approval/status', async (c) => {
  const refused = await precheck(c, 'inbox/sync')
  if (refused) return refused
  const body = await readPlainJson(c)
  if (isBrowser(body)) {
    const request = parseApprovalBrowser(body)
    if (!request) return buddiesErrorResponse('bad_request')
    return replyWith(c, await channel(c.env, request.channelId).statusForBrowser(request))
  }
  const phone = await phoneSession(c)
  if ('refusal' in phone) return phone.refusal
  const request = parseApprovalChannel(body)
  if (!request) return buddiesErrorResponse('bad_request')
  return replyWith(
    c,
    await channel(c.env, request.channelId).statusForSession(
      request.channelId,
      phone.account.sessionId
    )
  )
})

const handleSend = guarded('approval/send', async (c) => {
  const refused = await precheck(c, 'inbox/sync')
  if (refused) return refused
  const phone = await phoneSession(c)
  if ('refusal' in phone) return phone.refusal
  const body = await readPlainJson(c)
  if (approvalBlobTooLarge(body)) return buddiesErrorResponse('too_large')
  const request = parseApprovalSend(body)
  if (!request) return buddiesErrorResponse('bad_request')
  const { accountId, sessionId } = phone.account
  const result = await channel(c.env, request.channelId).send(
    request.channelId,
    sessionId,
    request.key
  )
  if (!result.ok) return replyWith(c, result)
  // The key has left: a failed entry is reported, never the send's answer.
  if (result.value.fresh)
    await recordActivity(accountsDb(c.env.ACCOUNTS_DB!), {
      accountId,
      kind: 'device.approved',
      sessionId,
    }).catch((error: unknown) => {
      console.error('accounts: activity write failed', { op: 'approval/send' })
      captureFailure(error, 'approval/send')
    })
  return c.json({ ok: true })
})

const handleReceive = guarded('approval/receive', async (c) => {
  const refused = await precheck(c, 'inbox/sync')
  if (refused) return refused
  const request = parseApprovalBrowser(await readPlainJson(c))
  if (!request) return buddiesErrorResponse('bad_request')
  return replyWith(c, await channel(c.env, request.channelId).receive(request))
})

const handleDone = guarded('approval/done', async (c) => {
  const refused = await precheck(c, 'inbox/sync')
  if (refused) return refused
  const request = parseApprovalBrowser(await readPlainJson(c))
  if (!request) return buddiesErrorResponse('bad_request')
  return replyWith(c, await channel(c.env, request.channelId).done(request))
})

const handleCancel = guarded('approval/cancel', async (c) => {
  const refused = await precheck(c, 'inbox/sync')
  if (refused) return refused
  const body = await readPlainJson(c)
  if (isBrowser(body)) {
    const request = parseApprovalBrowser(body)
    if (!request) return buddiesErrorResponse('bad_request')
    return replyWith(c, await channel(c.env, request.channelId).cancelByBrowser(request))
  }
  const phone = await phoneSession(c)
  if ('refusal' in phone) return phone.refusal
  const request = parseApprovalChannel(body)
  if (!request) return buddiesErrorResponse('bad_request')
  return replyWith(
    c,
    await channel(c.env, request.channelId).cancelBySession(
      request.channelId,
      phone.account.sessionId
    )
  )
})

export const approvalHandlers = {
  open: handleOpen,
  claim: handleClaim,
  status: handleStatus,
  send: handleSend,
  receive: handleReceive,
  done: handleDone,
  cancel: handleCancel,
}
