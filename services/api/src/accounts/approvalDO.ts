import { DurableObject } from 'cloudflare:workers'
import type { Environment } from '../types'
import { sha256B64u, timingSafeEqual, tokenDigest } from '../crypto'
import {
  fail,
  ok,
  type BuddiesFailure,
  type BuddiesResult,
} from '../buddies/contracts'
import { ACCOUNT_LIMITS } from './contracts'
import { issueTicket } from './passkeyTokens'

/**
 * A channel's state (witness-work `docs/passkeys-protocol.md`, "Approving a
 * browser from a phone"): `open` (the browser shows the QR code) → `claimed`
 * (a phone scanned it) → `sent` (the phone sent the sealed key) → `done` (the
 * browser has it). `cancelled` from any of them, by either side or by five
 * wrong tokens.
 */
export type ApprovalStatus = 'open' | 'claimed' | 'sent' | 'done' | 'cancelled'

type Empty = Record<string, never>

/** The coarse location Cloudflare gives a request (`request.cf`); never an IP. */
export interface ApprovalLocation {
  city?: string
  region?: string
  country?: string
  latitude?: number
  longitude?: number
}

export interface OpenApprovalArgs {
  channelId: string
  verifier: string
  browserVerifier: string
  hello: string
  location: ApprovalLocation
}

export interface ClaimApprovalArgs {
  channelId: string
  claimToken: string
  phonePub: string
  accountId: string
  sessionId: string
  location: ApprovalLocation
}

export interface BrowserTokenArgs {
  channelId: string
  browserToken: string
}

export interface ApprovalClaimView {
  expiresAt: number
  hello: string
  location?: { city?: string; region?: string; country?: string }
  far: boolean
}

export interface ApprovalStatusView {
  status: ApprovalStatus
  expiresAt: number
  phonePub?: string
}

export interface ApprovalReceiveView {
  status: ApprovalStatus
  key?: string
  ticket?: string
  ticketExpiresAt?: number
}

type ChannelRow = {
  channelId: string
  verifier: string
  browserVerifier: string
  status: ApprovalStatus
  expiresAt: number
  badTokens: number
  hello: string | null
  location: string | null
  accountId: string | null
  sessionId: string | null
  sessionHash: string | null
  phonePub: string | null
  claimHash: string | null
  key: string | null
  keyHash: string | null
  ticket: string | null
  ticketExpiresAt: number | null
}

const SCHEMA = `CREATE TABLE IF NOT EXISTS channel (
  singleton         INTEGER PRIMARY KEY CHECK (singleton = 1),
  channel_id        TEXT NOT NULL,
  verifier          TEXT NOT NULL,
  browser_verifier  TEXT NOT NULL,
  status            TEXT NOT NULL,
  created_at        INTEGER NOT NULL,
  expires_at        INTEGER NOT NULL,
  bad_tokens        INTEGER NOT NULL,
  hello             TEXT,
  location          TEXT,
  account_id        TEXT,
  session_id        TEXT,
  session_hash      TEXT,
  phone_pub         TEXT,
  claim_hash        TEXT,
  key               TEXT,
  key_hash          TEXT,
  ticket            TEXT,
  ticket_expires_at INTEGER
)`

/**
 * One SQLite Durable Object per approval `channelId`, the handoff's relay
 * with the roles turned around: the browser opens it (no account yet) with
 * two verifiers (the phone's `claimToken`, its own `browserToken`), a sealed
 * hello, and its coarse location; a phone's session claims it with its
 * temporary public key; the phone sends the sealed account key; the browser
 * receives it with an `approval` ticket for the phone's account. A channel
 * lives 75 seconds unclaimed and 5 minutes from the claim; the alarm then
 * deletes everything. `done` and `cancel` drop the blobs, the location, the
 * key, the ticket, the account, and the session at once and keep only the
 * status and the verifiers until then; wrong tokens no longer count.
 *
 * Its own class rather than a mode of `AccountHandoff`: the two differ in who
 * opens and claims, how each side authenticates, the lifetimes, the location,
 * and the ticket, and a mode would put all of that behind one schema.
 *
 * Single-threaded, and nothing awaits between a read and its write except the
 * ticket's minting, which reads again after it; so the first valid claim
 * wins, and every `receive` gets the same ticket while it's valid.
 *
 * Privacy: nothing here logs ids, keys, tokens, blobs, or locations.
 */
export class AccountApproval extends DurableObject<Environment> {
  #schemaReady = false

