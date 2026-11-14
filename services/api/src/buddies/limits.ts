import type { Environment } from '../types'
import { bytesToBase64Url, sha256Bytes } from '../crypto'
import type { BuddiesRouteOp } from './contracts'

/**
 * Anti-abuse limits for the Buddies relay, all in one place for tuning. They
 * exist only to stop scripted abuse (storage bloat, cost runaway, flooding
 * someone's inbox) and must never get in a real person's way, so each is sized
 * from the heaviest plausible legitimate use with at least 10× headroom. When
 * unsure, pick the more generous number.
 *
 * Every hit logs `buddies: limit hit` with the op and the limit's name only
 * (never ids, IPs, or nonces), so Workers Logs show what real traffic nears.
 */

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS
const MIB = 1_024 * 1_024

export const BUDDIES_ABUSE_LIMITS = {
  /**
   * Requests per minute per caller, checked in the Worker before any Durable
   * Object wakes. The caller is the session's account for a bearer request
   * (`buddiesAccountCallerKey`), else the client IP, IPv6 by /64
   * (`buddiesCallerKey`). Enforced by the `[[ratelimits]]` bindings in
   * `wrangler.toml` (repeated under `[env.beta]` and `[env.dev]`), which
   * `limits.test.ts` keeps equal to these numbers. The budgets were sized
   * per IP, so a whole household; one account gets the same, which is only
   * more generous.
   */
  edge: {
    /** Invite fetch + claim: ~3 calls per acceptance, ~4 people accepting at once on one Wi-Fi ≈ 12/min → 10×. */
    unsigned: { binding: 'BUDDIES_RATE_LIMITER', perMinute: 120 },
    /** Register: once per install, restore, or delete-all; a household restoring ~6 devices at once → 10×. */
    register: { binding: 'BUDDIES_REGISTER_LIMITER', perMinute: 60 },
    /** Sync + live (and successor reads, a handful per key change): a shown invite code polls every 3 s (≤ 40/min with refetches), ~60/min per busy household → 10×. */
    read: { binding: 'BUDDIES_READ_LIMITER', perMinute: 600 },
    /** Other signed ops: one edit of a shared recurring Plan fans out ~60 events, cards, and a roster → 10×. */
    write: { binding: 'BUDDIES_WRITE_LIMITER', perMinute: 600 },
    /** Photo uploads: a note's photos (each uploaded once, whoever it's shared with), ~6 a minute on one Wi-Fi → 10×. */
    blobPut: { binding: 'BUDDIES_BLOB_PUT_LIMITER', perMinute: 60 },
    /** Photo downloads: each buddy device fetches each photo once; a household opening a few shared Plans ≈ 60/min → 10×. */
    blobGet: { binding: 'BUDDIES_BLOB_GET_LIMITER', perMinute: 600 },
  },
  /** Signed registrations per caller (IP or account, as above) per rolling day: ~200 people starting Buddies on one assembly-hall Wi-Fi → 10×. */
  registrationsPerDay: 2_000,
  registrationWindowMs: DAY_MS,
  /** Stored events per slot (kept 30 days): a power user sharing every Plan from 3 devices sends ≤ ~900 a month → 11×. */
  slotEvents: 10_000,
  /** Stored event bytes per slot: those ~900 events at ~1.5 KB (some long notes) are ~1.4 MB → 11×. */
  slotEventBytes: 16 * MIB,
  /** Stored event bytes per inbox: 5 power-user buddies ≈ 7 MB → 18×; still 2.5 MiB a buddy at 10× today's buddy cap. */
  inboxEventBytes: 128 * MIB,
  /** Events per sync page (bounds rows read per call; never refuses): pages before the 4 MiB cap only below ~420-char events. */
  syncEvents: 10_000,
  /** Owner requests that take effect per inbox per window: ~10 devices, one polling an invite code, ≈ 1,000 → 10×. */
  ownerRequests: 10_000,
  /** Writer requests that take effect per slot per window: ≤ 60 writes/h plus retries and dedupes ≈ 100 → 10×. */
  writerRequests: 1_000,
  /** Signer windows match nonce retention, so the two caps above bound the nonce table. */
  signerWindowMs: 10 * MINUTE_MS,
  /**
   * Live (unexpired) photo blobs per inbox: a power user keeping 3 photos on
   * each of ~10 shared Plans at a time ≈ 30 → 10×. A blob is uploaded once
   * for all of a note's recipients.
   */
  inboxBlobs: 300,
  /** Live photo bytes per inbox: those ~30 photos at ~0.5 MiB ≈ 15 MiB → 10×. */
  inboxBlobBytes: 150 * MIB,
  /**
   * Photo uploads per inbox per rolling day, counting every `blob/put` that
   * writes the object (new blobs, and re-puts that extend an expiry): a busy
   * day attaching ~10 photos → 10×.
   */
  blobUploads: 100,
  blobUploadWindowMs: DAY_MS,
} as const

