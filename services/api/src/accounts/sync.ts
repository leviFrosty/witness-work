import type { AppContext, Environment } from '../types'
import {
  bytesToBase64Url,
  bytesToHex,
  sha256Bytes,
  timingSafeEqual,
} from '../crypto'
import { RevenueCatError } from '../revenuecat'
import { captureFailure } from '../sentry'
import { isPlainObject } from '../buddies/contracts'
import {
  isWebSocketUpgrade,
  parseEnvelope,
  readBlobBody,
  readBodyText,
  readEnvelopeText,
} from '../buddies/envelope'
import {
  buddiesErrorResponse,
  buddiesInternalError,
} from '../buddies/errorResponse'
import {
  acceptLiveSubprotocol,
  forwardedLiveRequest,
  readBrowserLive,
} from '../liveSubprotocol'
import {
  authenticateAccount,
  readPlainJson,
  type AccountAuth,
  type AuthenticateAccountOptions,
  parseJsonOrNull,
} from './auth'
import { accountForKey, guarded, refuseAtEdge, verifyEnvelope } from './signed'
import { admitLiveTicket } from './liveTickets'
import { cachedSessionCapabilities, sessionStates } from './sessionStore'
import { accountSupporterStatus } from './supporter'
import { accountsDb, findKeyChangedAt } from './store'
import {
  SYNC_CHANGE_LIMITS,
  SYNC_ETAG_PATTERN,
  SYNC_HEADERS,
  SYNC_LIMITS,
  isSyncChangeId,
  isSyncSlotId,
  parseIfMatch,
  sealedChangeBytes,
  syncObjectKey,
} from './syncContracts'
import type { SyncCaller, SyncChangeFailure } from './syncDO'
import {
  entitlementForApp,
  isSyncChangesOn,
  isSyncPhotosOn,
  syncSwitches,
  type SyncEntitlement,
} from './syncSwitch'

/**
 * Cloud Sync (witness-work ADR 0030, `docs/accounts-protocol.md`, "Sync"):
 * each device of an account keeps one end-to-end encrypted snapshot in a
 * slot, and every device merges the others'. One `AccountSync` Durable
 * Object per account holds the slots' metadata and live sockets; R2
 * (`ACCOUNT_SYNC`) holds the ciphertext.
 *
 * Every route is bearer. `GET /sync` (the account's status), `sync/delete`,
 * and clearing the Cloud Sync request always work; `sync/put`, `sync/list`,
 * `sync/get`, the live socket, and setting the request need the kill switch
 * on (503 `disabled`) and an entitled account (403 `supporter_required`;
 * RevenueCat unreachable is 503 `unavailable`, never a "not a Supporter").
 * Everyone is entitled unless KV `sync:entitlement` says `supporter`
 * (witness-work ADR 0040), but only on a session that sent the
 * `sync-everyone` capability; other sessions keep the Supporter rule
 * (ADR 0040 §2). A suspended account keeps syncing: sync never
 * reaches another person.
 *
 * Record changes (witness-work ADR 0060): `sync/changes/put` stores one small
 * sealed change, `sync/changes/list` answers what a device missed since its
 * cursor, and `sync/changes/reseal` moves a change to a new account key.
 * They need the same switch and entitlement, and KV `sync:changes` on (503
 * `changes_disabled`). Put and list read no D1 and no R2: the token carries
 * the session's capabilities, and the account's Durable Object refuses an
 * ended session and a token from before a key change.
 *
 * `sync/put`, `sync/changes/put`, and `sync/changes/reseal` count against the
 * Buddies write edge tier, the rest against the read tier.
 *
 * Privacy: nothing here logs or reports bodies, account ids, slot ids,
 * session ids, or tokens.
 */

/** Per isolate, so a device's puts don't each read D1 (or RevenueCat). */
const ENTITLEMENT_CACHE_MS = 60_000
const ENTITLEMENT_CACHE_ENTRIES = 1_000
const supporterCache = new Map<string, { supporter: boolean; at: number }>()

/** Clears the per-isolate Supporter cache (tests). */
export const resetSyncEntitlementCache = (): void => supporterCache.clear()