  async open(args: OpenApprovalArgs): Promise<BuddiesResult<{ expiresAt: number }>> {
    const now = Date.now()
    const existing = this.#load()
    if (existing && now < existing.expiresAt) return fail('conflict')
    if (existing || this.#ready()) await this.#destroy()
    const expiresAt = now + ACCOUNT_LIMITS.approvalOpenMs
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(SCHEMA)
      this.#schemaReady = true
      this.ctx.storage.sql.exec(
        `INSERT INTO channel (singleton, channel_id, verifier, browser_verifier, status,
                              created_at, expires_at, bad_tokens, hello, location)
         VALUES (1, ?, ?, ?, 'open', ?, ?, 0, ?, ?)`,
        args.channelId,
        args.verifier,
        args.browserVerifier,
        now,
        expiresAt,
        args.hello,
        JSON.stringify(args.location)
      )
    })
    await this.ctx.storage.setAlarm(expiresAt)
    return ok({ expiresAt })
  }

  /** The phone's claim: the first valid one wins; its repeat is `ok` again. */
  async claim(args: ClaimApprovalArgs): Promise<BuddiesResult<ApprovalClaimView>> {
    // Hashed before reading the channel: from the read through marking it
    // claimed, nothing may await, or two claims could both see `open`.
    const [tokenHash, claimHash, sessionHash] = await Promise.all([
      tokenDigest(args.claimToken),
      sha256B64u(`${args.phonePub}\n${args.sessionId}`),
      sessionDigest(args.sessionId),
    ])
    const now = Date.now()
    const channel = this.#live(args.channelId, now)
    if (!channel) return fail('not_found')
    const refused = this.#checkToken(channel, channel.verifier, tokenHash)
    if (refused) return refused

    if (channel.status !== 'open') {
      const repeat =
        (channel.status === 'claimed' || channel.status === 'sent') &&
        channel.claimHash != null &&
        timingSafeEqual(claimHash, channel.claimHash)
      return repeat ? ok(claimView(channel, args.location)) : fail('conflict')
    }
    const expiresAt = now + ACCOUNT_LIMITS.approvalClaimedMs
    this.ctx.storage.sql.exec(
      `UPDATE channel SET status = 'claimed', account_id = ?, session_id = ?, session_hash = ?,
                          phone_pub = ?, claim_hash = ?, expires_at = ?
       WHERE singleton = 1`,
      args.accountId,
      args.sessionId,
      sessionHash,
      args.phonePub,
      claimHash,
      expiresAt
    )
    await this.ctx.storage.setAlarm(expiresAt)
    return ok(claimView({ ...channel, expiresAt }, args.location))
  }

  /** The browser's view. */
  async statusForBrowser(args: BrowserTokenArgs): Promise<BuddiesResult<ApprovalStatusView>> {
    const tokenHash = await tokenDigest(args.browserToken)
    const channel = this.#live(args.channelId, Date.now())
    if (!channel) return fail('not_found')
    const refused = this.#checkToken(channel, channel.browserVerifier, tokenHash)
    if (refused) return refused
    return ok(statusView(channel))
  }

  /** The claiming phone session's view, finished or not. */
  async statusForSession(
    channelId: string,
    sessionId: string
  ): Promise<BuddiesResult<ApprovalStatusView>> {
    const sessionHash = await sessionDigest(sessionId)
    const channel = this.#live(channelId, Date.now())
    if (!channel) return fail('not_found')
    if (!isClaimer(channel, sessionHash)) return fail('forbidden')
    return ok(statusView(channel))
  }

  /**
   * The claiming session sends the sealed key, once, while `claimed`; the
   * same key again is `ok` (a lost response). `fresh` says whether this call
   * stored it, for the activity entry; the route doesn't answer it.
   */
  async send(
    channelId: string,
    sessionId: string,
    key: string
  ): Promise<BuddiesResult<{ fresh: boolean }>> {
    const keyHash = await sha256B64u(key)
    const channel = this.#live(channelId, Date.now())
    if (!channel) return fail('not_found')
    if (channel.sessionId == null) return fail('conflict')
    if (channel.sessionId !== sessionId) return fail('forbidden')
    if (
      channel.status === 'sent' &&
      channel.keyHash != null &&
      timingSafeEqual(keyHash, channel.keyHash)
    )
      return ok({ fresh: false })
    if (channel.status !== 'claimed') return fail('conflict')
    this.ctx.storage.sql.exec(
      "UPDATE channel SET status = 'sent', key = ?, key_hash = ? WHERE singleton = 1",
      key,
      keyHash
    )
    return ok({ fresh: true })
  }

  /**
   * The browser polls for the key. While `sent`, the answer carries the key
   * and an `approval` ticket for the claiming session's account, minted at
   * the first `receive` and the same until it expires (then a new one).
   */
  async receive(args: BrowserTokenArgs): Promise<BuddiesResult<ApprovalReceiveView>> {
    const tokenHash = await tokenDigest(args.browserToken)
    const channel = this.#live(args.channelId, Date.now())
    if (!channel) return fail('not_found')
    const refused = this.#checkToken(channel, channel.browserVerifier, tokenHash)
    if (refused) return refused
    if (channel.status !== 'sent' || channel.key == null) return ok({ status: channel.status })
    if (hasTicket(channel)) return ok(receiveView(channel))

    const { ticket, claims } = await issueTicket(this.env, {
      kind: 'approval',
      accountId: channel.accountId!,
      channelId: channel.channelId,
      actorSessionId: channel.sessionId!,
    })
    // Minting awaited: another receive, a cancel, or the alarm may have run.
    const now = this.#live(args.channelId, Date.now())
    if (!now) return fail('not_found')
    if (now.status !== 'sent' || now.key == null) return ok({ status: now.status })
    if (hasTicket(now)) return ok(receiveView(now))
    this.ctx.storage.sql.exec(
      'UPDATE channel SET ticket = ?, ticket_expires_at = ? WHERE singleton = 1',
      ticket,
      claims.expiresAt
    )
    return ok(receiveView({ ...now, ticket, ticketExpiresAt: claims.expiresAt }))
  }

  /** The browser has the key: drop everything but the status. Repeating it is `ok`. */
  async done(args: BrowserTokenArgs): Promise<BuddiesResult<Empty>> {
    const tokenHash = await tokenDigest(args.browserToken)
    const channel = this.#live(args.channelId, Date.now())
    if (!channel) return fail('not_found')
    const refused = this.#checkToken(channel, channel.browserVerifier, tokenHash)
    if (refused) return refused
    if (channel.status === 'done') return ok({})
    if (channel.status !== 'sent') return fail('conflict')
    this.#finish('done')
    return ok({})
  }

  /** Either side ends the channel; idempotent, and a no-op once `done`. */
  async cancelByBrowser(args: BrowserTokenArgs): Promise<BuddiesResult<Empty>> {
    const tokenHash = await tokenDigest(args.browserToken)
    const channel = this.#live(args.channelId, Date.now())
    if (!channel) return fail('not_found')
    const refused = this.#checkToken(channel, channel.browserVerifier, tokenHash)
    if (refused) return refused
    if (channel.status !== 'done') this.#finish('cancelled')
    return ok({})
  }

  async cancelBySession(channelId: string, sessionId: string): Promise<BuddiesResult<Empty>> {
    const sessionHash = await sessionDigest(sessionId)
    const channel = this.#live(channelId, Date.now())
    if (!channel) return fail('not_found')
    if (!isClaimer(channel, sessionHash)) return fail('forbidden')
    if (channel.status !== 'done') this.#finish('cancelled')
    return ok({})
  }

  /** Deletes the channel at `expiresAt`. */
  async alarm(): Promise<void> {
    const channel = this.#load()
    if (!channel || Date.now() >= channel.expiresAt) {
      await this.#destroy()
      return
    }
    await this.ctx.storage.setAlarm(channel.expiresAt)
  }

  /**
   * Null when the token's hash matches `expected`. Otherwise, while the
   * channel is in progress, counts it (claim and browser tokens together),
   * and the fifth wrong one burns the channel (`cancelled`, everything but
   * the status and verifiers dropped). A finished channel (`done`,
   * `cancelled`) counts nothing and keeps its status.
   */
  #checkToken(channel: ChannelRow, expected: string, tokenHash: string): BuddiesFailure | null {
    if (timingSafeEqual(tokenHash, expected)) return null
    if (channel.status !== 'done' && channel.status !== 'cancelled') {
      if (channel.badTokens + 1 >= ACCOUNT_LIMITS.approvalBadTokens) this.#finish('cancelled')
      this.ctx.storage.sql.exec(
        'UPDATE channel SET bad_tokens = bad_tokens + 1 WHERE singleton = 1'
      )
    }
    return fail('bad_signature')
  }

  /**
   * Ends the channel: keeps only the status and the verifiers (the tokens',
   * and a hash of the claiming session so its phone can still read the
   * status) until the alarm. The account, the session, and every blob go.
   */
  #finish(status: 'done' | 'cancelled'): void {
    this.ctx.storage.sql.exec(
      `UPDATE channel SET status = ?, hello = NULL, location = NULL, account_id = NULL,
                          session_id = NULL, phone_pub = NULL, claim_hash = NULL, key = NULL,
                          key_hash = NULL, ticket = NULL, ticket_expires_at = NULL
       WHERE singleton = 1`,
      status
    )
  }

  #ready(): boolean {
    if (this.#schemaReady) return true
    this.#schemaReady =
      this.ctx.storage.sql
        .exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'channel'")
        .toArray().length > 0
    return this.#schemaReady
  }

  #load(): ChannelRow | null {
    if (!this.#ready()) return null
    return (
      this.ctx.storage.sql
        .exec<ChannelRow>(
          `SELECT channel_id AS channelId, verifier, browser_verifier AS browserVerifier,
                  status, expires_at AS expiresAt, bad_tokens AS badTokens, hello, location,
                  account_id AS accountId, session_id AS sessionId,
                  session_hash AS sessionHash, phone_pub AS phonePub,
                  claim_hash AS claimHash, key, key_hash AS keyHash, ticket,
                  ticket_expires_at AS ticketExpiresAt
           FROM channel WHERE singleton = 1`
        )
        .toArray()[0] ?? null
    )
  }

  /** Expired and unknown channels are both `not_found`. */
  #live(channelId: string, now: number): ChannelRow | null {
    const channel = this.#load()
    return channel && channel.channelId === channelId && now < channel.expiresAt
      ? channel
      : null
  }

  async #destroy(): Promise<void> {
    await this.ctx.storage.deleteAll()
    // Before compatibility date 2026-02-24, deleteAll() keeps the alarm.
    await this.ctx.storage.deleteAlarm()
    this.#schemaReady = false
  }
}

