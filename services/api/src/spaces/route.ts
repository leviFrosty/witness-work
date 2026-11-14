import { Hono } from 'hono'
import type { AppContext, AppEnv, Environment } from '../types'
import { captureOperationFailure } from '../sentry'
import { bytesToBase64Url, bytesToHex, sha256Bytes } from '../crypto'
import {
  decodeB64u,
  fail,
  isPlainObject,
  ok,
  type BuddiesResult,
  type BuddiesRouteOp,
} from '../buddies/contracts'
import { isWebSocketUpgrade, readBodyText } from '../buddies/envelope'
import { buddiesInternalError } from '../buddies/errorResponse'
import {
  EDGE_RETRY_AFTER_SECONDS,
  allowBuddiesCaller,
  buddiesAccountCallerKey,
  buddiesCallerKey,
} from '../buddies/limits'
import { counterName } from '../accounts/rateCounter'
import {
  authenticateAccount,
  refuseInactiveAccount,
  type AccountAuth,
} from '../accounts/auth'
import { quotaName, refuseOverDailyQuota } from '../accounts/signed'
import {
  SPACES_ALWAYS_ALLOWED_OPS,
  SPACES_FIELD_PARSERS,
  SPACES_GUEST_OPS,
  SPACES_GUEST_PARSERS,
  SPACES_HEADERS,
  SPACES_LIMITS,
  SPACES_LIVE_OP,
  SPACES_OPS,
  SPACES_SUSPENDED_REFUSED_OPS,
  encodeLiveMember,
  logSpacesLimitHit,
  parseLiveHeaders,
  spacesBodyLimit,
  spacesErrorResponse,
  spacesMemberId,
  type MemberFields,
  type SpacesErrorCode,
  type SpacesFields,
  type SpacesGuestFields,
  type SpacesGuestOp,
  type SpacesOp,
  type SpacesResult,
} from './contracts'
import type { CreateSpaceArgs, MemberAuth } from './spaceDO'
import {
  isSpacesEnabled,
  isSpacesGuestsEnabled,
  spacesMaxMembers,
} from './switches'
import { spacesGuestDocs, spacesLiveDocs, spacesOpDocs } from './openapi'

/**
 * `POST /spaces/v1/{op}` and the `GET /spaces/v1/live` socket: Shared
 * Spaces (witness-work ADR 0037, `docs/shared-cars-protocol.md` there), a
 * blind store of sealed records shared by up to 10 members, one `SharedSpace`
 * Durable Object per space. Shared Cars is built on it.
 *
 * Every request is bearer (witness-work ADR 0027): the session proves an
 * attested app and drives suspension and rate limits, but it's never
 * recorded against the space. Membership is shown by the member token in
 * the body (in the live upgrade, in `x-ww-space-token`); only its SHA-256
 * reaches the space, as only the join secret's does.
 *
 * Gates, in order: the kill switch (`spaces:enabled`; `leave`,
 * `member/remove`, and `delete` always work), the token, the account's
 * Buddies edge tier (`sync` and `live` read, `join` unsigned, the rest
 * write), suspension for the ops that reach other people (`create`, `put`,
 * `invite/create`, `join`), the body's size, its fields (for `create` and
 * `join`, that `memberId` matches `dhPub`), and for a `create` that would
 * make a space, the account's 20 spaces a rolling day. There's no Supporter
 * check.
 *
 * The guest ops (`guest/sync`, `guest/put`; witness-work ADR 0047) are
 * the exception: no session, a guest link's token in the body instead.
 * Gates, in order: both switches (`spaces:enabled`, `spaces:guests`), 120
 * requests a minute per network (`SPACES_GUEST_LIMITER`, keyed by an HMAC
 * of the IP, never the IP), the body (64 KiB) and its fields; only then
 * does a space wake, and it checks the link and its own limits.
 *
 * Privacy: every id and secret travels in the body (or the live upgrade's
 * headers), never the URL, and nothing here logs or reports a body, header,
 * token, key, id, IP, or blob. A failure reaches Sentry as `spaces/<op>`
 * alone. Errors are the shared `{ ok: false, error, code }`.
 */