const cachedSupporter = async (
  env: Environment,
  accountId: string
): Promise<boolean> => {
  const now = Date.now()
  const cached = supporterCache.get(accountId)
  if (cached && now - cached.at < ENTITLEMENT_CACHE_MS) return cached.supporter
  const { supporter } = await accountSupporterStatus(
    env,
    accountsDb(env.ACCOUNTS_DB!),
    accountId
  )
  supporterCache.delete(accountId)
  if (supporterCache.size >= ENTITLEMENT_CACHE_ENTRIES)
    supporterCache.delete(supporterCache.keys().next().value!)
  supporterCache.set(accountId, { supporter, at: now })
  return supporter
}

/**
 * The capabilities the session last sent, or null (an app that sends none,
 * or the session can't be read: the Supporter rule still admits Supporters).
 */
const callerCapabilities = async (
  env: Environment,
  account: Pick<AccountAuth, 'sessionId' | 'capabilities'>
): Promise<readonly string[] | null> => {
  // A token that carries them saves the read (ADR 0060 §7).
  if (account.capabilities) return account.capabilities
  try {
    return await cachedSessionCapabilities(
      accountsDb(env.ACCOUNTS_DB!),
      account.sessionId
    )
  } catch (error) {
    captureFailure(error, 'sync session capabilities read')
    return null
  }
}

/**
 * The entitlement this caller's app sees: `everyone` only when its session
 * sent `sync-everyone` (`entitlementForApp`, witness-work ADR 0040 §2).
 */
const callerEntitlement = async (
  env: Environment,
  account: Pick<AccountAuth, 'sessionId' | 'capabilities'>,
  entitlement: SyncEntitlement
): Promise<SyncEntitlement> =>
  // Read only when it decides anything.
  entitlement === 'everyone'
    ? entitlementForApp(entitlement, await callerCapabilities(env, account))
    : entitlement

/** The account's sync index. */
export const syncIndex = (env: Environment, accountId: string) =>
  env.ACCOUNT_SYNC_INDEX.get(env.ACCOUNT_SYNC_INDEX.idFromName(accountId))

/** Off without the bucket or the accounts database. */
const unavailableHere = (env: Environment): Response | null =>
  env.ACCOUNT_SYNC && env.ACCOUNTS_DB ? null : buddiesErrorResponse('disabled')

/** The token's account, after the edge tier; or the refusal. */
export const caller = async (
  c: AppContext,
  tier: 'write' | 'read' | 'photoPut',
  options?: Pick<AuthenticateAccountOptions, 'requireLiveSession'>
): Promise<
  { account: AccountAuth; expiresAt: number } | { refusal: Response }
> => {
  const limited = await refuseAtEdge(
    c,
    tier === 'write' ? 'event/put' : tier === 'photoPut' ? 'blob/put' : 'inbox/sync'
  )
  if (limited) return { refusal: limited }
  const auth = await authenticateAccount(c, options)
  return auth.ok
    ? { account: auth.account, expiresAt: auth.expiresAt }
    : { refusal: auth.response }
}

/**
 * The switches and the account's entitlement for put, list, get, live, and
 * setting the Cloud Sync request: null admits.
 */
export const refuseUnentitled = async (
  env: Environment,
  account: Pick<AccountAuth, 'accountId' | 'sessionId' | 'capabilities'>
): Promise<Response | null> => {
  const { accountId } = account
  const { enabled, entitlement: switched } = await syncSwitches(env)
  if (!enabled) return buddiesErrorResponse('disabled')
  const entitlement = await callerEntitlement(env, account, switched)
  if (entitlement === 'everyone') return null
  try {
    return (await cachedSupporter(env, accountId))
      ? null
      : buddiesErrorResponse('supporter_required')
  } catch (error) {
    if (error instanceof RevenueCatError)
      return buddiesErrorResponse('unavailable')
    throw error
  }
}

