import {
  concatBytes,
  fromB64u,
  fromUtf8,
  toB64u,
  utf8,
} from '@/features/buddies/lib/bytes'
import { ed25519Verify, sha256 } from '@/features/buddies/lib/crypto'

/**
 * In-memory relay implementing docs/buddies-protocol.md closely enough to
 * exercise the client end to end: signatures, slots, caps, invite lifecycle,
 * seq semantics, and push intents. Not a substitute for ww-api's own tests.
 *
 * Bearer-only, as with ww-api's legacy switch off: every op needs a session's
 * access token (426 `upgrade_required` without one), which it opens, refreshes
 * and closes at `/accounts/v1/sessions` (docs/accounts-protocol.md) without
 * checking an attestation.
 */

type StoredEvent = {
  eventId: string
  slotId: string
  kind: string
  blob: string
  seq: number
  createdAt: number
}

type Inbox = {
  ownerPub: string
  seq: number
  /** `sealed`: its writer sealed it (`slot/seal`); only leaving still works. */
  slots: Map<string, { writerPub: string; createdAt: number; sealed?: true }>
  cards: Map<string, { blob: string; seq: number; updatedAt: number }>
  events: StoredEvent[]
  devices: Map<string, unknown>
  roster: { blob: string; seq: number } | null
  openInvites: Set<string>
}

type Invite = {
  inboxId: string
  claimVerifier: string
  blob: string
  expiresAt: number
  status: 'open' | 'claimed'
  badClaims: number
}

/** How long the relay answers `inbox/successor` for a deleted inbox. */
const SUCCESSOR_TTL_MS = 90 * 24 * 60 * 60 * 1000