/** Whether `sessionHash` is the claiming session's (`sessionDigest`). */
const isClaimer = (channel: ChannelRow, sessionHash: string): boolean =>
  channel.sessionHash != null && timingSafeEqual(sessionHash, channel.sessionHash)

const hasTicket = (channel: ChannelRow): boolean =>
  channel.ticket != null &&
  channel.ticketExpiresAt != null &&
  Date.now() < channel.ticketExpiresAt

const receiveView = (channel: ChannelRow): ApprovalReceiveView => ({
  status: channel.status,
  key: channel.key!,
  ticket: channel.ticket!,
  ticketExpiresAt: channel.ticketExpiresAt!,
})

const statusView = (channel: ChannelRow): ApprovalStatusView => ({
  status: channel.status,
  expiresAt: channel.expiresAt,
  ...(channel.phonePub != null ? { phonePub: channel.phonePub } : {}),
})

const claimView = (channel: ChannelRow, phone: ApprovalLocation): ApprovalClaimView => {
  const browser = parseLocation(channel.location)
  const place = {
    ...(browser.city ? { city: browser.city } : {}),
    ...(browser.region ? { region: browser.region } : {}),
    ...(browser.country ? { country: browser.country } : {}),
  }
  return {
    expiresAt: channel.expiresAt,
    hello: channel.hello!,
    ...(Object.keys(place).length > 0 ? { location: place } : {}),
    far: isFar(browser, phone),
  }
}