/** The Buddies edge tier each op counts against, named by a Buddies op of it. */
const EDGE_TIER_OP: Record<SpacesOp | typeof SPACES_LIVE_OP, BuddiesRouteOp> = {
  create: 'event/put',
  sync: 'inbox/sync',
  put: 'event/put',
  'invite/create': 'event/put',
  'invite/delete': 'event/put',
  join: 'invite/claim',
  leave: 'event/put',
  'member/remove': 'event/put',
  rekey: 'event/put',
  delete: 'event/put',
  'member/scopes': 'event/put',
  'handoff/create': 'event/put',
  'handoff/end': 'event/put',
  'link/create': 'event/put',
  'link/end': 'event/put',
  'link/expiry': 'event/put',
  live: 'inbox/live',
}

const space = (env: Environment, spaceId: string) =>
  env.SHARED_SPACE.get(env.SHARED_SPACE.idFromName(spaceId))

const errorResponse = (
  error: SpacesErrorCode,
  retryAfterSeconds?: number
): Response => spacesErrorResponse(error, { retryAfterSeconds })

/** The space DO's answer as JSON, `{ ok: true, ...value }` or the error. */
const reply = <T extends object>(c: AppContext, result: SpacesResult<T>): Response =>
  result.ok
    ? c.json({ ok: true, ...result.value })
    : spacesErrorResponse(result.error, {
        retryAfterSeconds: result.retryAfterSeconds,
        reason: result.reason,
      })

const hashOf = async (bytes: Uint8Array): Promise<string> =>
  bytesToBase64Url(await sha256Bytes(bytes))

/** The tie-break's hash: lowercase hex SHA-256 of the sealed bytes the server holds. */
const blobHash = async (blob: string): Promise<string> =>
  bytesToHex(await sha256Bytes(decodeB64u(blob) ?? new Uint8Array()))

/** A member op's credentials as the space DO takes them: the token hashed. */
const memberAuth = async (fields: MemberFields): Promise<MemberAuth> => ({
  spaceId: fields.spaceId,
  memberId: fields.memberId,
  tokenHash: await hashOf(fields.token),
})

type Admission =
  | { ok: true; account: AccountAuth }
  | { ok: false; response: Response }

/**
 * The session's account, counted against the op's edge tier (keyed on a
 * hash of the account, never the space), and refused when suspended for
 * the ops that reach other people (cached up to 30 s per isolate).
 */
const admitCaller = async (
  c: AppContext,
  op: SpacesOp | typeof SPACES_LIVE_OP
): Promise<Admission> => {
  const auth = await authenticateAccount(c)
  if (!auth.ok) return auth
  const key = await buddiesAccountCallerKey(auth.account.accountId)
  const allowed = await allowBuddiesCaller(
    c.env,
    EDGE_TIER_OP[op],
    key,
    (_, limit) => logSpacesLimitHit(`spaces/${op}`, limit)
  )
  if (!allowed)
    return {
      ok: false,
      response: errorResponse('rate_limited', EDGE_RETRY_AFTER_SECONDS),
    }
  if (op !== SPACES_LIVE_OP && SPACES_SUSPENDED_REFUSED_OPS.has(op)) {
    const refused = await refuseInactiveAccount(c.env, auth.account)
    if (refused) return refused
  }
  return { ok: true, account: auth.account }
}

/**
 * The JSON body, read under `limit` bytes (`readBodyText`): over it is
 * `too_large`; missing, not UTF-8, or not JSON is `bad_request`. Never
 * surfaces the parser's message, which quotes the input.
 */
const readJsonBody = async (
  request: Request,
  limit: number
): Promise<BuddiesResult<unknown>> => {
  const text = await readBodyText(request, limit)
  if (!text.ok) return text
  try {
    return ok(JSON.parse(text.value))
  } catch {
    return fail('bad_request')
  }
}

/** Whether `memberId` is the one `dhPub` commits to (`spacesMemberId`). */
const commits = async (fields: {
  spaceId: string
  memberId: string
  dhPub: string
}): Promise<boolean> =>
  fields.memberId === (await spacesMemberId(fields.spaceId, fields.dhPub))

type Runners = {
  [K in SpacesOp]: (
    c: AppContext,
    fields: SpacesFields[K],
    account: AccountAuth
  ) => Promise<Response>
}

