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
  slots: Map<string, { writerPub: string; createdAt: number }>
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

export function createFakeRelay(now: () => number) {
  const inboxes = new Map<string, Inbox>()
  const invites = new Map<string, Invite>()
  const pushes: { inboxId: string; kind: string }[] = []
  /** Alerts a device would show: only kinds it registered a template for. */
  const alerts: { inboxId: string; deviceId: string; kind: string }[] = []
  /** Card and event writes per `inboxId|slotId` (60 per rolling hour). */
  const writes = new Map<string, number[]>()

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

  async function fetchImpl(url: string | URL | Request, init?: RequestInit) {
    const op = String(url).split('/buddies/v1/')[1]
    const body = JSON.parse(String(init?.body)) as { p: string; s?: string }
    const bytes = fromB64u(body.p)
    const payload = JSON.parse(fromUtf8(bytes)) as Record<string, never>
    const signedBy = (publicKey: string) =>
      body.s !== undefined &&
      ed25519Verify(
        fromB64u(body.s),
        concatBytes(utf8(`ww-buddies/v1\n${op}\n`), bytes),
        fromB64u(publicKey)
      )

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
      return ok()
    }

    if (op === 'inbox/register') {
      if (!signedBy(payload.ownerPub)) return fail(401, 'bad_signature')
      const existing = inboxes.get(payload.inboxId)
      if (existing && existing.ownerPub !== payload.ownerPub)
        return fail(409, 'conflict')
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
      return ok()
    }

    const inbox = inboxes.get(payload.inboxId)
    if (!inbox) return op === 'slot/leave' ? ok() : fail(404, 'not_found')

    if (['card/put', 'event/put', 'slot/leave'].includes(op)) {
      const slot = inbox.slots.get(payload.slotId)
      if (!slot) return op === 'slot/leave' ? ok() : fail(410, 'gone')
      if (!signedBy(slot.writerPub)) return fail(401, 'bad_signature')
      if (op === 'slot/leave') {
        clearSlot(inbox, payload.slotId)
        return ok()
      }
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

    if (!signedBy(inbox.ownerPub)) return fail(401, 'bad_signature')
    switch (op) {
      case 'inbox/sync': {
        const since = payload.since as number
        return ok({
          seq: inbox.seq,
          slots: [...inbox.slots].map(([slotId, slot]) => ({
            slotId,
            createdAt: slot.createdAt,
          })),
          cards: [...inbox.cards]
            .filter(([, card]) => card.seq > since)
            .map(([slotId, card]) => ({ slotId, ...card })),
          events: inbox.events.filter((event) => event.seq > since),
          roster:
            inbox.roster && inbox.roster.seq > since ? inbox.roster : null,
        })
      }
      case 'inbox/delete':
        for (const inviteId of inbox.openInvites) invites.delete(inviteId)
        inboxes.delete(payload.inboxId)
        return ok()
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
          inbox.openInvites.size >= 3 ||
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

  return { fetchImpl, inboxes, invites, pushes, alerts }
}