const parseLocation = (text: string | null): ApprovalLocation => {
  try {
    const value = JSON.parse(text ?? '{}') as unknown
    return value && typeof value === 'object' ? (value as ApprovalLocation) : {}
  } catch {
    return {}
  }
}

const EARTH_RADIUS_KM = 6_371

/** Great-circle distance in kilometres. */
export const haversineKm = (
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number => {
  const rad = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = rad(b.latitude - a.latitude)
  const dLon = rad(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * `far`: another country, or more than 200 km apart; false when what it would
 * compare is unknown on either side.
 */
export const isFar = (browser: ApprovalLocation, phone: ApprovalLocation): boolean => {
  if (browser.country && phone.country && browser.country !== phone.country) return true
  if (
    browser.latitude != null &&
    browser.longitude != null &&
    phone.latitude != null &&
    phone.longitude != null
  )
    return (
      haversineKm(
        { latitude: browser.latitude, longitude: browser.longitude },
        { latitude: phone.latitude, longitude: phone.longitude }
      ) > ACCOUNT_LIMITS.approvalFarKm
    )
  return false
}

/** What the channel keeps of the claiming session once it's finished. */
const sessionDigest = (sessionId: string): Promise<string> =>
  sha256B64u(`ww-account/v1/approval-session\n${sessionId}`)