const RUNNERS: Runners = {
  create: async (c, fields, account) => {
    if (!(await commits(fields))) return errorResponse('bad_request')
    const args: CreateSpaceArgs = fields
    const stub = space(c.env, fields.spaceId)
    // An id that exists or existed is answered without counting against the
    // quota, so a retried create (a lost answer) doesn't count twice. Two
    // racing first tries can both count; the quota is a counter, not a list.
    const existing = await stub.existingCreate(args)
    if (existing) return reply(c, existing)
    const refused = await refuseOverDailyQuota(
      c.env,
      await quotaName('space-create', account.accountId),
      SPACES_LIMITS.spacesPerDay,
      'spaces/create',
      'spacesPerDay',
      logSpacesLimitHit
    )
    if (refused) return refused
    return reply(c, await stub.create(args))
  },
  sync: async (c, fields) =>
    reply(
      c,
      await space(c.env, fields.spaceId).sync({
        ...(await memberAuth(fields)),
        since: fields.since,
        limit: fields.limit,
      })
    ),
  put: async (c, fields) => {
    const records = await Promise.all(
      fields.records.map(async (record) => ({
        ...record,
        blobHash: await blobHash(record.blob),
      }))
    )
    return reply(
      c,
      await space(c.env, fields.spaceId).put({
        ...(await memberAuth(fields)),
        records,
      })
    )
  },
  'invite/create': async (c, fields) =>
    reply(
      c,
      await space(c.env, fields.spaceId).createInvite({
        ...(await memberAuth(fields)),
        inviteId: fields.inviteId,
        joinVerifier: fields.joinVerifier,
        expiresAt: fields.expiresAt,
        epoch: fields.epoch,
        maxMembers: await spacesMaxMembers(c.env),
        scopes: fields.scopes,
        handoff: fields.handoff,
      })
    ),
  'invite/delete': async (c, fields) =>
    reply(
      c,
      await space(c.env, fields.spaceId).deleteInvite({
        ...(await memberAuth(fields)),
        inviteId: fields.inviteId,
      })
    ),
  join: async (c, fields) => {
    if (!(await commits(fields))) return errorResponse('bad_request')
    return reply(
      c,
      // Only the secret's hash crosses into the DO; it's compared in constant time there.
      await space(c.env, fields.spaceId).join({
        spaceId: fields.spaceId,
        inviteId: fields.inviteId,
        joinHash: await hashOf(fields.joinSecret),
        epoch: fields.epoch,
        memberId: fields.memberId,
        dhPub: fields.dhPub,
        tokenHash: fields.tokenHash,
        wrap: fields.wrap,
        maxMembers: await spacesMaxMembers(c.env),
      })
    )
  },
  leave: async (c, fields) =>
    reply(c, await space(c.env, fields.spaceId).leave(await memberAuth(fields))),
  'member/remove': async (c, fields) =>
    reply(
      c,
      await space(c.env, fields.spaceId).removeMember({
        ...(await memberAuth(fields)),
        removeId: fields.removeId,
      })
    ),
  rekey: async (c, fields) =>
    reply(
      c,
      await space(c.env, fields.spaceId).rekey({
        ...(await memberAuth(fields)),
        epoch: fields.epoch,
        wraps: fields.wraps,
        link: { ...fields.link, blobHash: await blobHash(fields.link.blob) },
      })
    ),
  delete: async (c, fields) =>
    reply(
      c,
      await space(c.env, fields.spaceId).deleteSpace(await memberAuth(fields))
    ),
  'member/scopes': async (c, fields) =>
    reply(
      c,
      await space(c.env, fields.spaceId).setMemberScopes({
        ...(await memberAuth(fields)),
        target: fields.target,
        scopes: fields.scopes,
      })
    ),
  'handoff/create': async (c, fields) =>
    reply(
      c,
      await space(c.env, fields.spaceId).createHandoff({
        ...(await memberAuth(fields)),
        scopeId: fields.scopeId,
        target: fields.target,
      })
    ),
  'handoff/end': async (c, fields) =>
    reply(
      c,
      await space(c.env, fields.spaceId).endHandoff({
        ...(await memberAuth(fields)),
        scopeId: fields.scopeId,
      })
    ),
  'link/create': async (c, fields) =>
    reply(
      c,
      await space(c.env, fields.spaceId).createLink({
        ...(await memberAuth(fields)),
        linkId: fields.linkId,
        verifier: fields.verifier,
        scopes: fields.scopes,
        expiresAt: fields.expiresAt,
        epoch: fields.epoch,
      })
    ),
  'link/end': async (c, fields) =>
    reply(
      c,
      await space(c.env, fields.spaceId).endLink({
        ...(await memberAuth(fields)),
        linkId: fields.linkId,
      })
    ),
  'link/expiry': async (c, fields) =>
    reply(
      c,
      await space(c.env, fields.spaceId).setLinkExpiry({
        ...(await memberAuth(fields)),
        linkId: fields.linkId,
        expiresAt: fields.expiresAt,
      })
    ),
}