export type BuddiesEdgeTier = keyof typeof BUDDIES_ABUSE_LIMITS.edge

/** Seconds a client should wait after an edge limit: the limiter's period. */
export const EDGE_RETRY_AFTER_SECONDS = 60

const TIER_BY_OP: Partial<Record<BuddiesRouteOp, BuddiesEdgeTier>> = {
  'invite/fetch': 'unsigned',
  'invite/claim': 'unsigned',
  'inbox/register': 'register',
  'inbox/sync': 'read',
  'inbox/live': 'read',
  'inbox/successor': 'read',
  'blob/put': 'blobPut',
  'blob/get': 'blobGet',
}

/** The edge tier an op counts against; every other signed op is a write. */
export const buddiesEdgeTier = (op: BuddiesRouteOp): BuddiesEdgeTier =>
  TIER_BY_OP[op] ?? 'write'

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

const ipv4 = (value: string): string | null => {
  const match = IPV4.exec(value)
  if (!match) return null
  const octets = match.slice(1).map(Number)
  return octets.every((octet) => octet <= 255) ? octets.join('.') : null
}

/** The eight 16-bit groups of an IPv6 address, or null when it isn't one. */
const ipv6Groups = (value: string): number[] | null => {
  let text = value.replace(/%.*$/, '')
  // A trailing dotted IPv4 (`::ffff:192.0.2.1`) is the last two groups.
  const tail = /^(.*:)([^:]*\.[^:]*)$/.exec(text)
  if (tail) {
    const v4 = ipv4(tail[2])
    if (!v4) return null
    const [a, b, c, d] = v4.split('.').map(Number)
    const high = ((a << 8) | b).toString(16)
    const low = ((c << 8) | d).toString(16)
    text = `${tail[1]}${high}:${low}`
  }
  const halves = text.split('::')
  if (halves.length > 2) return null
  const parts = (half: string) => (half === '' ? [] : half.split(':'))
  const head = parts(halves[0])
  const rest = halves.length === 2 ? parts(halves[1]) : []
  const missing = 8 - head.length - rest.length
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null
  const groups = [...head, ...Array<string>(missing).fill('0'), ...rest]
  if (!groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) return null
  return groups.map((group) => parseInt(group, 16))
}

/**
 * The key a caller's pre-auth limits count against: the client IP, with IPv6
 * grouped by its /64 (a subscriber or LAN gets a whole /64, so per-address
 * keys would be free to rotate). IPv4-mapped IPv6 counts as the IPv4 address.
 * Pre-auth limits are keyed on the caller, never on the target inbox, so
 * nobody can spend someone else's budget.
 */
export const buddiesCallerKey = (ip: string | null | undefined): string => {
  const value = ip?.trim().toLowerCase()
  if (!value) return 'unknown'
  if (!value.includes(':')) return ipv4(value) ?? value
  const groups = ipv6Groups(value)
  if (!groups) return value
  const mapped =
    groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff
  if (mapped) {
    const [high, low] = [groups[6], groups[7]]
    return [high >> 8, high & 255, low >> 8, low & 255].join('.')
  }
  const prefix = groups.slice(0, 4).map((group) => group.toString(16))
  return `${prefix.join(':')}::/64`
}