/** The JSON body's `slotId` (optional for delete), or `bad_request`. */
const readSlotField = async (
  c: AppContext,
  required: boolean
): Promise<{ slotId: string | null } | { refusal: Response }> => {
  const body = await readPlainJson(c)
  if (!isPlainObject(body))
    return { refusal: buddiesErrorResponse('bad_request') }
  if (body.slotId === undefined && !required) return { slotId: null }
  return isSyncSlotId(body.slotId)
    ? { slotId: body.slotId }
    : { refusal: buddiesErrorResponse('bad_request') }
}

/**
 * `GET /accounts/v1/sync`: the account's answer, for Settings and the
 * Cloud Sync default. A RevenueCat failure says `supporter: false` with
 * `supporterCheckFailed: true`, never a 5xx. Works while disabled.
 */
const handleStatus = guarded('sync', async (c) => {
  if (!c.env.ACCOUNTS_DB) return buddiesErrorResponse('disabled')
  const who = await caller(c, 'read')
  if ('refusal' in who) return who.refusal
  const switches = await syncSwitches(c.env)
  const { enabled } = switches
  const entitlement = await callerEntitlement(
    c.env,
    who.account,
    switches.entitlement
  )
  let supporter = false
  let supporterCheckFailed = false
  try {
    supporter = await cachedSupporter(c.env, who.account.accountId)
  } catch (error) {
    if (!(error instanceof RevenueCatError)) throw error
    supporterCheckFailed = true
  }
  const entitled = enabled && (entitlement === 'everyone' || supporter)
  let requestedAt: number | null = null
  try {
    requestedAt = await syncIndex(c.env, who.account.accountId).requestedAt()
  } catch (error) {
    // The entitlement answer still goes out; the phone reads again later.
    captureFailure(error, 'sync request read')
  }
  return c.json({
    ok: true,
    enabled: enabled && unavailableHere(c.env) == null,
    entitled: entitled && unavailableHere(c.env) == null,
    entitlement,
    supporter,
    ...(supporterCheckFailed ? { supporterCheckFailed: true } : {}),
    requestedAt,
    photos: c.env.ACCOUNT_PHOTOS != null && (await isSyncPhotosOn(c.env)),
    // Whether devices send record changes (ADR 0060), or whole snapshots.
    changes:
      enabled && unavailableHere(c.env) == null && (await isSyncChangesOn(c.env)),
  })
})

/**
 * `sync/request`: `{ requested: true, payload, signature }` asks the
 * account's phones to switch to Cloud Sync (the web sets it; witness-work
 * ADR 0040 §5); `{ requested: false }` withdraws it. Setting is bearer and a
 * self-signed envelope (op `sync/request`) by the token's own account, as
 * `backup/delete` is, so a leaked token alone can't move the User's phones;
 * it needs Cloud Sync on and an entitled account. Withdrawing always works.
 * Not in the activity log: it changes no one's access.
 */
const handleSwitchRequest = guarded('sync/request', async (c) => {
  if (!c.env.ACCOUNTS_DB) return buddiesErrorResponse('disabled')
  const who = await caller(c, 'read')
  if ('refusal' in who) return who.refusal
  const { accountId } = who.account
  const text = await readEnvelopeText(c.req.raw)
  const body = parseJsonOrNull(text)
  if (!isPlainObject(body) || typeof body.requested !== 'boolean')
    return buddiesErrorResponse('bad_request')
  let nonce: string | null = null
  if (body.requested) {
    const verified = await verifyEnvelope('sync/request', parseEnvelope(text!))
    if ('refusal' in verified) return verified.refusal
    const found = await accountForKey(c.env, verified.payload.accountPub)
    if ('refusal' in found) return found.refusal
    if (found.account.id !== accountId) return buddiesErrorResponse('forbidden')
    nonce = verified.payload.nonce
    const refused =
      unavailableHere(c.env) ?? (await refuseUnentitled(c.env, who.account))
    if (refused) return refused
  }
  const index = syncIndex(c.env, accountId)
  if (nonce == null) return c.json({ ok: true, requestedAt: await index.clearRequest() })
  const set = await index.setRequest({ accountId, nonce })
  if (!set.ok) return buddiesErrorResponse(set.error)
  return c.json({ ok: true, requestedAt: set.value })
})