const runOp = <K extends SpacesOp>(
  op: K,
  c: AppContext,
  fields: SpacesFields[K],
  account: AccountAuth
): Promise<Response> => (RUNNERS[op] as Runners[K])(c, fields, account)

const handleSpacesOp = async (c: AppContext, op: SpacesOp): Promise<Response> => {
  try {
    if (!SPACES_ALWAYS_ALLOWED_OPS.has(op) && !(await isSpacesEnabled(c.env)))
      return errorResponse('disabled')
    const admission = await admitCaller(c, op)
    if (!admission.ok) return admission.response
    const body = await readJsonBody(c.req.raw, spacesBodyLimit(op))
    if (!body.ok) return errorResponse(body.error)
    if (!isPlainObject(body.value)) return errorResponse('bad_request')
    const fields = SPACES_FIELD_PARSERS[op](body.value, Date.now())
    if (!fields.ok) return errorResponse(fields.error)
    return await runOp(op, c, fields.value, admission.account)
  } catch (error) {
    // Report the op, never the request or the error's text: bodies hold ids,
    // tokens, and blobs, and the space DO's errors can quote them.
    console.error('spaces: request failed', { op })
    captureOperationFailure(error, `spaces/${op}`)
    return buddiesInternalError()
  }
}

/**
 * Upgrades to the space's live socket. A WebSocket upgrade has no body (and
 * ids never go in URLs), so the member rides in `x-ww-space-auth` and its
 * token in `x-ww-space-token`, names Cloudflare's logs redact. The Worker checks
 * both and hashes the token, then hands the space DO the verified member
 * and the member cap in `SPACES_HEADERS.member`, without the session's
 * `Authorization` or either client header (any client copy of the member
 * header is replaced). The DO checks the member and accepts the socket.
 */
const handleLive = async (c: AppContext): Promise<Response> => {
  try {
    if (!(await isSpacesEnabled(c.env))) return errorResponse('disabled')
    const admission = await admitCaller(c, SPACES_LIVE_OP)
    if (!admission.ok) return admission.response
    if (!isWebSocketUpgrade(c.req.raw)) return errorResponse('upgrade_required')
    const fields = parseLiveHeaders(
      c.req.header(SPACES_HEADERS.live) ?? null,
      c.req.header(SPACES_HEADERS.liveToken) ?? null
    )
    if (!fields) return errorResponse('bad_request')
    const member = await memberAuth(fields)
    const headers = new Headers(c.req.raw.headers)
    for (const name of ['authorization', SPACES_HEADERS.live, SPACES_HEADERS.liveToken])
      headers.delete(name)
    headers.set(
      SPACES_HEADERS.member,
      encodeLiveMember({ ...member, maxMembers: await spacesMaxMembers(c.env) })
    )
    return await space(c.env, member.spaceId).fetch(
      new Request(c.req.raw, { headers })
    )
  } catch (error) {
    console.error('spaces: request failed', { op: SPACES_LIVE_OP })
    captureOperationFailure(error, `spaces/${SPACES_LIVE_OP}`)
    return buddiesInternalError()
  }
}

type GuestRunners = {
  [K in SpacesGuestOp]: (
    c: AppContext,
    fields: SpacesGuestFields[K]
  ) => Promise<Response>
}