const encoder = new TextEncoder()

/**
 * The key a bearer request's per-caller limits count against: a hash of the
 * session's account, so people behind one NAT stop sharing a budget and
 * neither the limiter nor a quota's name ever holds an account id. The
 * `account:` prefix keeps it apart from every IP key.
 */
export const buddiesAccountCallerKey = async (
  accountId: string
): Promise<string> =>
  `account:${bytesToBase64Url(
    await sha256Bytes(encoder.encode(`ww-buddies/v1/caller-account\n${accountId}`))
  )}`

/** Logs a limit hit for tuning: the op and the limit's name, nothing else. */
export const logLimitHit = (op: string, limit: string): void => {
  console.warn('buddies: limit hit', { op, limit })
}

const reportedOutages = new Set<BuddiesEdgeTier>()

/**
 * Counts this request against its op's per-caller edge limit. True when it
 * may proceed. If the limiter itself fails, requests go through (logged once
 * per isolate): the per-inbox caps in the Durable Objects still hold.
 * `logHit` logs a refusal (Shared Spaces logs its own op under its own
 * prefix).
 */
export const allowBuddiesCaller = async (
  env: Environment,
  op: BuddiesRouteOp,
  callerKey: string,
  logHit: (op: string, limit: string) => void = logLimitHit
): Promise<boolean> => {
  const tier = buddiesEdgeTier(op)
  const { binding } = BUDDIES_ABUSE_LIMITS.edge[tier]
  try {
    const { success } = await env[binding].limit({ key: callerKey })
    if (success) return true
  } catch {
    if (!reportedOutages.has(tier)) {
      reportedOutages.add(tier)
      console.warn('buddies: rate limiter unavailable; allowing', { tier })
    }
    return true
  }
  logHit(op, `edge.${tier}`)
  return false
}

/**
 * Signed requests that took effect, per signer (the owner, or one writer
 * slot), in fixed windows. In memory only: a Durable Object that restarts
 * starts counting again, which only ever errs toward allowing.
 */
export class SignerBudget {
  #windows = new Map<string, { start: number; used: number }>()

  constructor(readonly windowMs: number) {}

  /** Whether `signer` has room for one more request that takes effect. */
  allows(signer: string, limit: number, now: number): boolean {
    return this.#window(signer, now).used < limit
  }

  spend(signer: string, now: number): void {
    this.#window(signer, now).used++
  }

  /** Milliseconds until `signer`'s current window ends and its budget refills. */
  waitMs(signer: string, now: number): number {
    return this.#window(signer, now).start + this.windowMs - now
  }

  #window(signer: string, now: number) {
    const start = now - (now % this.windowMs)
    let window = this.#windows.get(signer)
    if (!window || window.start !== start) {
      // Finished windows go, so the map only holds signers active now.
      for (const [key, value] of this.#windows)
        if (value.start !== start) this.#windows.delete(key)
      window = { start, used: 0 }
      this.#windows.set(signer, window)
    }
    return window
  }
}

/**
 * Counts in a rolling window, oldest first: each bucket counts what happened
 * from its `start` (epoch ms), and leaves the window `windowMs` after it.
 */
export type WindowBucket = { start: number; count: number }

/**
 * How long until `adding` more fit beside `buckets` under `limit`: null when
 * they fit now, else the milliseconds until enough of the oldest buckets have
 * left the window (the whole window when even an empty one can't hold them).
 * `buckets` must already be pruned to the window. Buddies' rolling-day
 * quotas and Shared Spaces' put limits count this way.
 */
export const rollingWindowWaitMs = (
  buckets: readonly WindowBucket[],
  adding: number,
  limit: number,
  windowMs: number,
  now: number
): number | null => {
  let used = buckets.reduce((sum, bucket) => sum + bucket.count, 0)
  if (used + adding <= limit) return null
  for (const bucket of buckets) {
    used -= bucket.count
    if (used + adding <= limit) return bucket.start + windowMs - now
  }
  return windowMs
}