/**
 * `sync/put`: the blob as the raw body, with `x-ww-slot-id`, `x-ww-sha256`,
 * `Content-Length`, and optionally `If-Match`. A declared size over the cap
 * is refused before anything else; the body is read and checked against its
 * size and digest before the slot is reserved, so a bad upload never holds
 * the slot.
 *
 * `x-ww-reseal: 1` re-seals an existing slot (another device's, too) under a
 * new account key: it keeps the slot's session, platform, and `updatedAt`,
 * so retention and the Cloud Sync request see no new write. It needs a
 * strong quoted-ETag `If-Match` (`bad_request` without one, or with a weak
 * `W/"…"` one), so it never replaces
 * bytes a device wrote after the re-sealer read the slot. Allowed only
 * within `resealWindowMs` of the account's last key change (`forbidden`);
 * a slot that doesn't exist is `precondition_failed` (ADR 0039).
 */
const handlePut = guarded('sync/put', async (c) => {
  const declared = c.req.header('content-length')
  const off = unavailableHere(c.env)
  if (declared != null && Number(declared) > SYNC_LIMITS.blobBytes)
    return off ?? buddiesErrorResponse('too_large')
  if (off) return off
  // A signed-out device's last token never writes over a slot re-sealed
  // under a new account key (ADR 0039).
  const who = await caller(c, 'write', { requireLiveSession: true })
  if ('refusal' in who) return who.refusal
  const { accountId, sessionId, platform } = who.account
  const refused = await refuseUnentitled(c.env, who.account)
  if (refused) return refused

  const slotId = c.req.header(SYNC_HEADERS.slotId)
  const sha256 = c.req.header(SYNC_HEADERS.sha256)
  const size = declared == null ? NaN : Number(declared)
  const ifMatchHeader = c.req.header('if-match') ?? null
  const ifMatch = parseIfMatch(ifMatchHeader)
  const resealHeader = c.req.header(SYNC_HEADERS.reseal)
  const reseal = resealHeader === '1'
  const coversHeader = c.req.header(SYNC_HEADERS.coversSequence)
  const coversSequence =
    coversHeader === undefined
      ? null
      : /^\d{1,16}$/.test(coversHeader)
        ? Number(coversHeader)
        : undefined
  if (
    coversSequence === undefined ||
    // A re-seal is the same base: it covers what the base did.
    (reseal && coversSequence != null) ||
    (resealHeader !== undefined && !reseal) ||
    // A re-seal replaces exactly the bytes it read, never newer ones: a
    // strong ETag only (a weak `W/"…"` doesn't promise the same bytes).
    (reseal &&
      !(ifMatch != null && 'etag' in ifMatch && !/^\s*W\//.test(ifMatchHeader ?? ''))) ||
    !isSyncSlotId(slotId) ||
    typeof sha256 !== 'string' ||
    !SYNC_ETAG_PATTERN.test(sha256) ||
    !Number.isSafeInteger(size) ||
    size < 1 ||
    ifMatch === undefined
  )
    return buddiesErrorResponse('bad_request')

  if (reseal) {
    const changedAt = await findKeyChangedAt(accountsDb(c.env.ACCOUNTS_DB!), accountId)
    if (changedAt == null || Date.now() - changedAt > SYNC_LIMITS.resealWindowMs)
      return buddiesErrorResponse('forbidden')
  }

  const body = await readBlobBody(c.req.raw, size, SYNC_LIMITS.blobBytes)
  if (!body.ok) return buddiesErrorResponse(body.error)
  const digest = await sha256Bytes(body.value)
  if (!timingSafeEqual(bytesToBase64Url(digest), sha256))
    return buddiesErrorResponse('bad_request')

  const index = syncIndex(c.env, accountId)
  const begun = await index.beginPut({ accountId, slotId, size, ifMatch, reseal })
  if (!begun.ok)
    return buddiesErrorResponse(begun.error, {
      retryAfterSeconds: begun.retryAfterSeconds,
    })
  const { reservation } = begun.value
  const updatedAt = begun.value.updatedAt ?? Date.now()
  try {
    await c.env.ACCOUNT_SYNC!.put(syncObjectKey(accountId, slotId), body.value, {
      sha256: bytesToHex(digest),
      httpMetadata: { contentType: 'application/octet-stream' },
      customMetadata: { etag: sha256, updatedAt: String(updatedAt) },
    })
  } catch (error) {
    await index.abortPut({ slotId, reservation }).catch(() => undefined)
    throw error
  }
  const committed = await index.commitPut({
    accountId,
    slotId,
    reservation,
    etag: sha256,
    size,
    updatedAt,
    sessionId,
    platform,
    reseal,
    coversSequence,
  })
  if (!committed.ok) return buddiesErrorResponse(committed.error)
  return c.json({ ok: true, ...committed.value }, 200, {
    ETag: `"${sha256}"`,
  })
})

/**
 * `sync/list`: every slot's ETag, size, and server time, the platform of the
 * session that last wrote it and whether that session is live, and the
 * account's `seq`. A failed session read says `live: true`, as retention
 * does, so a pull never fails on it.
 */
const handleList = guarded('sync/list', async (c) => {
  const off = unavailableHere(c.env)
  if (off) return off
  const who = await caller(c, 'read')
  if ('refusal' in who) return who.refusal
  const { accountId } = who.account
  const refused = await refuseUnentitled(c.env, who.account)
  if (refused) return refused
  const { seq, slots } = await syncIndex(c.env, accountId).list({
    // An app that reads record changes says so; any other reads only bases.
    reader: {
      sessionId: who.account.sessionId,
      changes: c.req.header(SYNC_HEADERS.readsChanges) === '1',
    },
  })
  let states: Awaited<ReturnType<typeof sessionStates>> | null = null
  try {
    states = await sessionStates(
      accountsDb(c.env.ACCOUNTS_DB!),
      accountId,
      [...new Set(slots.map((slot) => slot.sessionId))]
    )
  } catch (error) {
    captureFailure(error, 'sync/list sessions')
  }
  return c.json({
    ok: true,
    seq,
    slots: slots.map(({ sessionId, platform, ...slot }) => {
      const state = states?.get(sessionId)
      return {
        ...slot,
        platform: platform ?? state?.platform ?? null,
        live: states ? (state?.live ?? false) : true,
      }
    }),
  })
})

/** `sync/get`: one slot's bytes exactly as put. */
const handleGet = guarded('sync/get', async (c) => {
  const off = unavailableHere(c.env)
  if (off) return off
  const who = await caller(c, 'read')
  if ('refusal' in who) return who.refusal
  const { accountId } = who.account
  const refused = await refuseUnentitled(c.env, who.account)
  if (refused) return refused
  const field = await readSlotField(c, true)
  if ('refusal' in field) return field.refusal
  const object = await c.env.ACCOUNT_SYNC!.get(
    syncObjectKey(accountId, field.slotId!)
  )
  if (!object) return buddiesErrorResponse('not_found')
  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(object.size),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  }
  const etag = object.customMetadata?.etag
  if (etag) headers.ETag = `"${etag}"`
  const updatedAt = Number(object.customMetadata?.updatedAt)
  headers[SYNC_HEADERS.updatedAt] = String(
    Number.isSafeInteger(updatedAt) ? updatedAt : object.uploaded.getTime()
  )
  return new Response(object.body, { headers })
})

/**
 * `sync/delete`: one slot, or every slot without `slotId`. Idempotent, and
 * it works while Cloud Sync is off or the account isn't entitled, so a
 * device can always take its data off the server. Needs a live session
 * (Delete Buddies runs it before closing its own), so a signed-out device
 * can't delete what a key change re-sealed (ADR 0039).
 */
const handleDelete = guarded('sync/delete', async (c) => {
  const off = unavailableHere(c.env)
  if (off) return off
  const field = await readSlotField(c, false)
  if ('refusal' in field) return field.refusal
  const who = await caller(c, 'read', { requireLiveSession: true })
  if ('refusal' in who) return who.refusal
  const { accountId } = who.account
  // Every slot takes every photo with it (the index marks them deleted).
  const { seq } = await syncIndex(c.env, accountId).deleteSlots({
    accountId,
    slotId: field.slotId,
  })
  return c.json({ ok: true, seq })
})

/**
 * `GET sync/live`: upgrades to the account's live socket. The DO is told
 * who the socket is for in a call (`admitLive`: the account, the session,
 * the device's own slot), and the forwarded upgrade carries only the one-use
 * id that call answers with.
 *
 * - Native apps send the token in `Authorization` and the slot id in
 *   `x-ww-slot-id`. Their sockets outlive the token, so a `web` token is
 *   refused there (403 `forbidden`).
 * - Browsers can't set headers on a WebSocket, so they offer `ww.v1` and
 *   `ticket.<ticket>` in `Sec-WebSocket-Protocol` (src/liveSubprotocol.ts),
 *   from an allowed `Origin`: a `sync` ticket from `POST live/ticket`
 *   (src/accounts/liveTickets.ts), which names the slot. Origin (403) and
 *   the offer's shape (400) come first, then the switches, the same edge
 *   tier, and the ticket (401) in place of the token; then every other check
 *   runs in the same order. The DO gets the token's expiry from the ticket
 *   and the ticket's hash (never the ticket), refuses a second socket on the
 *   same ticket while one is open (409 `conflict`), and closes the socket
 *   with `4004 "expired"` at the expiry; the 101 says
 *   `Sec-WebSocket-Protocol: ww.v1`.
 */
/** What the Worker once forwarded; a client's copy is still dropped. */
const FORMER_INTERNAL_HEADERS = ['x-ww-sync-account', 'x-ww-sync-expires-at']

const handleLive = async (c: AppContext): Promise<Response> => {
  try {
    const browser = readBrowserLive(c.env, c.req.raw.headers)
    if (browser && !browser.ok) return buddiesErrorResponse(browser.error)
    const off = unavailableHere(c.env)
    if (off) return off
    let account: AccountAuth
    let slotId: string | undefined
    let ticket: { expiresAt: number; hash: string } | null = null
    let tokenExpiresAt: number | null = null
    if (browser) {
      const limited = await refuseAtEdge(c, 'inbox/sync')
      if (limited) return limited
      const admitted = await admitLiveTicket(c.env, browser.ticket, 'sync')
      if (!admitted.ok) return admitted.response
      const { claims } = admitted
      account = claims.account
      slotId = claims.id
      ticket = { expiresAt: claims.tokenExpiresAt, hash: claims.hash }
    } else {
      const who = await caller(c, 'read')
      if ('refusal' in who) return who.refusal
      // A browser's token never opens a header socket: nothing would close
      // it when the token expires. Browsers use tickets.
      if (who.account.platform === 'web') return buddiesErrorResponse('forbidden')
      account = who.account
      tokenExpiresAt = who.expiresAt
      slotId = c.req.header(SYNC_HEADERS.slotId)
    }
    const { accountId } = account
    const refused = await refuseUnentitled(c.env, account)
    if (refused) return refused
    if (!isWebSocketUpgrade(c.req.raw))
      return buddiesErrorResponse('upgrade_required')
    if (!isSyncSlotId(slotId)) return buddiesErrorResponse('bad_request')
    // Who the socket is for goes to the index in a call, and the upgrade
    // carries only the one-use id it answers with: Workers Logs record
    // request headers, the forwarded request's too.
    const index = syncIndex(c.env, accountId)
    const admitted = await index.admitLive({
      accountId,
      slotId,
      // The socket is its session's: it closes when the session ends, and
      // gets changes only while the session is known live (ADR 0060 §6).
      sessionId: account.sessionId,
      keyEpoch: account.keyEpoch ?? null,
      tokenExpiresAt,
      expiresAt: ticket?.expiresAt ?? null,
      ticket: ticket?.hash ?? null,
    })
    if (!admitted.ok) return refusedChange(admitted)
    const response = await index.fetch(
      forwardedLiveRequest(
        c.req.raw,
        { [SYNC_HEADERS.admission]: admitted.value.admission },
        FORMER_INTERNAL_HEADERS
      )
    )
    return ticket ? acceptLiveSubprotocol(response) : response
  } catch (error) {
    console.error('accounts: request failed', { op: 'sync/live' })
    captureFailure(error, 'sync/live')
    return buddiesInternalError()
  }
}

/**
 * A JSON body of `sync/changes/*`: a sealed change in base64url, and its
 * fields.
 */
const CHANGE_BODY_BYTES =
  Math.ceil((SYNC_CHANGE_LIMITS.blobBytes * 4) / 3) + 1_024

const readChangeBody = async (
  c: AppContext
): Promise<{ body: Record<string, unknown> } | { refusal: Response }> => {
  const text = await readBodyText(c.req.raw, CHANGE_BODY_BYTES)
  if (!text.ok) return { refusal: buddiesErrorResponse(text.error) }
  const body = parseJsonOrNull(text.value)
  return isPlainObject(body)
    ? { body }
    : { refusal: buddiesErrorResponse('bad_request') }
}

/** Who the Durable Object checks, in place of the D1 session read. */
const changeCaller = (account: AccountAuth): SyncCaller => ({
  sessionId: account.sessionId,
  keyEpoch: account.keyEpoch ?? 0,
  platform: account.platform,
})

const refusedChange = (result: SyncChangeFailure): Response =>
  buddiesErrorResponse(result.error, {
    retryAfterSeconds: result.retryAfterSeconds,
    ...(result.reason ? { extras: { reason: result.reason } } : {}),
  })

/**
 * The switches, the entitlement, and the changes switch, read together:
 * null admits.
 */
const refuseChanges = async (
  env: Environment,
  account: AccountAuth
): Promise<Response | null> => {
  const [refused, on] = await Promise.all([
    refuseUnentitled(env, account),
    isSyncChangesOn(env),
  ])
  return refused ?? (on ? null : buddiesErrorResponse('changes_disabled'))
}

/**
 * `sync/changes/put`: `{ slotId, changeId, blob }`, one sealed change in
 * unpadded base64url, a whole number of 256-byte blocks and at most 256 KiB.
 * Stored in the slot's tail under the account's next sequence and sent to
 * the account's other sockets. Answers `{ sequence, tailCount, tailBytes,
 * snapshotReaders, changedAt }`; the same `changeId` again answers the
 * first put's sequence.
 *
 * The write path is the token, the switches (edge-cached), and one Durable
 * Object call: no D1 and no R2 (ADR 0060 §7). The slot needs a base (409
 * `no_slot`). A full tail is 409 `tail_full`: the device writes its base
 * with `x-ww-covers-sequence` and sends again.
 */
const handleChangePut = guarded('sync/changes/put', async (c) => {
  const off = unavailableHere(c.env)
  if (off) return off
  const who = await caller(c, 'write')
  if ('refusal' in who) return who.refusal
  const refused = await refuseChanges(c.env, who.account)
  if (refused) return refused
  const read = await readChangeBody(c)
  if ('refusal' in read) return read.refusal
  const { slotId, changeId, blob } = read.body
  const size = sealedChangeBytes(blob)
  if (!isSyncSlotId(slotId) || !isSyncChangeId(changeId) || size == null)
    return buddiesErrorResponse('bad_request')
  const put = await syncIndex(c.env, who.account.accountId).putChange({
    slotId,
    changeId,
    blob: blob as string,
    size,
    caller: changeCaller(who.account),
  })
  if (!put.ok) return refusedChange(put)
  return c.json({ ok: true, ...put.value })
})

/**
 * `sync/changes/list`: `{ slotId, afterSequence }` → what the device missed
 * since its cursor: `{ sequence, slots, changes, more, snapshotReaders,
 * requestedAt, photos }`. `slots` is every slot with its `floorSequence`
 * (a device behind it reads that slot's base with `sync/get`) and
 * `changedAt`; `changes` is the other slots' changes after `afterSequence`,
 * oldest first, a page at a time (`more`). `slotId` is the caller's own
 * slot, whose changes are left out. One Durable Object read.
 */
const handleChangesList = guarded('sync/changes/list', async (c) => {
  const off = unavailableHere(c.env)
  if (off) return off
  const who = await caller(c, 'read')
  if ('refusal' in who) return who.refusal
  const refused = await refuseChanges(c.env, who.account)
  if (refused) return refused
  const body = await readPlainJson(c)
  if (
    !isPlainObject(body) ||
    !isSyncSlotId(body.slotId) ||
    typeof body.afterSequence !== 'number' ||
    !Number.isSafeInteger(body.afterSequence) ||
    body.afterSequence < 0
  )
    return buddiesErrorResponse('bad_request')
  const caught = await syncIndex(c.env, who.account.accountId).catchUp({
    slotId: body.slotId,
    afterSequence: body.afterSequence,
    caller: changeCaller(who.account),
  })
  if (!caught.ok) return refusedChange(caught)
  return c.json({ ok: true, ...caught.value })
})

/**
 * `sync/changes/reseal`: `{ sequence, changeId, blob }` replaces one
 * change's bytes with the same change sealed under the new account key (ADR
 * 0039, ADR 0060 §10). Its sequence, slot, and time stay, and nothing is
 * sent to the sockets: a device that signs back in reads from the start.
 * Needs a live session, and is allowed only within `resealWindowMs` of the
 * account's last key change (`forbidden`). 404 `not_found` once the
 * change's device folded it into its base.
 */
const handleChangeReseal = guarded('sync/changes/reseal', async (c) => {
  const off = unavailableHere(c.env)
  if (off) return off
  const who = await caller(c, 'write', { requireLiveSession: true })
  if ('refusal' in who) return who.refusal
  const { accountId, keyEpoch } = who.account
  const refused = await refuseChanges(c.env, who.account)
  if (refused) return refused
  const read = await readChangeBody(c)
  if ('refusal' in read) return read.refusal
  const { sequence, changeId, blob } = read.body
  const size = sealedChangeBytes(blob)
  if (
    typeof sequence !== 'number' ||
    !Number.isSafeInteger(sequence) ||
    sequence < 1 ||
    !isSyncChangeId(changeId) ||
    size == null
  )
    return buddiesErrorResponse('bad_request')
  const changedAt = await findKeyChangedAt(accountsDb(c.env.ACCOUNTS_DB!), accountId)
  if (changedAt == null || Date.now() - changedAt > SYNC_LIMITS.resealWindowMs)
    return buddiesErrorResponse('forbidden')
  const resealed = await syncIndex(c.env, accountId).resealChange({
    sequence,
    changeId,
    blob: blob as string,
    size,
    keyEpoch: keyEpoch ?? 0,
  })
  if (!resealed.ok) return buddiesErrorResponse(resealed.error)
  return c.json({ ok: true, ...resealed.value })
})

/**
 * Tells the account's sync index that sessions ended, so their sockets
 * close and their last tokens can't add changes (ADR 0060 §6, §7). Name the
 * sessions known to have ended; with none, every socket's session is
 * checked again. Never fails the route that ended them: a notice that's
 * lost costs at most a token's 15 minutes.
 */
export const noteSessionsEnded = async (
  env: Environment,
  accountId: string,
  sessionIds: string[] = []
): Promise<void> => {
  if (!env.ACCOUNT_SYNC_INDEX) return
  try {
    await syncIndex(env, accountId).sessionsEnded({ sessionIds })
  } catch (error) {
    console.error('accounts: telling sync a session ended failed')
    captureFailure(error, 'sync sessions ended')
  }
}

/**
 * `noteSessionsEnded` after the response where the runtime allows it, so a
 * session open doesn't wait for it.
 */
export const noteSessionsEndedSoon = async (
  c: AppContext,
  accountId: string,
  sessionIds: string[] = []
): Promise<void> => {
  const told = noteSessionsEnded(c.env, accountId, sessionIds)
  try {
    c.executionCtx.waitUntil(told)
  } catch {
    // No ExecutionContext (unit tests): awaited instead.
    await told
  }
}

export const syncHandlers = {
  status: handleStatus,
  put: handlePut,
  list: handleList,
  get: handleGet,
  delete: handleDelete,
  changePut: handleChangePut,
  changesList: handleChangesList,
  changeReseal: handleChangeReseal,
  switchRequest: handleSwitchRequest,
  live: handleLive,
}