export function createFakeRelay(now: () => number) {
  const inboxes = new Map<string, Inbox>()
  const invites = new Map<string, Invite>()
  const pushes: { inboxId: string; kind: string }[] = []
  /**
   * The `ww` marker each push carries, as the relay builds it: the event's kind
   * and `seq`, and the sealed event itself (which the real relay leaves out
   * when it doesn't fit).
   */
  const markers: {
    inboxId: string
    marker: { kind: string; seq: number; eventId: string; blob: string }
  }[] = []
  /** Alerts a device would show: only kinds it registered a template for. */
  const alerts: { inboxId: string; deviceId: string; kind: string }[] = []
  /** Card and event writes per `inboxId|slotId` (60 per rolling hour). */
  const writes = new Map<string, number[]>()
  /** Shared photos, by `inboxId|blobId`. */
  const blobs = new Map<
    string,
    { data: Uint8Array; tokenHash: string; expiresAt: number }
  >()
  /** What `inbox/sync` says the relay offers. */
  const capabilities = { photos: true }
  /**
   * Server accounts the relay knows (accountId → public key and status), and
   * which account owns each inbox: ADR 0024's Option A.
   */
  const accounts = new Map<
    string,
    { accountPub: string; status: 'active' | 'suspended' }
  >()
  const inboxAccounts = new Map<string, string>()
  /** The account key each inbox was linked under: its key epoch. */
  const inboxLinkKeys = new Map<string, string>()
  /**
   * A deleted inbox's successor (`inbox/delete` with `successor`), kept 90
   * days, for `inbox/successor`.
   */
  const successors = new Map<
    string,
    { successor: string; at: number; accountId: string }
  >()
  const replaced = (inboxId: string) => {
    const recorded = successors.get(inboxId)
    return recorded !== undefined && recorded.at + SUCCESSOR_TTL_MS > now()
  }
  /**
   * Ops the relay answers with an error instead, e.g. a 500, by op; `reason` as
   * the relay adds it (`key_changed`).
   */
  const refusals = new Map<
    string,
    { status: number; error: string; reason?: string }
  >()
  /** Live sessions by id, and the access tokens they handed out. */
  const sessions = new Map<
    string,
    { accountId: string; refreshToken: string; expiresAt: number }
  >()
  const accessTokens = new Map<
    string,
    { accountId: string; sessionId: string }
  >()
  let issued = 0
  /** Every Buddies request, for tests of what goes on the wire. */
  const requests: {
    op: string
    headers: Record<string, string>
    body: unknown
  }[] = []
  const suspended = (inboxId: string) => {
    const accountId = inboxAccounts.get(inboxId)
    return (
      accountId !== undefined && accounts.get(accountId)?.status === 'suspended'
    )
  }

  function withinWriteLimit(inboxId: string, slotId: string) {
    const key = `${inboxId}|${slotId}`
    const recent = (writes.get(key) ?? []).filter(
      (at) => at > now() - 60 * 60 * 1000
    )
    if (recent.length >= 60) return false
    writes.set(key, [...recent, now()])
    return true
  }

  const respond = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  const ok = (extra: Record<string, unknown> = {}) =>
    respond(200, { ok: true, ...extra })
  const fail = (status: number, error: string) => respond(status, { error })

  function deleteInvite(inviteId: string) {
    const invite = invites.get(inviteId)
    if (!invite) return
    invites.delete(inviteId)
    inboxes.get(invite.inboxId)?.openInvites.delete(inviteId)
  }

  function clearSlot(inbox: Inbox, slotId: string) {
    inbox.slots.delete(slotId)
    inbox.cards.delete(slotId)
    inbox.events = inbox.events.filter((event) => event.slotId !== slotId)
  }

  /** `inboxId` is linked to `accountId` under the account's key now. */
  const currentLink = (inboxId: string, accountId: string | undefined) =>
    accountId !== undefined &&
    inboxAccounts.get(inboxId) === accountId &&
    inboxLinkKeys.get(inboxId) === accounts.get(accountId)?.accountPub

  /**
   * An owner op's account check: the inbox must be linked to the caller's
   * account. Null when it is.
   */
  function notOwner(inboxId: string, accountId: string) {
    const linked = inboxAccounts.get(inboxId)
    if (linked === undefined) return fail(409, 'not_linked')
    if (linked !== accountId) return fail(403, 'forbidden')
    return null
  }

  /** `blob/put`: the fields ride in a header; the body is the bytes. */
  function putBlob(
    init: RequestInit | undefined,
    headers: Record<string, string>,
    accountId: string
  ) {
    if (!capabilities.photos) return fail(503, 'photos_disabled')
    if (headers['x-buddies-signature'] !== undefined)
      return fail(400, 'bad_request')
    const payload = JSON.parse(
      fromUtf8(fromB64u(headers['x-buddies-payload']))
    ) as {
      inboxId: string
      blobId: string
      bytes: number
      expiresAt: number
      readTokenHash: string
    }
    const inbox = inboxes.get(payload.inboxId)
    if (!inbox) return fail(404, 'not_found')
    const refused = notOwner(payload.inboxId, accountId)
    if (refused) return refused
    const data = init?.body as Uint8Array
    if (data.length > 1024 * 1024) return fail(413, 'too_large')
    // Like the relay: at most 90 days out, and only from an inbox with a buddy.
    if (
      payload.expiresAt <= now() ||
      payload.expiresAt > now() + 90 * 24 * 60 * 60 * 1000
    )
      return fail(400, 'bad_request')
    if (!inbox.slots.size) return fail(403, 'no_buddies')
    if (
      data.length !== payload.bytes ||
      toB64u(sha256(data)) !== payload.blobId
    )
      return fail(400, 'bad_request')
    const key = `${payload.inboxId}|${payload.blobId}`
    const existing = blobs.get(key)
    const expiresAt = Math.max(existing?.expiresAt ?? 0, payload.expiresAt)
    blobs.set(key, {
      data,
      tokenHash: existing?.tokenHash ?? payload.readTokenHash,
      expiresAt,
    })
    return ok({ expiresAt })
  }

  /** Opens a session for `accountPub`'s account, made the first time. */
  function openSession(accountPub: string) {
    let accountId = [...accounts].find(
      ([, account]) => account.accountPub === accountPub
    )?.[0]
    if (!accountId) {
      accountId = toB64u(
        sha256(utf8(`fake-account|${accountPub}|${issued++}`)).slice(0, 16)
      )
      accounts.set(accountId, { accountPub, status: 'active' })
    }
    const sessionId = `session-${issued++}`
    const session = {
      accountId,
      refreshToken: `refresh-${issued++}`,
      expiresAt: now() + 90 * 24 * 60 * 60 * 1000,
    }
    sessions.set(sessionId, session)
    const accessToken = `access-${issued++}`
    accessTokens.set(accessToken, { accountId, sessionId })
    return {
      ok: true,
      accountId,
      status: accounts.get(accountId)!.status,
      sessionId,
      accessToken,
      accessExpiresAt: now() + 15 * 60 * 1000,
      refreshToken: session.refreshToken,
      sessionExpiresAt: session.expiresAt,
    }
  }

  /** `/accounts/v1/sessions…`: open, refresh, and close. */
  function sessionRoute(path: string, init: RequestInit | undefined) {
    if (path === 'sessions') {
      const body = JSON.parse(String(init?.body)) as {
        payload: string
        signature: string
      }
      const bytes = fromB64u(body.payload)
      const { accountPub } = JSON.parse(fromUtf8(bytes)) as {
        accountPub: string
      }
      const signed = ed25519Verify(
        fromB64u(body.signature),
        concatBytes(utf8('ww-account/v1\nsession/open\n'), bytes),
        fromB64u(accountPub)
      )
      if (!signed) return fail(401, 'bad_signature')
      return respond(201, openSession(accountPub))
    }
    if (path === 'sessions/refresh') {
      const { refreshToken } = JSON.parse(String(init?.body)) as {
        refreshToken: string
      }
      const found = [...sessions].find(
        ([, session]) => session.refreshToken === refreshToken
      )
      if (!found || found[1].expiresAt <= now())
        return fail(401, 'unauthorized')
      const [sessionId, session] = found
      session.refreshToken = `refresh-${issued++}`
      const accessToken = `access-${issued++}`
      accessTokens.set(accessToken, { accountId: session.accountId, sessionId })
      return ok({
        accessToken,
        accessExpiresAt: now() + 15 * 60 * 1000,
        refreshToken: session.refreshToken,
        sessionExpiresAt: session.expiresAt,
      })
    }
    if (path === 'sessions/current') {
      const caller = callerOf(headersOf(init))
      if (caller instanceof Response) return caller
      sessions.delete(caller.sessionId)
      for (const [token, access] of accessTokens)
        if (access.sessionId === caller.sessionId) accessTokens.delete(token)
      return ok()
    }
    return fail(404, 'not_found')
  }

  const headersOf = (init: RequestInit | undefined) =>
    Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>).map(
        ([name, value]) => [name.toLowerCase(), value]
      )
    )

  /** The session a request's bearer token belongs to, or the refusal. */
  function callerOf(headers: Record<string, string>) {
    const authorization = headers.authorization
    // A request without a token is a legacy one, refused with the switch off.
    if (!authorization?.startsWith('Bearer '))
      return fail(426, 'upgrade_required')
    return (
      accessTokens.get(authorization.slice('Bearer '.length)) ??
      fail(401, 'unauthorized')
    )
  }

  async function fetchImpl(url: string | URL | Request, init?: RequestInit) {
    if (String(url).includes('/accounts/v1/'))
      return sessionRoute(String(url).split('/accounts/v1/')[1], init)
    const op = String(url).split('/buddies/v1/')[1]
    const headers = headersOf(init)
    requests.push({
      op,
      headers,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
    })
    const caller = callerOf(headers)
    if (caller instanceof Response) return caller
    const refusal = refusals.get(op)
    if (refusal)
      return respond(refusal.status, {
        error: refusal.error,
        ...(refusal.reason ? { reason: refusal.reason } : {}),
      })
    const { accountId } = caller
    if (op === 'blob/put') return putBlob(init, headers, accountId)
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    /** Envelope ops sign `payload`; capability ops send it unsigned. */
    const enveloped = typeof body.payload === 'string'
    const bytes = enveloped ? fromB64u(body.payload as string) : null
    // Owner ops send their fields as the body itself.
    const payload = (bytes ? JSON.parse(fromUtf8(bytes)) : body) as Record<
      string,
      never
    >
    const signedBy = (publicKey: string) =>
      bytes !== null &&
      typeof body.signature === 'string' &&
      ed25519Verify(
        fromB64u(body.signature),
        concatBytes(utf8(`ww-buddies/v1\n${op}\n`), bytes),
        fromB64u(publicKey)
      )

    // A suspended account's writes into others' inboxes (ww-api #53).
    if (
      ['card/put', 'event/put', 'invite/claim'].includes(op) &&
      accounts.get(accountId)?.status === 'suspended'
    )
      return fail(403, 'suspended')

    if (op === 'invite/fetch' || op === 'invite/claim') {
      const invite = invites.get(payload.inviteId)
      if (!invite || invite.expiresAt <= now()) return fail(404, 'not_found')
      if (op === 'invite/fetch')
        return ok({
          blob: invite.blob,
          expiresAt: invite.expiresAt,
          status: invite.status,
        })
      if (invite.status === 'claimed') return fail(409, 'conflict')
      if (
        toB64u(sha256(fromB64u(payload.claimSecret))) !== invite.claimVerifier
      ) {
        invite.badClaims += 1
        if (invite.badClaims >= 5) deleteInvite(payload.inviteId)
        return fail(401, 'bad_signature')
      }
      invite.status = 'claimed'
      // A claimed invite stops counting as open: its confirm adds the slot.
      inboxes.get(invite.inboxId)?.openInvites.delete(payload.inviteId)
      const creator = inboxes.get(invite.inboxId)!
      creator.seq += 1
      creator.events.push({
        eventId: payload.inviteId,
        slotId: '',
        kind: 'invite.claimed',
        blob: payload.blob,
        seq: creator.seq,
        createdAt: now(),
      })
      pushes.push({ inboxId: invite.inboxId, kind: 'invite.claimed' })
      markers.push({
        inboxId: invite.inboxId,
        marker: {
          kind: 'invite.claimed',
          seq: creator.seq,
          eventId: payload.inviteId,
          blob: payload.blob,
        },
      })
      return ok()
    }

    if (op === 'blob/get') {
      if (!capabilities.photos) return fail(503, 'photos_disabled')
      const blob = blobs.get(`${payload.inboxId}|${payload.blobId}`)
      const token = payload.token as string
      if (
        !blob ||
        blob.expiresAt <= now() ||
        toB64u(sha256(fromB64u(token))) !== blob.tokenHash
      )
        return fail(404, 'not_found')
      return new Response(blob.data as BodyInit, {
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
      })
    }

    if (op === 'inbox/register') {
      if (!signedBy(payload.ownerPub)) return fail(401, 'bad_signature')
      // Replaced after an account key change: no one brings it back.
      if (replaced(payload.inboxId)) return fail(409, 'conflict')
      if (suspended(payload.inboxId)) return fail(403, 'suspended')
      // With a session the account's claim is required, for its account.
      const proof = payload.account as
        | { accountId: string; signature: string }
        | undefined
      if (!proof) return fail(400, 'bad_request')
      if (proof.accountId !== accountId) return fail(403, 'forbidden')
      const account = accounts.get(proof.accountId)
      if (!account) return fail(404, 'unknown_account')
      const linkSigned = ed25519Verify(
        fromB64u(proof.signature),
        utf8(
          `ww-account/v1\ninbox/link\n${proof.accountId}\n${payload.inboxId}\n${payload.ownerPub}`
        ),
        fromB64u(account.accountPub)
      )
      if (!linkSigned) return fail(401, 'bad_signature')
      const linked = inboxAccounts.get(payload.inboxId)
      if (linked && linked !== proof.accountId) return fail(409, 'conflict')
      if (account.status === 'suspended') return fail(403, 'suspended')
      const existing = inboxes.get(payload.inboxId)
      if (existing && existing.ownerPub !== payload.ownerPub)
        return fail(409, 'conflict')
      inboxAccounts.set(payload.inboxId, proof.accountId)
      inboxLinkKeys.set(payload.inboxId, account.accountPub)
      if (!existing)
        inboxes.set(payload.inboxId, {
          ownerPub: payload.ownerPub,
          seq: 0,
          slots: new Map(),
          cards: new Map(),
          events: [],
          devices: new Map(),
          roster: null,
          openInvites: new Set(),
        })
      return ok({ accountId: proof.accountId })
    }

    // Anyone's session may ask what a deleted inbox moved to: only while the
    // successor is still linked under its account's key now, and the account
    // that recorded it isn't suspended.
    if (op === 'inbox/successor') {
      const recorded = successors.get(payload.inboxId)
      return ok({
        successor:
          recorded &&
          replaced(payload.inboxId) &&
          accounts.get(recorded.accountId)?.status !== 'suspended' &&
          currentLink(recorded.successor, recorded.accountId)
            ? recorded.successor
            : null,
      })
    }
    // Naming the same successor again answers ok, the inbox gone or not.
    if (
      op === 'inbox/delete' &&
      payload.successor !== undefined &&
      !inboxes.has(payload.inboxId) &&
      successors.get(payload.inboxId)?.successor === payload.successor
    )
      return ok()

    const inbox = inboxes.get(payload.inboxId)
    if (!inbox) return op === 'slot/leave' ? ok() : fail(404, 'not_found')

    if (['card/put', 'event/put', 'slot/leave', 'slot/seal'].includes(op)) {
      const slot = inbox.slots.get(payload.slotId)
      if (!slot) return op === 'slot/leave' ? ok() : fail(410, 'gone')
      if (!signedBy(slot.writerPub)) return fail(401, 'bad_signature')
      if (op === 'slot/seal') {
        slot.sealed = true
        return ok()
      }
      if (op === 'slot/leave') {
        // A sealed slot's events stay for the owner, until they expire or
        // the owner removes the slot.
        if (slot.sealed) {
          inbox.slots.delete(payload.slotId)
          inbox.cards.delete(payload.slotId)
        } else clearSlot(inbox, payload.slotId)
        return ok()
      }
      // A repeat of an event stored before the seal included.
      if (slot.sealed) return fail(403, 'sealed')
      if (op === 'card/put') {
        if (fromB64u(payload.blob).length > 16 * 1024)
          return fail(400, 'bad_request')
        if (!withinWriteLimit(payload.inboxId, payload.slotId))
          return fail(429, 'rate_limited')
        inbox.seq += 1
        inbox.cards.set(payload.slotId, {
          blob: payload.blob,
          seq: inbox.seq,
          updatedAt: now(),
        })
        return ok({ seq: inbox.seq })
      }
      const duplicate = inbox.events.find((e) => e.eventId === payload.eventId)
      if (duplicate) return ok({ seq: duplicate.seq })
      if (fromB64u(payload.blob).length > 8 * 1024)
        return fail(400, 'bad_request')
      if (!withinWriteLimit(payload.inboxId, payload.slotId))
        return fail(429, 'rate_limited')
      inbox.seq += 1
      inbox.events.push({
        eventId: payload.eventId,
        slotId: payload.slotId,
        kind: payload.kind,
        blob: payload.blob,
        seq: inbox.seq,
        createdAt: now(),
      })
      if (payload.push) {
        pushes.push({ inboxId: payload.inboxId, kind: payload.kind })
        markers.push({
          inboxId: payload.inboxId,
          marker: {
            kind: payload.kind,
            seq: inbox.seq,
            eventId: payload.eventId,
            blob: payload.blob,
          },
        })
        for (const [deviceId, device] of inbox.devices) {
          const { templates } = device as { templates: Record<string, unknown> }
          if (templates[payload.kind])
            alerts.push({
              inboxId: payload.inboxId,
              deviceId,
              kind: payload.kind,
            })
        }
      }
      return ok({ seq: inbox.seq })
    }

    if (enveloped) return fail(400, 'bad_request')
    // The successor form takes only an inbox linked to the caller's account.
    if (
      op === 'inbox/delete' &&
      payload.successor !== undefined &&
      inboxAccounts.get(payload.inboxId) === undefined
    )
      return fail(403, 'forbidden')
    const refused = notOwner(payload.inboxId, accountId)
    if (refused) return refused
    if (
      suspended(payload.inboxId) &&
      op !== 'inbox/delete' &&
      op !== 'slot/remove'
    )
      return fail(403, 'suspended')
    switch (op) {
      case 'inbox/sync': {
        const since = payload.since as number
        return ok({
          seq: inbox.seq,
          slots: [...inbox.slots].map(([slotId, slot]) => ({
            slotId,
            createdAt: slot.createdAt,
            ...(slot.sealed ? { sealed: true } : {}),
          })),
          cards: [...inbox.cards]
            .filter(([, card]) => card.seq > since)
            .map(([slotId, card]) => ({ slotId, ...card })),
          events: inbox.events.filter((event) => event.seq > since),
          roster:
            inbox.roster && inbox.roster.seq > since ? inbox.roster : null,
          capabilities: { ...capabilities },
        })
      }
      case 'blob/delete':
        for (const blobId of payload.blobIds as string[])
          blobs.delete(`${payload.inboxId}|${blobId}`)
        return ok()
      case 'inbox/delete': {
        // Recorded only for an inbox of the same account, linked under the
        // account's key now; otherwise nothing is deleted.
        const successor = payload.successor as string | undefined
        if (successor !== undefined) {
          if (accounts.get(accountId)?.status === 'suspended')
            return fail(403, 'suspended')
          if (
            !currentLink(successor, accountId) ||
            !inboxes.has(successor) ||
            successors.has(successor)
          )
            return fail(409, 'conflict')
          successors.set(payload.inboxId, { successor, at: now(), accountId })
        }
        for (const inviteId of inbox.openInvites) invites.delete(inviteId)
        inboxes.delete(payload.inboxId)
        return ok()
      }
      case 'device/register':
        inbox.devices.set(payload.deviceId, payload)
        return ok()
      case 'device/unregister':
        inbox.devices.delete(payload.deviceId)
        return ok()
      case 'slot/add':
        if (
          !inbox.slots.has(payload.slotId) &&
          inbox.slots.size + inbox.openInvites.size >= 5
        )
          return fail(429, 'limit')
        inbox.slots.set(payload.slotId, {
          writerPub: payload.writerPub,
          createdAt: now(),
        })
        return ok()
      case 'slot/remove':
        clearSlot(inbox, payload.slotId)
        return ok()
      case 'roster/put':
        inbox.seq += 1
        inbox.roster = { blob: payload.blob, seq: inbox.seq }
        return ok({ seq: inbox.seq })
      case 'invite/create':
        if (
          inbox.openInvites.size >= 5 ||
          inbox.slots.size + inbox.openInvites.size >= 5
        )
          return fail(429, 'limit')
        invites.set(payload.inviteId, {
          inboxId: payload.inboxId,
          claimVerifier: payload.claimVerifier,
          blob: payload.blob,
          expiresAt: payload.expiresAt,
          status: 'open',
          badClaims: 0,
        })
        inbox.openInvites.add(payload.inviteId)
        return ok()
      case 'invite/delete':
        if (invites.get(payload.inviteId)?.inboxId === payload.inboxId)
          deleteInvite(payload.inviteId)
        return ok()
      default:
        return fail(400, 'bad_request')
    }
  }

  return {
    fetchImpl,
    inboxes,
    invites,
    pushes,
    markers,
    alerts,
    blobs,
    capabilities,
    accounts,
    inboxAccounts,
    successors,
    refusals,
    sessions,
    requests,
    /** Ends every access token, as their 15 minutes would: next is a 401. */
    expireAccessTokens: () => accessTokens.clear(),
    /** Whether the relay honors this access token, as the live route checks. */
    acceptsToken: (accessToken: string) => accessTokens.has(accessToken),
  }
}