/** A guest op's link as the space DO takes it: the token hashed. */
const guestAuth = async (fields: SpacesGuestFields[SpacesGuestOp]) => ({
  spaceId: fields.spaceId,
  linkId: fields.linkId,
  verifier: await hashOf(fields.linkToken),
})

const GUEST_RUNNERS: GuestRunners = {
  'guest/sync': async (c, fields) =>
    reply(
      c,
      await space(c.env, fields.spaceId).guestSync({
        ...(await guestAuth(fields)),
        since: fields.since,
        limit: fields.limit,
      })
    ),
  'guest/put': async (c, fields) => {
    const records = await Promise.all(
      fields.records.map(async (record) => ({
        ...record,
        blobHash: await blobHash(record.blob),
      }))
    )
    return reply(
      c,
      await space(c.env, fields.spaceId).guestPut({
        ...(await guestAuth(fields)),
        records,
      })
    )
  },
}

const reportedGuestLimiterOutage = { value: false }

/**
 * Counts a guest request against its network's budget
 * (`SPACES_GUEST_LIMITER`), keyed by an HMAC of the client IP (IPv4, or
 * IPv6 by /64) under a key from `ACCOUNT_TICKET_SECRET`, never the IP: null
 * admits; 429 `rate_limited` over it. Without that secret the guest ops
 * can't key the limit, so they answer `disabled`. A limiter that fails lets
 * the request on (logged once per isolate), as Buddies' do: the space's
 * per-link limits still hold.
 */
const refuseGuestCaller = async (c: AppContext): Promise<Response | null> => {
  let key: string
  try {
    key = await counterName(
      c.env,
      'spaces-guest',
      buddiesCallerKey(c.req.header('CF-Connecting-IP'))
    )
  } catch {
    return errorResponse('disabled')
  }
  try {
    const { success } = await c.env.SPACES_GUEST_LIMITER.limit({ key })
    if (success) return null
  } catch {
    if (!reportedGuestLimiterOutage.value) {
      reportedGuestLimiterOutage.value = true
      console.warn('spaces: guest limiter unavailable; allowing')
    }
    return null
  }
  logSpacesLimitHit('spaces/guest', 'guestRequestsPerMinute')
  return errorResponse('rate_limited', EDGE_RETRY_AFTER_SECONDS)
}

const runGuestOp = <K extends SpacesGuestOp>(
  op: K,
  c: AppContext,
  fields: SpacesGuestFields[K]
): Promise<Response> => (GUEST_RUNNERS[op] as GuestRunners[K])(c, fields)

/**
 * `guest/sync` and `guest/put`: both switches, the network's limit, the
 * body, and only then the space (which checks the link, its own limits, and
 * each record). A request refused before the space never wakes it.
 */
const handleGuestOp = async (c: AppContext, op: SpacesGuestOp): Promise<Response> => {
  try {
    if (!(await isSpacesEnabled(c.env)) || !(await isSpacesGuestsEnabled(c.env)))
      return errorResponse('disabled')
    const refused = await refuseGuestCaller(c)
    if (refused) return refused
    const body = await readJsonBody(c.req.raw, SPACES_LIMITS.guestBodyBytes)
    if (!body.ok) return errorResponse(body.error)
    if (!isPlainObject(body.value)) return errorResponse('bad_request')
    const fields = SPACES_GUEST_PARSERS[op](body.value, Date.now())
    if (!fields.ok) return errorResponse(fields.error)
    return await runGuestOp(op, c, fields.value)
  } catch (error) {
    // The op alone: never the body, the link, its token, or the caller.
    console.error('spaces: request failed', { op })
    captureOperationFailure(error, `spaces/${op}`)
    return buddiesInternalError()
  }
}

/** Mounted at `/spaces/v1` by the Worker entry point. */
export const createSpacesRoutes = () => {
  const routes = new Hono<AppEnv>()
  for (const op of SPACES_OPS)
    routes.post(`/${op}`, spacesOpDocs[op], (c) => handleSpacesOp(c, op))
  for (const op of SPACES_GUEST_OPS)
    routes.post(`/${op}`, spacesGuestDocs[op], (c) => handleGuestOp(c, op))
  routes.get(`/${SPACES_LIVE_OP}`, spacesLiveDocs, handleLive)
  return routes
}
