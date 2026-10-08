import moment from 'moment'
import { fromB64u, fromUtf8, toB64u, utf8 } from '@/features/buddies/lib/bytes'
import { open, seal, sha256 } from '@/features/buddies/lib/crypto'
import {
  BuddyIdentity,
  deriveDirection,
  deriveIdentity,
  deriveInvite,
  derivePairSecret,
  DirectionKeys,
} from '@/features/buddies/lib/keys'
import {
  buildInviteLink,
  parseInviteSecret,
} from '@/features/buddies/lib/inviteLink'
import {
  isRelayError,
  OwnerAuth,
  PushTemplate,
  RelayClient,
  RelaySyncResponse,
  WriterAuth,
} from '@/features/buddies/lib/relay'
import {
  BuddyAvatar,
  BuddyCardDay,
  buddyCardSchema,
  BuddyStreak,
  joinRequestSchema,
  pairConfirmedSchema,
  PairingCard,
  pairingCardSchema,
  Roster,
  rosterSchema,
  shareCancelSchema,
  ShareInvite,
  shareInviteSchema,
  ShareReply,
  shareReplySchema,
  ShareType,
} from '@/features/buddies/lib/schemas'
import {
  BUDDY_CARD_HORIZON_DAYS,
  buildBuddyCardDays,
} from '@/features/buddies/lib/card'
import {
  awaitsAnswer,
  Buddy,
  BuddyProfile,
  BuddySharing,
  BuddiesState,
  BuddyNotification,
  cappedQueue,
  IncomingShare,
  incomingJoinRequestKey,
  JOIN_REQUEST_ALERTS_PER_DAY,
  JOIN_REQUEST_LEAD_MS,
  MAX_OPEN_JOIN_REQUESTS,
  OutgoingJoinRequest,
  incomingShareKey,
  initialBuddiesState,
  INVITE_TTL_MS,
  MAX_BUDDIES,
  mergeRemovedBuddies,
  withoutExpired,
  withPendingInvitesQueued,
  occupiedBuddySpots,
  OutgoingShareSpec,
  pairingEnded,
  PendingRemoval,
} from '@/features/buddies/lib/state'
import { DEFAULT_START_TIME_IN_MINUTES } from '@/lib/normalizeDate'
import type { RecurringPlan } from '@/lib/recurrence'
import type { DayPlan } from '@/types/timeEntry'

/**
 * Buddies client orchestration: pairing, sync, Buddy Card publishing, and
 * teardown, against the relay contract in docs/buddies-protocol.md. Every
 * dependency is injected so two engines can pair through an in-memory relay in
 * tests.
 */

type Store = {
  getState: () => BuddiesState
  setState: (
    partial:
      | Partial<BuddiesState>
      | ((state: BuddiesState) => Partial<BuddiesState>)
  ) => void
}

export type BuddiesEngineDeps = {
  relay: RelayClient
  store: Store
  randomBytes: (length: number) => Uint8Array
  now: () => number
  /** The iCloud Keychain root seed, created on first use. */
  getRootSeed: () => Uint8Array
  deleteRootSeed: () => void
  getPlans: () => { dayPlans: DayPlan[]; recurringPlans: RecurringPlan[] }
  /** Name, avatar, and Tenure as buddies should see them. */
  getProfile: () => BuddyProfile
  /**
   * The Service Streak, while it's long enough to show. Only Buddy Cards carry
   * it, never invites: a link can reach someone who isn't a buddy yet.
   */
  getStreak?: () => BuddyStreak | undefined
  /** The Plans and Follow-ups this User has invited buddies to. */
  getShares?: () => OutgoingShareSpec[]
}

export type BuddyInviteErrorReason =
  | 'invalid'
  | 'unavailable'
  | 'own'
  | 'alreadyBuddies'
  | 'limit'
  | 'nameRequired'

export class BuddyInviteError extends Error {
  constructor(readonly reason: BuddyInviteErrorReason) {
    super(`Buddy invite: ${reason}`)
    this.name = 'BuddyInviteError'
  }
}

/**
 * A removal (or delete-everything) that couldn't reach the relay. The buddy is
 * already gone on this device and the withdrawal is retried on every sync, but
 * they may keep seeing this User's Plans until it completes.
 */
export class BuddyRemovalPendingError extends Error {
  constructor(readonly scope: 'buddy' | 'everything') {
    super(`Buddy removal pending: ${scope}`)
    this.name = 'BuddyRemovalPendingError'
  }
}

/** Push kinds the relay may send; devices register a localized template each. */
export const BUDDY_PUSH_KINDS = [
  'invite.claimed',
  'pair.confirmed',
  'plan.invite',
  'plan.update',
  'plan.cancel',
  'followup.invite',
  'followup.update',
  'followup.cancel',
  'share.reply',
] as const
export type BuddyPushKind = (typeof BUDDY_PUSH_KINDS)[number]

/**
 * `registered`: the relay got a new or changed registration. `refreshed`: an
 * unchanged one was re-sent because it was over a day old, which also repairs a
 * device the relay dropped. `unchanged`: nothing was sent.
 */
export type PushRegistrationOutcome = 'registered' | 'refreshed' | 'unchanged'

/**
 * An unchanged registration is re-sent this often, so a device the relay
 * evicted or dropped for a rejected token starts receiving pushes again.
 */
export const PUSH_REGISTRATION_REFRESH_MS = 24 * 60 * 60 * 1000

const aad = {
  inviteCard: (inviteId: string) => `ww-buddies/v1/invite-card|${inviteId}`,
  claim: (inviteId: string) => `ww-buddies/v1/invite-claim|${inviteId}`,
  card: (inboxId: string, slotId: string) =>
    `ww-buddies/v1/card|${inboxId}|${slotId}`,
  event: (inboxId: string, slotId: string, eventId: string) =>
    `ww-buddies/v1/event|${inboxId}|${slotId}|${eventId}`,
  roster: (inboxId: string) => `ww-buddies/v1/roster|${inboxId}`,
}

/** The relay's event cap (8 KB sealed) minus the seal's version, nonce, and tag. */
const MAX_EVENT_PLAINTEXT_BYTES = 8 * 1024 - 29

/**
 * Share events (invites, changes, cancels, replies) per buddy per rolling hour.
 * The relay allows 60 writes per slot per hour, cards included, so an edit
 * storm on a shared Plan waits instead of crowding out Buddy Cards.
 */
const SHARE_EVENTS_PER_HOUR = 30
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

const SHARE_KIND_PREFIX: Record<ShareType, string> = {
  plan: 'plan',
  followUp: 'followup',
}

/**
 * A join request's kind ends in a tag for the pair (see `joinRequestKind`), so
 * a device can let one buddy's requests alert it and not another's.
 */
const JOIN_REQUEST_KIND_PREFIX = 'join.request.'
const JOIN_CANCEL_KIND = 'join.cancel'
export type JoinRequestPushKind = `${typeof JOIN_REQUEST_KIND_PREFIX}${string}`

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

/**
 * The kind of a join request written into `slotId`. Both people derive it from
 * the pair's slot, which the relay already knows, so the tag tells the relay
 * nothing new.
 */
function joinRequestKind(slotId: string): JoinRequestPushKind {
  const tag = sha256(utf8(`ww-buddies/v1/join-kind|${slotId}`)).slice(0, 6)
  return `${JOIN_REQUEST_KIND_PREFIX}${toHex(tag)}`
}

function shareTypeOfKind(kind: string): ShareType | null {
  const prefix = kind.split('.')[0]
  if (prefix === 'plan') return 'plan'
  if (prefix === 'followup') return 'followUp'
  return null
}

type PairKeys = { incoming: DirectionKeys; outgoing: DirectionKeys }
/** The relay event behind a queue entry. */
type EventSource = { id: string; seq: number }
type PairParty = Pick<Buddy, 'inboxId' | 'dhPub' | 'inviteSecret'>

function unionBy<T>(local: T[], remote: T[], key: (item: T) => string) {
  const seen = new Set(local.map(key))
  return [...local, ...remote.filter((item) => !seen.has(key(item)))]
}

/** What decides whether two rosters hold the same relationships and choices. */
function rosterSignature(
  roster: Pick<
    Roster,
    | 'buddies'
    | 'outgoingInvites'
    | 'incomingClaims'
    | 'closedInviteIds'
    | 'removedBuddies'
    | 'sharing'
  >
) {
  const { photo, tenure, streak, updatedAt } = roster.sharing
  return JSON.stringify([
    roster.buddies.map((b) => `${b.inboxId}:${b.status}`).sort(),
    roster.outgoingInvites.map((i) => i.inviteId).sort(),
    roster.incomingClaims.map((c) => c.inviteId).sort(),
    Object.keys(roster.closedInviteIds).sort(),
    Object.entries(roster.removedBuddies)
      .map(([inboxId, removedAt]) => `${inboxId}:${removedAt}`)
      .sort(),
    [photo, tenure, streak, updatedAt],
  ])
}

/**
 * Invites, claims, and events are too small for a photo, so they carry only an
 * emoji avatar; the thumbnail follows in the first Buddy Card.
 */
function compactAvatar(avatar: BuddyAvatar | undefined) {
  return avatar?.t === 'emoji' ? avatar : undefined
}

/** Profile fields for payloads without room for a photo. */
function compactProfile<T extends { avatar?: BuddyAvatar }>(value: T): T {
  return { ...value, avatar: compactAvatar(value.avatar) }
}

function omitKey<T>(record: Record<string, T>, key: string) {
  return Object.fromEntries(
    Object.entries(record).filter(([entryKey]) => entryKey !== key)
  )
}

/** `removedBuddies` with this buddy's current pairing recorded as ended. */
function endedPairing(
  state: BuddiesState,
  inboxId: string,
  removedAt?: number
) {
  const buddy = state.buddies.find((b) => b.inboxId === inboxId)
  if (!buddy) return state.removedBuddies
  return mergeRemovedBuddies(state.removedBuddies, {
    [inboxId]: Math.max(removedAt ?? buddy.pairedAt, buddy.pairedAt),
  })
}

/**
 * When a new pairing starts: after any removal this device knows of, so that
 * removal can't end it.
 */
function newPairedAt(state: BuddiesState, inboxId: string, now: number) {
  return Math.max(now, (state.removedBuddies[inboxId] ?? -1) + 1)
}

export function createBuddiesEngine(deps: BuddiesEngineDeps) {
  const { relay, store } = deps
  let cachedIdentity: { seed: string; identity: BuddyIdentity } | null = null
  const pairCache = new Map<string, PairKeys>()
  let syncInFlight: Promise<void> | null = null
  let syncQueued: Promise<void> | null = null
  /** Share events sent per buddy inboxId in the last hour. */
  const shareSends = new Map<string, number[]>()
  /** Slots added while a sync is in flight are missing from its response. */
  const slotsAddedDuringSync = new Set<string>()
  /** Join request deliveries run one after another. */
  let joinDelivery: Promise<void> = Promise.resolve()

  const json = (value: unknown) => utf8(JSON.stringify(value))
  const nonce = () => deps.randomBytes(12)
  const newId = () => toB64u(deps.randomBytes(16))
  const decode = (bytes: Uint8Array): unknown => JSON.parse(fromUtf8(bytes))

  function identity(): BuddyIdentity {
    const seed = deps.getRootSeed()
    const key = toB64u(seed)
    if (cachedIdentity?.seed !== key) {
      cachedIdentity = { seed: key, identity: deriveIdentity(seed) }
      pairCache.clear()
    }
    return cachedIdentity.identity
  }

  function ownerAuth(me: BuddyIdentity): OwnerAuth {
    return {
      inboxId: me.inboxId,
      ownerSeed: me.ownerSeed,
      ownerPub: me.ownerPub,
    }
  }

  function writerAuth(buddyInboxId: string, keys: DirectionKeys): WriterAuth {
    return {
      inboxId: buddyInboxId,
      slotId: keys.slotId,
      writerSeed: keys.writerSeed,
    }
  }

  function pairKeys(me: BuddyIdentity, party: PairParty): PairKeys {
    const cacheKey = `${me.inboxId}|${party.inboxId}|${party.dhPub}|${party.inviteSecret}`
    const cached = pairCache.get(cacheKey)
    if (cached) return cached
    const pairSecret = derivePairSecret(
      me.dhPrivate,
      fromB64u(party.dhPub),
      fromB64u(party.inviteSecret),
      me.inboxId,
      party.inboxId
    )
    const keys = {
      incoming: deriveDirection(pairSecret, me.inboxId),
      outgoing: deriveDirection(pairSecret, party.inboxId),
    }
    pairCache.set(cacheKey, keys)
    return keys
  }

  /** The Profile minus whatever the User chose not to share. */
  function profile(): BuddyProfile {
    const current = deps.getProfile()
    const { sharing } = store.getState()
    return {
      name: current.name.trim(),
      avatar: sharing.photo ? current.avatar : undefined,
      tenure: sharing.tenure ? current.tenure : undefined,
    }
  }

  function displayName(): string {
    return profile().name
  }

  function pairingCard(me: BuddyIdentity): PairingCard {
    return {
      v: 1,
      ...compactProfile(profile()),
      dhPub: me.dhPub,
      inboxId: me.inboxId,
      offer: { plans: 'daysTimes' },
    }
  }

  function nextColorIndex(
    used = new Set(store.getState().buddies.map((b) => b.colorIndex))
  ): number {
    for (let index = 0; index < MAX_BUDDIES; index++) {
      if (!used.has(index)) return index
    }
    return 0
  }

  async function ensureInbox(): Promise<BuddyIdentity> {
    const me = identity()
    if (store.getState().registeredInboxId !== me.inboxId) {
      await relay.registerInbox(ownerAuth(me))
      store.setState({
        registeredInboxId: me.inboxId,
        syncSeq: 0,
        pushRegistrationKey: null,
      })
    }
    return me
  }

  async function addSlot(me: BuddyIdentity, keys: DirectionKeys) {
    await relay.addSlot(ownerAuth(me), keys.slotId, keys.writerPub)
    slotsAddedDuringSync.add(keys.slotId)
  }

  /** Best effort: the next change or sync rewrites it. */
  async function saveRoster(me: BuddyIdentity) {
    const state = store.getState()
    const version = state.rosterVersion + 1
    const roster: Roster = {
      v: 1,
      version,
      // Photos would overflow the roster cap; each device gets them, and
      // streaks, from cards.
      buddies: state.buddies.map(({ streak, ...buddy }) =>
        compactProfile(buddy)
      ),
      outgoingInvites: state.outgoingInvites,
      incomingClaims: state.incomingClaims.map(compactProfile),
      closedInviteIds: state.closedInviteIds,
      removedBuddies: state.removedBuddies,
      sharing: state.sharing,
    }
    try {
      await relay.putRoster(
        ownerAuth(me),
        seal(me.rosterKey, json(roster), aad.roster(me.inboxId), nonce())
      )
      // Only a write the relay took counts; otherwise this device could
      // refuse another device's roster that is in fact newer.
      store.setState((current) => ({
        rosterVersion: Math.max(current.rosterVersion, version),
      }))
    } catch {
      // Offline or relay hiccup — the next sync that sees a different roster
      // on the relay writes the merged one back.
    }
  }

  /**
   * Also purges everything they shared with this User, and records the pairing
   * as ended so no roster brings it back. `removedAt` defaults to the pairing's
   * own `pairedAt`: when the relay says they left, this device may hold an
   * older pairing than one made since on another device.
   */
  function forgetBuddy(inboxId: string, removedAt?: number) {
    store.setState((state) => ({
      buddies: state.buddies.filter((b) => b.inboxId !== inboxId),
      removedBuddies: endedPairing(state, inboxId, removedAt),
      cards: omitKey(state.cards, inboxId),
      publishedCardHashes: omitKey(state.publishedCardHashes, inboxId),
      incomingShares: Object.fromEntries(
        Object.entries(state.incomingShares).filter(
          ([, share]) => share.from !== inboxId
        )
      ),
      outgoingShares: Object.fromEntries(
        Object.entries(state.outgoingShares).map(([key, share]) => [
          key,
          {
            ...share,
            sent: omitKey(share.sent, inboxId),
            sentTiming: omitKey(share.sentTiming ?? {}, inboxId),
          },
        ])
      ),
      shareReplies: Object.fromEntries(
        Object.entries(state.shareReplies).map(([shareId, replies]) => [
          shareId,
          omitKey(replies, inboxId),
        ])
      ),
      joinRequests: Object.fromEntries(
        Object.entries(state.joinRequests).filter(
          ([, request]) => request.from !== inboxId
        )
      ),
      askedToJoin: Object.fromEntries(
        Object.entries(state.askedToJoin).filter(
          ([, request]) => request.to !== inboxId
        )
      ),
      mutedJoinRequests: state.mutedJoinRequests.filter((id) => id !== inboxId),
      notifications: state.notifications.filter((n) => n.from !== inboxId),
    }))
  }

  function notify(entry: Omit<BuddyNotification, 'at' | 'read'>, read = false) {
    store.setState((state) => ({
      notifications: cappedQueue(
        [
          { ...entry, at: deps.now(), read },
          ...state.notifications.filter((n) => n.id !== entry.id),
        ],
        state
      ),
    }))
  }

  function dropInvite(inviteId: string) {
    store.setState((state) => ({
      closedInviteIds: {
        ...state.closedInviteIds,
        [inviteId]:
          state.outgoingInvites.find((i) => i.inviteId === inviteId)
            ?.expiresAt ??
          state.incomingClaims.find((c) => c.inviteId === inviteId)
            ?.expiresAt ??
          deps.now() + INVITE_TTL_MS,
      },
      outgoingInvites: state.outgoingInvites.filter(
        (invite) => invite.inviteId !== inviteId
      ),
      incomingClaims: state.incomingClaims.filter(
        (claim) => claim.inviteId !== inviteId
      ),
      notifications: state.notifications.filter((n) => n.inviteId !== inviteId),
    }))
  }

  function requireName() {
    if (!displayName()) throw new BuddyInviteError('nameRequired')
  }

  async function createInvite(): Promise<string> {
    requireName()
    if (occupiedBuddySpots(store.getState()) >= MAX_BUDDIES)
      throw new BuddyInviteError('limit')
    const me = await ensureInbox()
    const secret = deps.randomBytes(16)
    const invite = deriveInvite(secret)
    const createdAt = deps.now()
    const expiresAt = createdAt + INVITE_TTL_MS
    await relay.createInvite(ownerAuth(me), {
      inviteId: invite.inviteId,
      claimVerifier: invite.claimVerifier,
      blob: seal(
        invite.inviteKey,
        json(pairingCard(me)),
        aad.inviteCard(invite.inviteId),
        nonce()
      ),
      expiresAt,
    })
    store.setState((state) => ({
      outgoingInvites: [
        ...state.outgoingInvites,
        {
          inviteId: invite.inviteId,
          secret: toB64u(secret),
          createdAt,
          expiresAt,
        },
      ],
    }))
    await saveRoster(me)
    return buildInviteLink(secret)
  }

  function inviteLinkFor(inviteId: string): string | null {
    const invite = store
      .getState()
      .outgoingInvites.find((candidate) => candidate.inviteId === inviteId)
    return invite ? buildInviteLink(fromB64u(invite.secret)) : null
  }

  async function cancelInvite(inviteId: string) {
    const me = await ensureInbox()
    try {
      await relay.deleteInvite(ownerAuth(me), inviteId)
    } catch (error) {
      if (!isRelayError(error, 'not_found')) throw error
    }
    dropInvite(inviteId)
    await saveRoster(me)
  }

  async function readInvite(link: string) {
    const secret = parseInviteSecret(link)
    if (!secret) throw new BuddyInviteError('invalid')
    const invite = deriveInvite(secret)
    let fetched: Awaited<ReturnType<RelayClient['fetchInvite']>>
    try {
      fetched = await relay.fetchInvite(invite.inviteId)
    } catch (error) {
      if (isRelayError(error, 'not_found'))
        throw new BuddyInviteError('unavailable')
      throw error
    }
    let card: PairingCard
    try {
      card = pairingCardSchema.parse(
        decode(
          open(invite.inviteKey, fetched.blob, aad.inviteCard(invite.inviteId))
        )
      )
    } catch {
      throw new BuddyInviteError('invalid')
    }

    const me = identity()
    const state = store.getState()
    if (card.inboxId === me.inboxId) throw new BuddyInviteError('own')
    if (state.buddies.some((buddy) => buddy.inboxId === card.inboxId))
      throw new BuddyInviteError('alreadyBuddies')
    if (fetched.status !== 'open') throw new BuddyInviteError('unavailable')
    if (occupiedBuddySpots(state) >= MAX_BUDDIES)
      throw new BuddyInviteError('limit')
    return { secret, invite, card, expiresAt: fetched.expiresAt }
  }

  /** What the pre-accept screen shows. Creates no server state. */
  async function previewInvite(link: string) {
    const { card, expiresAt } = await readInvite(link)
    return {
      name: card.name,
      avatar: compactAvatar(card.avatar),
      tenure: card.tenure,
      expiresAt,
    }
  }

  /** Accepting shares nothing until the inviter confirms. */
  async function acceptInvite(link: string) {
    requireName()
    const { secret, invite, card, expiresAt } = await readInvite(link)
    const me = await ensureInbox()
    const party: PairParty = {
      inboxId: card.inboxId,
      dhPub: card.dhPub,
      inviteSecret: toB64u(secret),
    }
    const { incoming } = pairKeys(me, party)
    await addSlot(me, incoming)
    try {
      await relay.claimInvite(
        invite.inviteId,
        invite.claimSecret,
        seal(
          invite.inviteKey,
          json(pairingCard(me)),
          aad.claim(invite.inviteId),
          nonce()
        )
      )
    } catch (error) {
      await relay.removeSlot(ownerAuth(me), incoming.slotId).catch(() => {})
      if (isRelayError(error, 'conflict') || isRelayError(error, 'not_found'))
        throw new BuddyInviteError('unavailable')
      throw error
    }
    const colorIndex = nextColorIndex()
    store.setState((state) => ({
      buddies: [
        ...state.buddies,
        {
          ...party,
          name: card.name,
          avatar: compactAvatar(card.avatar),
          tenure: card.tenure,
          status: 'awaitingConfirm',
          pairedAt: newPairedAt(state, card.inboxId, deps.now()),
          colorIndex,
          showOnCalendar: true,
          expiresAt,
        },
      ],
      // Pairing again on purpose lifts an earlier removal.
      removedBuddies: omitKey(state.removedBuddies, card.inboxId),
      // Accepting a link is starting Buddies; skip the first-visit intro.
      onboardingComplete: true,
    }))
    await saveRoster(me)
    return { name: card.name }
  }

  async function confirmClaim(inviteId: string) {
    const state = store.getState()
    const claim = state.incomingClaims.find(
      (candidate) => candidate.inviteId === inviteId
    )
    if (!claim) return
    // Lapsed while still listed: it can't become a pairing anymore.
    if (claim.expiresAt <= deps.now()) {
      dropInvite(inviteId)
      throw new BuddyInviteError('unavailable')
    }
    requireName()
    const me = await ensureInbox()
    const buddy: Buddy = {
      inboxId: claim.inboxId,
      name: claim.name,
      avatar: claim.avatar,
      tenure: claim.tenure,
      dhPub: claim.dhPub,
      inviteSecret: claim.secret,
      status: 'active',
      pairedAt: newPairedAt(state, claim.inboxId, deps.now()),
      colorIndex: nextColorIndex(),
      showOnCalendar: true,
    }
    const { incoming, outgoing } = pairKeys(me, buddy)
    await addSlot(me, incoming)
    const eventId = newId()
    try {
      await relay.putEvent(writerAuth(buddy.inboxId, outgoing), {
        eventId,
        kind: 'pair.confirmed',
        blob: seal(
          outgoing.contentKey,
          json({ v: 1, ...compactProfile(profile()) }),
          aad.event(buddy.inboxId, outgoing.slotId, eventId),
          nonce()
        ),
        push: true,
      })
    } catch (error) {
      if (!isRelayError(error, 'gone')) throw error
      // Their request lapsed or they cancelled — undo our half of the pairing.
      await relay.removeSlot(ownerAuth(me), incoming.slotId).catch(() => {})
      await relay.deleteInvite(ownerAuth(me), inviteId).catch(() => {})
      dropInvite(inviteId)
      await saveRoster(me)
      throw new BuddyInviteError('unavailable')
    }
    store.setState((current) => ({
      buddies: [...current.buddies, buddy],
      // Pairing again on purpose lifts an earlier removal.
      removedBuddies: omitKey(current.removedBuddies, buddy.inboxId),
    }))
    dropInvite(inviteId)
    await relay.deleteInvite(ownerAuth(me), inviteId).catch(() => {})
    await saveRoster(me)
    await publishCards().catch(() => {})
  }

  async function rejectClaim(inviteId: string) {
    const me = await ensureInbox()
    await relay.deleteInvite(ownerAuth(me), inviteId).catch(() => {})
    dropInvite(inviteId)
    await saveRoster(me)
  }

  /** Forgets buddies locally and queues withdrawing their relay slots. */
  function queueRemoval(parties: PendingRemoval[], removedAt?: number) {
    const inboxIds = new Set(parties.map((party) => party.inboxId))
    for (const inboxId of inboxIds) forgetBuddy(inboxId, removedAt)
    store.setState((state) => ({
      pendingRemovals: [
        ...state.pendingRemovals.filter((p) => !inboxIds.has(p.inboxId)),
        ...parties.map(({ inboxId, dhPub, inviteSecret }) => ({
          inboxId,
          dhPub,
          inviteSecret,
        })),
      ],
    }))
  }

  /**
   * Removes their slot from my inbox and my slot (and last card) from theirs.
   * Both are idempotent, so a removal stays queued until both succeed.
   */
  async function flushRemovals(me: BuddyIdentity) {
    const missing = (error: unknown) =>
      isRelayError(error, 'not_found') || isRelayError(error, 'gone')
    for (const party of store.getState().pendingRemovals) {
      const { incoming, outgoing } = pairKeys(me, party)
      try {
        await relay
          .removeSlot(ownerAuth(me), incoming.slotId)
          .catch((error) => {
            if (!missing(error)) throw error
          })
        await relay
          .leaveSlot(writerAuth(party.inboxId, outgoing))
          .catch((error) => {
            if (!missing(error)) throw error
          })
      } catch {
        continue
      }
      store.setState((state) => ({
        pendingRemovals: state.pendingRemovals.filter(
          (p) => p.inboxId !== party.inboxId
        ),
      }))
    }
  }

  const isPendingRemoval = (inboxId: string) =>
    store.getState().pendingRemovals.some((p) => p.inboxId === inboxId)

  /** Ends the connection for both people; neither gets a notification. */
  async function removeBuddy(inboxId: string) {
    const buddy = store.getState().buddies.find((b) => b.inboxId === inboxId)
    if (!buddy) return
    const me = await ensureInbox()
    // Ends every pairing with them up to now, on all this User's devices.
    queueRemoval([buddy], deps.now())
    await flushRemovals(me)
    await saveRoster(me)
    if (isPendingRemoval(inboxId)) throw new BuddyRemovalPendingError('buddy')
  }

  function setShowOnCalendar(inboxId: string, showOnCalendar: boolean) {
    store.setState((state) => ({
      buddies: state.buddies.map((b) =>
        b.inboxId === inboxId ? { ...b, showOnCalendar } : b
      ),
    }))
  }

  /**
   * Saved to the roster so a restored device keeps it. Two buddies may share a
   * color; it's this User's choice. `null` goes back to the assigned slot
   * color.
   */
  async function setColor(inboxId: string, color: string | null) {
    store.setState((state) => ({
      buddies: state.buddies.map((b) =>
        b.inboxId === inboxId ? { ...b, color: color ?? undefined } : b
      ),
    }))
    await saveRoster(await ensureInbox())
  }

  /**
   * Saved to the roster so a restored device keeps it. A blank nickname goes
   * back to the buddy's own name.
   */
  async function setNickname(inboxId: string, nickname: string) {
    const trimmed = nickname.trim().slice(0, 60) || undefined
    store.setState((state) => ({
      buddies: state.buddies.map((b) =>
        b.inboxId === inboxId ? { ...b, nickname: trimmed } : b
      ),
    }))
    await saveRoster(await ensureInbox())
  }

  /**
   * Changes what buddies see and republishes, so their copy of a withheld photo
   * or Tenure clears. Before Buddies has started it only records the choice.
   */
  async function setSharing(change: Partial<Omit<BuddySharing, 'updatedAt'>>) {
    store.setState((state) => ({
      sharing: { ...state.sharing, ...change, updatedAt: deps.now() },
    }))
    if (store.getState().registeredInboxId === null) return
    const me = await ensureInbox()
    await saveRoster(me)
    await publishCards()
  }

  /** Publishes one Buddy Card per active buddy, skipping unchanged content. */
  async function publishCards() {
    const { name, avatar, tenure } = profile()
    const streak = store.getState().sharing.streak
      ? deps.getStreak?.()
      : undefined
    const active = store.getState().buddies.filter((b) => b.status === 'active')
    if (active.length === 0 || !name) return
    const me = identity()
    const { dayPlans, recurringPlans } = deps.getPlans()
    const days = buildBuddyCardDays(
      dayPlans,
      recurringPlans,
      new Date(deps.now())
    )
    const contentHash = toB64u(
      sha256(json({ name, avatar, tenure, streak, days }))
    )
    for (const buddy of active) {
      if (store.getState().publishedCardHashes[buddy.inboxId] === contentHash)
        continue
      const { outgoing } = pairKeys(me, buddy)
      const card = {
        v: 1,
        name,
        avatar,
        tenure,
        streak,
        updatedAt: deps.now(),
        level: 'daysTimes',
        days,
      }
      try {
        await relay.putCard(
          writerAuth(buddy.inboxId, outgoing),
          seal(
            outgoing.contentKey,
            json(card),
            aad.card(buddy.inboxId, outgoing.slotId),
            nonce()
          )
        )
        store.setState((state) => ({
          publishedCardHashes: {
            ...state.publishedCardHashes,
            [buddy.inboxId]: contentHash,
          },
        }))
      } catch (error) {
        if (!isRelayError(error, 'gone')) throw error
        forgetBuddy(buddy.inboxId)
      }
    }
  }

  function applyClaim(
    me: BuddyIdentity,
    event: RelaySyncResponse['events'][number]
  ) {
    const state = store.getState()
    const invite = state.outgoingInvites.find(
      (i) => i.inviteId === event.eventId
    )
    if (
      !invite ||
      state.incomingClaims.some((c) => c.inviteId === invite.inviteId)
    )
      return
    let card: PairingCard
    try {
      const { inviteKey } = deriveInvite(fromB64u(invite.secret))
      card = pairingCardSchema.parse(
        decode(open(inviteKey, event.blob, aad.claim(invite.inviteId)))
      )
    } catch {
      return
    }
    if (
      card.inboxId === me.inboxId ||
      state.buddies.some((buddy) => buddy.inboxId === card.inboxId)
    )
      return
    store.setState((current) => ({
      incomingClaims: [
        ...current.incomingClaims,
        {
          inviteId: invite.inviteId,
          secret: invite.secret,
          name: card.name,
          avatar: compactAvatar(card.avatar),
          tenure: card.tenure,
          dhPub: card.dhPub,
          inboxId: card.inboxId,
          receivedAt: deps.now(),
          expiresAt: invite.expiresAt,
        },
      ],
    }))
    notify({
      id: event.eventId,
      kind: 'claim',
      name: card.name,
      inviteId: invite.inviteId,
      seq: event.seq,
    })
  }

  function applyConfirmation(
    me: BuddyIdentity,
    event: RelaySyncResponse['events'][number]
  ): boolean {
    const buddy = store
      .getState()
      .buddies.find(
        (candidate) =>
          candidate.status === 'awaitingConfirm' &&
          pairKeys(me, candidate).incoming.slotId === event.slotId
      )
    if (!buddy) return false
    try {
      const { incoming } = pairKeys(me, buddy)
      const body = pairConfirmedSchema.parse(
        decode(
          open(
            incoming.contentKey,
            event.blob,
            aad.event(me.inboxId, event.slotId, event.eventId)
          )
        )
      )
      store.setState((state) => ({
        buddies: state.buddies.map((b) =>
          b.inboxId === buddy.inboxId
            ? {
                ...b,
                name: body.name,
                avatar: body.avatar ?? b.avatar,
                tenure: body.tenure,
                status: 'active',
                expiresAt: undefined,
              }
            : b
        ),
      }))
      notify({
        id: event.eventId,
        kind: 'paired',
        from: buddy.inboxId,
        name: body.name,
        seq: event.seq,
      })
      return true
    } catch {
      return false
    }
  }

  function applyCard(
    me: BuddyIdentity,
    card: RelaySyncResponse['cards'][number]
  ) {
    const buddy = store
      .getState()
      .buddies.find(
        (candidate) =>
          candidate.status === 'active' &&
          pairKeys(me, candidate).incoming.slotId === card.slotId
      )
    if (!buddy) return
    try {
      const { incoming } = pairKeys(me, buddy)
      const parsed = buddyCardSchema.parse(
        decode(
          open(
            incoming.contentKey,
            card.blob,
            aad.card(me.inboxId, card.slotId)
          )
        )
      )
      // A request for a Plan the buddy moved or dropped can't be seen or
      // answered anymore; it's taken back on the next delivery.
      withdrawJoinRequests(
        Object.values(store.getState().askedToJoin)
          .filter(
            (request) =>
              request.to === buddy.inboxId &&
              !request.withdrawn &&
              !parsed.days.some(
                (day) =>
                  day.d === request.d &&
                  day.p.some((plan) => plan.s === request.s)
              )
          )
          .map((request) => request.id)
      )
      store.setState((state) => ({
        cards: {
          ...state.cards,
          [buddy.inboxId]: {
            name: parsed.name,
            updatedAt: parsed.updatedAt,
            receivedAt: deps.now(),
            days: parsed.days,
          },
        },
        buddies: state.buddies.map((b) =>
          b.inboxId === buddy.inboxId
            ? {
                ...b,
                name: parsed.name,
                avatar: parsed.avatar,
                tenure: parsed.tenure,
                streak: parsed.streak,
              }
            : b
        ),
      }))
    } catch {
      // Undecryptable or malformed cards are dropped; the next publish replaces them.
    }
  }

  /** Stable per share, so every device of this User sends the same id. */
  function shareIdFor(me: BuddyIdentity, key: string): string {
    return toB64u(
      sha256(utf8(`ww-buddies/v1/share|${me.inboxId}|${key}`)).slice(0, 16)
    )
  }

  /**
   * Whether a buddy's hourly share-event budget has room; when it doesn't, the
   * send waits for a later publish. Kept in memory: best effort.
   */
  function hasShareBudget(inboxId: string): boolean {
    const since = deps.now() - HOUR_MS
    const recent = (shareSends.get(inboxId) ?? []).filter((at) => at > since)
    shareSends.set(inboxId, recent)
    return recent.length < SHARE_EVENTS_PER_HOUR
  }

  /** Only events the relay accepted count against the budget. */
  function spendShareBudget(inboxId: string) {
    shareSends.set(inboxId, [...(shareSends.get(inboxId) ?? []), deps.now()])
  }

  async function sendEvent(
    me: BuddyIdentity,
    buddy: Buddy,
    kind: string,
    body: unknown,
    push = true,
    eventId = newId()
  ) {
    const { outgoing } = pairKeys(me, buddy)
    await relay.putEvent(writerAuth(buddy.inboxId, outgoing), {
      eventId,
      kind,
      blob: seal(
        outgoing.contentKey,
        json(body),
        aad.event(buddy.inboxId, outgoing.slotId, eventId),
        nonce()
      ),
      push,
    })
  }

  /** Shortens the note until the invitation fits the relay's event cap. */
  function fitEvent(invite: ShareInvite): ShareInvite {
    let fitted = invite
    for (;;) {
      const over = json(fitted).length - MAX_EVENT_PLAINTEXT_BYTES
      const note = fitted.details.note
      if (over <= 0 || !note) return fitted
      // A character is at most 6 bytes of JSON (`\uXXXX`).
      const kept = note
        .slice(0, Math.max(0, note.length - Math.ceil(over / 6)))
        .replace(/[\uD800-\uDBFF]$/, '')
      fitted = {
        ...fitted,
        details: { ...fitted.details, note: kept || undefined },
      }
    }
  }

  /**
   * Brings every buddy's view of this User's shared Plans and Follow-ups in
   * line with the current data: invites new recipients, updates changed
   * details, and cancels removed recipients and deleted shares. Content is
   * hashed per recipient so an unchanged share sends nothing.
   */
  async function publishShares() {
    if (!deps.getShares || !displayName()) return
    const now = deps.now()
    const specs = deps.getShares().filter((spec) => spec.expiresAt > now)
    resolveJoinRequests(specs)
    const state = store.getState()
    if (specs.length === 0 && Object.keys(state.outgoingShares).length === 0)
      return
    const me = identity()
    const activeBuddy = (inboxId: string) =>
      store
        .getState()
        .buddies.find((b) => b.inboxId === inboxId && b.status === 'active')
    let failure: unknown = null

    /** Sends one event; false when it should be retried on the next publish. */
    const deliver = async (
      inboxId: string,
      kind: string,
      body: unknown,
      push = true
    ) => {
      const buddy = activeBuddy(inboxId)
      if (!buddy) return true
      if (!hasShareBudget(inboxId)) return false
      try {
        await sendEvent(me, buddy, kind, body, push)
        spendShareBudget(inboxId)
        return true
      } catch (error) {
        if (isRelayError(error, 'gone')) {
          forgetBuddy(inboxId)
          return true
        }
        failure ??= error
        return false
      }
    }

    const saveSent = (
      key: string,
      share: BuddiesState['outgoingShares'][string] | null
    ) =>
      store.setState((current) => ({
        outgoingShares: share
          ? { ...current.outgoingShares, [key]: share }
          : omitKey(current.outgoingShares, key),
      }))

    for (const spec of specs) {
      const shareId = shareIdFor(me, spec.key)
      const prefix = SHARE_KIND_PREFIX[spec.type]
      const hash = toB64u(
        sha256(
          json({
            type: spec.type,
            details: spec.details,
            expiresAt: spec.expiresAt,
          })
        )
      )
      // Only a change to when or where pushes; a new title or note arrives
      // quietly, sparing the relay's daily push budget for what matters.
      const { d, s, m, location } = spec.details
      const timing = toB64u(sha256(json({ d, s, m, location })))
      const recipients = new Set(spec.recipients.filter(activeBuddy))
      const previous = store.getState().outgoingShares[spec.key]
      const sent = { ...previous?.sent }
      const sentTiming = { ...previous?.sentTiming }
      const body = fitEvent({
        v: 1,
        id: shareId,
        rev: now,
        type: spec.type,
        expiresAt: spec.expiresAt,
        details: spec.details,
      })
      for (const inboxId of recipients) {
        if (sent[inboxId] === hash) continue
        const update = sent[inboxId] !== undefined
        const kind = `${prefix}.${update ? 'update' : 'invite'}`
        const push = !update || sentTiming[inboxId] !== timing
        if (await deliver(inboxId, kind, body, push)) {
          sent[inboxId] = hash
          sentTiming[inboxId] = timing
        }
      }
      for (const inboxId of Object.keys(sent)) {
        if (recipients.has(inboxId)) continue
        const cancel = { v: 1, id: shareId, rev: now }
        if (await deliver(inboxId, `${prefix}.cancel`, cancel)) {
          delete sent[inboxId]
          delete sentTiming[inboxId]
        }
      }
      saveSent(spec.key, {
        shareId,
        type: spec.type,
        expiresAt: spec.expiresAt,
        sent,
        sentTiming,
      })
    }

    const wanted = new Set(specs.map((spec) => spec.key))
    for (const [key, share] of Object.entries(
      store.getState().outgoingShares
    )) {
      if (wanted.has(key)) continue
      const sent = { ...share.sent }
      if (share.expiresAt > now) {
        const cancel = { v: 1, id: share.shareId, rev: now }
        for (const inboxId of Object.keys(sent)) {
          const kind = `${SHARE_KIND_PREFIX[share.type]}.cancel`
          if (await deliver(inboxId, kind, cancel)) delete sent[inboxId]
        }
      }
      saveSent(
        key,
        share.expiresAt > now && Object.keys(sent).length > 0
          ? { ...share, sent }
          : null
      )
    }
    if (failure) throw failure
  }

  /** The buddy whose incoming slot delivered an event, if still active. */
  function senderOf(me: BuddyIdentity, slotId: string): Buddy | undefined {
    return store
      .getState()
      .buddies.find(
        (candidate) =>
          candidate.status === 'active' &&
          pairKeys(me, candidate).incoming.slotId === slotId
      )
  }

  function openEvent(
    me: BuddyIdentity,
    buddy: Buddy,
    event: RelaySyncResponse['events'][number]
  ): unknown {
    return decode(
      open(
        pairKeys(me, buddy).incoming.contentKey,
        event.blob,
        aad.event(me.inboxId, event.slotId, event.eventId)
      )
    )
  }

  function applyShareEvent(
    me: BuddyIdentity,
    event: RelaySyncResponse['events'][number]
  ) {
    const buddy = senderOf(me, event.slotId)
    if (!buddy) return
    const action = event.kind.split('.')[1]
    try {
      const body = openEvent(me, buddy, event)
      const source = { id: event.eventId, seq: event.seq }
      if (event.kind === 'share.reply') {
        applyReply(buddy, source, shareReplySchema.parse(body))
      } else if (action === 'cancel') {
        const cancel = shareCancelSchema.parse(body)
        applyCancel(buddy, source, cancel.id, cancel.rev)
      } else if (action === 'invite' || action === 'update') {
        const invite = shareInviteSchema.parse(body)
        if (invite.type !== shareTypeOfKind(event.kind)) return
        applyInvite(buddy, source, invite)
      }
    } catch {
      // Undecryptable or malformed events are dropped.
    }
  }

  function applyInvite(buddy: Buddy, source: EventSource, invite: ShareInvite) {
    if (invite.expiresAt <= deps.now()) return
    const key = incomingShareKey(buddy.inboxId, invite.id)
    const existing = store.getState().incomingShares[key]
    if (existing && existing.rev >= invite.rev) return
    const reopened = !existing || existing.status === 'cancelled'
    const changed =
      reopened ||
      JSON.stringify(existing.details) !== JSON.stringify(invite.details)
    const share: IncomingShare = {
      from: buddy.inboxId,
      shareId: invite.id,
      type: invite.type,
      rev: invite.rev,
      details: invite.details,
      expiresAt: invite.expiresAt,
      receivedAt: deps.now(),
      status: reopened ? 'pending' : existing.status,
      unsentReplyRev: reopened ? undefined : existing.unsentReplyRev,
    }
    store.setState((state) => ({
      incomingShares: { ...state.incomingShares, [key]: share },
      // Being invited that day answers this User's request to join.
      askedToJoin:
        invite.type === 'plan'
          ? Object.fromEntries(
              Object.entries(state.askedToJoin).filter(
                ([, request]) =>
                  request.to !== buddy.inboxId || request.d !== invite.details.d
              )
            )
          : state.askedToJoin,
    }))
    if (!changed) return
    // A change to an invitation not yet seen is still news of an invitation.
    const unseenInvite = store
      .getState()
      .notifications.some(
        (n) => n.shareKey === key && n.kind === 'shareInvite' && !n.read
      )
    // One entry per share: the latest invite or change replaces older ones.
    store.setState((state) => ({
      notifications: state.notifications.filter(
        (n) => n.shareKey !== key || n.kind === 'shareReply'
      ),
    }))
    notify({
      ...source,
      kind: reopened || unseenInvite ? 'shareInvite' : 'shareUpdate',
      from: buddy.inboxId,
      name: buddy.name,
      shareKey: key,
      shareType: invite.type,
    })
  }

  function applyCancel(
    buddy: Buddy,
    source: EventSource,
    shareId: string,
    rev: number
  ) {
    const key = incomingShareKey(buddy.inboxId, shareId)
    const existing = store.getState().incomingShares[key]
    // A cancel wins a tie with the invite it follows.
    if (!existing || existing.rev > rev || existing.status === 'cancelled')
      return
    store.setState((state) => ({
      incomingShares: {
        ...state.incomingShares,
        [key]: { ...existing, rev, status: 'cancelled' },
      },
      notifications: state.notifications.filter((n) => n.shareKey !== key),
    }))
    notify({
      ...source,
      kind: 'shareCancel',
      from: buddy.inboxId,
      name: buddy.name,
      shareKey: key,
      shareType: existing.type,
    })
  }

  function applyReply(
    buddy: Buddy,
    source: EventSource,
    reply: { id: string; rev: number; status: ShareReply }
  ) {
    const previous = store.getState().shareReplies[reply.id]?.[buddy.inboxId]
    if (previous && previous.rev >= reply.rev) return
    const share = Object.values(store.getState().outgoingShares).find(
      (candidate) => candidate.shareId === reply.id
    )
    store.setState((state) => ({
      shareReplies: {
        ...state.shareReplies,
        [reply.id]: {
          ...state.shareReplies[reply.id],
          [buddy.inboxId]: {
            status: reply.status,
            rev: reply.rev,
            at: deps.now(),
          },
        },
      },
      notifications: state.notifications.filter(
        (n) =>
          !(
            n.kind === 'shareReply' &&
            n.shareKey === reply.id &&
            n.from === buddy.inboxId
          )
      ),
    }))
    notify({
      ...source,
      kind: 'shareReply',
      from: buddy.inboxId,
      name: buddy.name,
      shareKey: reply.id,
      shareType: share?.type,
      reply: reply.status,
    })
  }

  /**
   * Answers a buddy's invitation; "going" is what adds the linked Plan. The
   * answer is saved first, so it holds offline, and sent when the relay is
   * reachable — now or on a later sync. With `holdMs` it waits that long first,
   * so the User can still change it; answering again restarts the wait.
   */
  async function replyToShare(
    key: string,
    status: ShareReply,
    { holdMs = 0 }: { holdMs?: number } = {}
  ) {
    const share = store.getState().incomingShares[key]
    if (!share || share.status === 'cancelled') return
    const now = deps.now()
    store.setState((state) => ({
      incomingShares: {
        ...state.incomingShares,
        [key]: {
          ...share,
          status,
          unsentReplyRev: now,
          replySendAt: holdMs > 0 ? now + holdMs : undefined,
        },
      },
      notifications: state.notifications.map((n) =>
        n.shareKey === key ? { ...n, read: true } : n
      ),
    }))
    if (holdMs > 0) return
    await deliverReplies().catch(() => {
      // Saved; retried on the next sync.
    })
  }

  /** Sends held answers now, e.g. as the app leaves the foreground. */
  async function sendHeldReplies() {
    store.setState((state) => ({
      incomingShares: Object.fromEntries(
        Object.entries(state.incomingShares).map(([key, share]) => [
          key,
          share.replySendAt === undefined
            ? share
            : { ...share, replySendAt: undefined },
        ])
      ),
    }))
    await deliverReplies()
  }

  /** Sends the answers that haven't reached their buddy yet and are due. */
  async function deliverReplies() {
    const now = deps.now()
    const unsent = Object.entries(store.getState().incomingShares).filter(
      ([, share]) =>
        share.unsentReplyRev !== undefined &&
        (share.replySendAt === undefined || share.replySendAt <= now)
    )
    if (unsent.length === 0) return
    const me = await ensureInbox()
    const markSent = (key: string, rev: number) =>
      store.setState((state) => {
        const current = state.incomingShares[key]
        // A newer answer given meanwhile still needs sending.
        if (current?.unsentReplyRev !== rev) return state
        return {
          incomingShares: {
            ...state.incomingShares,
            [key]: {
              ...current,
              unsentReplyRev: undefined,
              replySendAt: undefined,
            },
          },
        }
      })
    let failure: unknown = null
    for (const [key, share] of unsent) {
      const rev = share.unsentReplyRev!
      const buddy = store
        .getState()
        .buddies.find((b) => b.inboxId === share.from && b.status === 'active')
      if (
        !buddy ||
        share.status === 'pending' ||
        share.status === 'cancelled'
      ) {
        markSent(key, rev)
        continue
      }
      // Stays unsent until the hourly budget allows; retried on every sync.
      if (!hasShareBudget(buddy.inboxId)) continue
      try {
        await sendEvent(me, buddy, 'share.reply', {
          v: 1,
          id: share.shareId,
          rev,
          status: share.status,
        })
        spendShareBudget(buddy.inboxId)
        markSent(key, rev)
      } catch (error) {
        if (isRelayError(error, 'gone')) forgetBuddy(buddy.inboxId)
        else failure ??= error
      }
    }
    if (failure) throw failure
  }

  /** Stable per buddy and Plan, so asking again for the same Plan is a no-op. */
  function joinRequestIdFor(
    me: BuddyIdentity,
    to: string,
    d: string,
    s: number | undefined
  ): string {
    return toB64u(
      sha256(
        utf8(`ww-buddies/v1/join|${me.inboxId}|${to}|${d}|${s ?? ''}`)
      ).slice(0, 16)
    )
  }

  /**
   * Asks a buddy to invite this User to their Plan, as seen on their Buddy
   * Card. Saved first, so it holds offline, and sent now or on a later sync.
   * The buddy answers by inviting, or not at all: nothing tells this User a
   * request was passed over, and it lapses when the Plan starts. Only the first
   * ask for a Plan alerts the buddy; asking again after withdrawing arrives
   * quietly.
   */
  async function askToJoin(
    to: string,
    d: string,
    plan: BuddyCardDay['p'][number],
    expiresAt: number
  ) {
    if (expiresAt - deps.now() < JOIN_REQUEST_LEAD_MS) return
    const me = await ensureInbox()
    const id = joinRequestIdFor(me, to, d, plan.s)
    store.setState((state) => {
      const existing = state.askedToJoin[id]
      if (existing && !existing.withdrawn) return state
      const open = Object.values(state.askedToJoin).filter(
        (request) => request.to === to && !request.withdrawn
      )
      if (open.length >= MAX_OPEN_JOIN_REQUESTS) return state
      const rev = nextRev(existing)
      return {
        askedToJoin: {
          ...state.askedToJoin,
          [id]: existing
            ? { ...existing, withdrawn: undefined, rev }
            : {
                to,
                id,
                d,
                ...(plan.s === undefined ? {} : { s: plan.s }),
                m: plan.m,
                expiresAt,
                askedAt: rev,
                rev,
                attempted: false,
                pushed: false,
              },
        },
      }
    })
    await deliverJoinRequests().catch(() => {
      // Saved; retried on the next sync.
    })
  }

  /** Always newer than the last ask or withdrawal, even within a millisecond. */
  function nextRev(request: OutgoingJoinRequest | undefined) {
    return Math.max(deps.now(), (request?.rev ?? 0) + 1)
  }

  /** Takes back a request; the buddy's tray drops it quietly. */
  async function withdrawJoinRequest(id: string) {
    withdrawJoinRequests([id])
    await deliverJoinRequests().catch(() => {
      // Saved; retried on the next sync.
    })
  }

  /** Marks requests withdrawn, keeping them until they lapse. */
  function withdrawJoinRequests(ids: string[]) {
    store.setState((state) => {
      const askedToJoin = { ...state.askedToJoin }
      for (const id of ids) {
        const request = askedToJoin[id]
        if (request && !request.withdrawn)
          askedToJoin[id] = {
            ...request,
            withdrawn: true,
            rev: nextRev(request),
          }
      }
      return { askedToJoin }
    })
  }

  /**
   * Whether sending this request alerts the buddy: only its first ask, or a
   * retry of that same ask, and only `JOIN_REQUEST_ALERTS_PER_DAY` requests per
   * buddy a day. An ask whose alert may already have landed, then was withdrawn
   * and asked again, goes quietly.
   */
  function shouldAlert(request: OutgoingJoinRequest): boolean {
    if (request.pushed) return false
    if (request.alertRev !== undefined) return request.alertRev === request.rev
    const since = deps.now() - DAY_MS
    const alerted = Object.values(store.getState().askedToJoin).filter(
      (other) =>
        other.to === request.to &&
        other.id !== request.id &&
        other.alertRev !== undefined &&
        other.alertRev > since
    )
    return alerted.length < JOIN_REQUEST_ALERTS_PER_DAY
  }

  /**
   * Sends requests and withdrawals that haven't reached their buddy yet, one
   * delivery at a time, so asking, withdrawing, and syncing can't race.
   */
  function deliverJoinRequests(): Promise<void> {
    const run = joinDelivery.then(sendJoinRequests)
    joinDelivery = run.catch(() => {
      // The caller sees the failure; the queue moves on.
    })
    return run
  }

  async function sendJoinRequests() {
    const waiting = Object.values(store.getState().askedToJoin).filter(
      (request) => request.sentRev !== request.rev
    )
    if (waiting.length === 0) return
    const me = await ensureInbox()
    const update = (
      id: string,
      change: (current: OutgoingJoinRequest) => Partial<OutgoingJoinRequest>
    ) =>
      store.setState((state) => {
        const current = state.askedToJoin[id]
        if (!current) return state
        return {
          askedToJoin: {
            ...state.askedToJoin,
            [id]: { ...current, ...change(current) },
          },
        }
      })
    // A newer ask or withdrawal made meanwhile still needs sending.
    const markSent = (id: string, rev: number) =>
      update(id, (current) => (current.rev === rev ? { sentRev: rev } : {}))
    let failure: unknown = null
    for (const waitingRequest of waiting) {
      let request = waitingRequest
      const buddy = store
        .getState()
        .buddies.find((b) => b.inboxId === request.to && b.status === 'active')
      if (!buddy) {
        store.setState((state) => ({
          askedToJoin: omitKey(state.askedToJoin, request.id),
        }))
        continue
      }
      // Still unsent this close to the start: too late to be any use, so
      // it's taken back (quietly, in case an earlier try landed).
      if (
        !request.withdrawn &&
        request.expiresAt - deps.now() < JOIN_REQUEST_LEAD_MS
      ) {
        withdrawJoinRequests([request.id])
        request = store.getState().askedToJoin[request.id]
      }
      // Never reached the relay: there's nothing to take back.
      if (request.withdrawn && !request.attempted) {
        markSent(request.id, request.rev)
        continue
      }
      // Waits for the hourly budget; retried on every sync.
      if (!hasShareBudget(buddy.inboxId)) continue
      try {
        if (request.withdrawn) {
          const cancel = { v: 1, id: request.id, rev: request.rev }
          await sendEvent(me, buddy, JOIN_CANCEL_KIND, cancel, false)
        } else {
          const alert = shouldAlert(request)
          const eventId = alert ? (request.alertEventId ?? newId()) : newId()
          // Recorded first: a send that seems to fail may still have landed,
          // and a retry of the alert reuses its event id.
          update(request.id, () => ({
            attempted: true,
            ...(alert ? { alertEventId: eventId, alertRev: request.rev } : {}),
          }))
          const { slotId } = pairKeys(me, buddy).outgoing
          await sendEvent(
            me,
            buddy,
            joinRequestKind(slotId),
            {
              v: 1,
              id: request.id,
              rev: request.rev,
              d: request.d,
              ...(request.s === undefined ? {} : { s: request.s }),
              m: request.m,
              expiresAt: request.expiresAt,
            },
            alert,
            eventId
          )
          if (alert) update(request.id, () => ({ pushed: true }))
        }
        spendShareBudget(buddy.inboxId)
        markSent(request.id, request.rev)
      } catch (error) {
        if (isRelayError(error, 'gone')) forgetBuddy(buddy.inboxId)
        else failure ??= error
      }
    }
    if (failure) throw failure
  }

  function applyJoinEvent(
    me: BuddyIdentity,
    event: RelaySyncResponse['events'][number]
  ) {
    const buddy = senderOf(me, event.slotId)
    if (!buddy) return
    try {
      const body = openEvent(me, buddy, event)
      if (event.kind === JOIN_CANCEL_KIND) {
        const cancel = shareCancelSchema.parse(body)
        const key = incomingJoinRequestKey(buddy.inboxId, cancel.id)
        const existing = store.getState().joinRequests[key]
        // A withdrawal wins a tie with the request it follows.
        if (!existing || existing.rev > cancel.rev) return
        // Kept until it lapses, so asking again is listed quietly.
        store.setState((state) => ({
          joinRequests: {
            ...state.joinRequests,
            [key]: { ...existing, rev: cancel.rev, withdrawn: true },
          },
          notifications: state.notifications.filter((n) => n.shareKey !== key),
        }))
        return
      }
      const request = joinRequestSchema.parse(body)
      // The Plan's start here, whatever the asker's clock says: a request
      // lapses by then (a day's slack for time zones) and can't reach past
      // the Buddy Card's window.
      const start = moment(request.d, 'YYYY-MM-DD')
        .startOf('day')
        .add(request.s ?? DEFAULT_START_TIME_IN_MINUTES, 'minutes')
        .valueOf()
      const expiresAt = Math.min(request.expiresAt, start + DAY_MS)
      if (expiresAt <= deps.now()) return
      if (start > deps.now() + (BUDDY_CARD_HORIZON_DAYS + 1) * DAY_MS) return
      const key = incomingJoinRequestKey(buddy.inboxId, request.id)
      const existing = store.getState().joinRequests[key]
      if (existing && existing.rev >= request.rev) return
      store.setState((state) => ({
        joinRequests: {
          ...state.joinRequests,
          [key]: {
            from: buddy.inboxId,
            id: request.id,
            rev: request.rev,
            d: request.d,
            ...(request.s === undefined ? {} : { s: request.s }),
            ...(request.m === undefined ? {} : { m: request.m }),
            expiresAt,
            receivedAt: existing?.receivedAt ?? deps.now(),
            ...(existing?.dismissed ? { dismissed: true } : {}),
          },
        },
      }))
      // Listed once; a request this User passed over stays quiet, and one
      // asked again after a withdrawal comes back already read.
      if (existing && !existing.withdrawn) return
      if (existing?.dismissed) return
      const { joinRequestNotifications, mutedJoinRequests } = store.getState()
      notify(
        {
          id: event.eventId,
          seq: event.seq,
          kind: 'joinRequest',
          from: buddy.inboxId,
          name: buddy.name,
          shareKey: key,
        },
        // Alerts off for this buddy: listed, but it doesn't call for attention.
        !!existing ||
          !joinRequestNotifications ||
          mutedJoinRequests.includes(buddy.inboxId)
      )
    } catch {
      // Undecryptable or malformed events are dropped.
    }
  }

  /**
   * Not Now: clears a buddy's request here without telling them. It lapses on
   * their side when the Plan starts, like any request not answered.
   */
  function dismissJoinRequest(key: string) {
    const request = store.getState().joinRequests[key]
    if (!request) return
    store.setState((state) => ({
      joinRequests: {
        ...state.joinRequests,
        [key]: { ...request, dismissed: true },
      },
      notifications: state.notifications.filter((n) => n.shareKey !== key),
    }))
  }

  /** A request is answered once this User invites the buddy to a Plan that day. */
  function resolveJoinRequests(specs: OutgoingShareSpec[]) {
    const answered = Object.entries(store.getState().joinRequests)
      .filter(([, request]) =>
        specs.some(
          (spec) =>
            spec.type === 'plan' &&
            spec.details.d === request.d &&
            spec.recipients.includes(request.from)
        )
      )
      .map(([key]) => key)
    if (answered.length === 0) return
    store.setState((state) => ({
      joinRequests: Object.fromEntries(
        Object.entries(state.joinRequests).filter(
          ([key]) => !answered.includes(key)
        )
      ),
      notifications: state.notifications.filter(
        (n) => n.kind !== 'joinRequest' || !answered.includes(n.shareKey ?? '')
      ),
    }))
  }

  /**
   * Push kinds for join requests from each active buddy whose requests may
   * alert this device; left out of the push registration otherwise.
   */
  function joinRequestPushKinds(): JoinRequestPushKind[] {
    const { buddies, joinRequestNotifications, mutedJoinRequests } =
      store.getState()
    if (!joinRequestNotifications) return []
    const me = identity()
    return buddies
      .filter(
        (buddy) =>
          buddy.status === 'active' &&
          !mutedJoinRequests.includes(buddy.inboxId)
      )
      .map((buddy) => joinRequestKind(pairKeys(me, buddy).incoming.slotId))
  }

  function markNotificationsRead() {
    if (store.getState().notifications.every((n) => n.read)) return
    store.setState((state) => ({
      notifications: state.notifications.map((n) =>
        n.read ? n : { ...n, read: true }
      ),
    }))
  }

  /**
   * Seen in the tray. A later change to a seen invitation then reads as a
   * change rather than a new invitation.
   */
  function markNotificationRead(id: string) {
    const entry = store.getState().notifications.find((n) => n.id === id)
    if (!entry || entry.read) return
    store.setState((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    }))
  }

  /**
   * Removes a queue entry, except a request still waiting on an answer: the
   * tray is where it's answered, and answering is what clears it.
   */
  function dismissNotification(id: string) {
    const state = store.getState()
    const entry = state.notifications.find((n) => n.id === id)
    if (!entry || awaitsAnswer(entry, state)) return
    if (entry.kind === 'joinRequest' && entry.shareKey) {
      dismissJoinRequest(entry.shareKey)
      return
    }
    store.setState((current) => ({
      notifications: current.notifications.filter((n) => n.id !== id),
    }))
  }

  /** The id buddies know one of this User's shares by. */
  function shareIdForKey(key: string): string {
    return shareIdFor(identity(), key)
  }

  function readRoster(me: BuddyIdentity, blob: string): Roster | null {
    try {
      return rosterSchema.parse(
        decode(open(me.rosterKey, blob, aad.roster(me.inboxId)))
      )
    } catch {
      // A roster from another identity or a corrupt blob is ignored.
      return null
    }
  }

  /**
   * A roster older than the newest this device has read or written: a replay,
   * or a write from a device that hadn't synced. One without a `version` comes
   * from an older build and is merged; local tombstones still win over it.
   */
  function isStaleRoster(roster: Roster): boolean {
    return (
      roster.version !== undefined &&
      roster.version < store.getState().rosterVersion
    )
  }

  /**
   * Folds another device's roster into local state. Relationships union, and
   * removals win: ended pairings and closed invites carry tombstones, which
   * union too, and a removed buddy's slot is gone from the inbox. Lapsed
   * invites and claims are dropped. The later sharing choice wins. Returns the
   * buddies this device didn't know about.
   */
  function mergeRoster(me: BuddyIdentity, remote: Roster): string[] {
    const state = store.getState()
    const now = deps.now()
    const closedInviteIds = {
      ...remote.closedInviteIds,
      ...state.closedInviteIds,
    }
    const removedBuddies = mergeRemovedBuddies(
      state.removedBuddies,
      remote.removedBuddies
    )
    const ended = (buddy: Buddy) => pairingEnded(removedBuddies, buddy)
    const known = new Set(state.buddies.map((b) => b.inboxId))
    const usedColors = new Set(state.buddies.map((b) => b.colorIndex))
    const added: Buddy[] = []
    for (const buddy of remote.buddies) {
      if (
        known.has(buddy.inboxId) ||
        buddy.inboxId === me.inboxId ||
        isPendingRemoval(buddy.inboxId) ||
        ended(buddy)
      )
        continue
      const colorIndex = usedColors.has(buddy.colorIndex)
        ? nextColorIndex(usedColors)
        : buddy.colorIndex
      usedColors.add(colorIndex)
      added.push({ ...buddy, colorIndex })
    }
    // Another of this User's devices ended these pairings.
    const endedHere = state.buddies.filter(ended)
    const buddies = [
      ...state.buddies
        .filter((local) => !ended(local))
        .map((local): Buddy => {
          const theirs = remote.buddies.find((b) => b.inboxId === local.inboxId)
          // Another device already applied this pairing's confirmation.
          return local.status === 'awaitingConfirm' &&
            theirs?.status === 'active' &&
            theirs.inviteSecret === local.inviteSecret
            ? {
                ...local,
                name: theirs.name,
                tenure: theirs.tenure,
                status: 'active',
                expiresAt: undefined,
              }
            : local
        }),
      ...added,
    ]
    const isOpen = (invite: { inviteId: string; expiresAt: number }) =>
      !(invite.inviteId in closedInviteIds) && invite.expiresAt > now
    store.setState({
      buddies,
      // Buddies restored from another device means Buddies is already set up.
      onboardingComplete: state.onboardingComplete || buddies.length > 0,
      outgoingInvites: unionBy(
        state.outgoingInvites,
        remote.outgoingInvites,
        (invite) => invite.inviteId
      ).filter(isOpen),
      incomingClaims: unionBy(
        state.incomingClaims,
        remote.incomingClaims,
        (claim) => claim.inviteId
      ).filter(
        (claim) =>
          isOpen(claim) && !buddies.some((b) => b.inboxId === claim.inboxId)
      ),
      closedInviteIds,
      // A tombstone a newer pairing replaced has done its job.
      removedBuddies: Object.fromEntries(
        Object.entries(removedBuddies).filter(
          ([inboxId, removedAt]) =>
            !buddies.some(
              (b) => b.inboxId === inboxId && b.pairedAt > removedAt
            )
        )
      ),
      rosterVersion: Math.max(state.rosterVersion, remote.version ?? 0),
      sharing:
        remote.sharing.updatedAt > state.sharing.updatedAt
          ? remote.sharing
          : state.sharing,
    })
    // Withdraw their slots from here too, in case that device can't finish.
    if (endedHere.length > 0) queueRemoval(endedHere)
    return added.map((b) => b.inboxId)
  }

  /**
   * Wipes lapsed shares, replies, and queue entries, and lists any invitation
   * still to answer whose entry was lost; needs no network.
   */
  function expireLocal() {
    const now = deps.now()
    store.setState((state) => {
      const unexpired = withoutExpired(state, now)
      return {
        ...unexpired,
        notifications: withPendingInvitesQueued(
          { ...state, ...unexpired },
          now
        ),
      }
    })
  }

  function expireStale() {
    const now = deps.now()
    const lapsed = store
      .getState()
      .buddies.filter(
        (b) => b.status === 'awaitingConfirm' && (b.expiresAt ?? 0) <= now
      )
    if (lapsed.length > 0) queueRemoval(lapsed)
    expireLocal()
    return lapsed.length > 0
  }

  /**
   * After the relay wipes an inactive inbox, register it again and re-add every
   * buddy's slot so the pairings resume. Flagged in state first so a failure
   * part-way is retried rather than read as buddies having left.
   */
  async function restoreInbox(me: BuddyIdentity) {
    store.setState({ slotsNeedRestore: true })
    await relay.registerInbox(ownerAuth(me))
    store.setState({ syncSeq: 0, pushRegistrationKey: null })
    for (const buddy of store.getState().buddies)
      await addSlot(me, pairKeys(me, buddy).incoming)
    store.setState({ slotsNeedRestore: false })
    await saveRoster(me)
  }

  async function fetchInbox(me: BuddyIdentity, since: number) {
    try {
      return await relay.syncInbox(ownerAuth(me), since)
    } catch (error) {
      if (!isRelayError(error, 'not_found')) throw error
      // Wiped for inactivity, or deleted by another of this User's devices.
      await restoreInbox(me)
      return relay.syncInbox(ownerAuth(me), 0)
    }
  }

  async function runSync() {
    expireLocal()
    const me = await ensureInbox()
    slotsAddedDuringSync.clear()
    if (store.getState().slotsNeedRestore) await restoreInbox(me)
    const since = store.getState().syncSeq
    let response = await fetchInbox(me, since)

    const readBack = response.roster
      ? readRoster(me, response.roster.blob)
      : null
    // A stale roster is ignored, and this device's own is written back over it.
    const staleRoster = readBack !== null && isStaleRoster(readBack)
    const remoteRoster = staleRoster ? null : readBack
    if (remoteRoster) {
      const learned = mergeRoster(me, remoteRoster)
      // This device already synced past the new buddies' cards and events.
      if (learned.length > 0 && since > 0) response = await fetchInbox(me, 0)
    }

    let rosterChanged = staleRoster
    for (const event of [...response.events].sort((a, b) => a.seq - b.seq)) {
      if (event.kind === 'invite.claimed' && event.slotId === '') {
        applyClaim(me, event)
      } else if (event.kind === 'pair.confirmed') {
        rosterChanged = applyConfirmation(me, event) || rosterChanged
      } else if (
        event.kind === 'share.reply' ||
        shareTypeOfKind(event.kind) !== null
      ) {
        applyShareEvent(me, event)
      } else if (
        event.kind === JOIN_CANCEL_KIND ||
        event.kind.startsWith(JOIN_REQUEST_KIND_PREFIX)
      ) {
        applyJoinEvent(me, event)
      }
    }
    for (const card of response.cards) applyCard(me, card)

    // A buddy who ended the connection (or a removal on another of this
    // User's devices) has withdrawn their slot from my inbox.
    const liveSlots = new Set(response.slots.map((slot) => slot.slotId))
    for (const buddy of store.getState().buddies) {
      const { slotId } = pairKeys(me, buddy).incoming
      if (!liveSlots.has(slotId) && !slotsAddedDuringSync.has(slotId)) {
        forgetBuddy(buddy.inboxId)
        rosterChanged = true
      }
    }

    rosterChanged = expireStale() || rosterChanged
    await flushRemovals(me)
    await deliverReplies().catch(() => {
      // Retried on the next sync.
    })
    await deliverJoinRequests().catch(() => {
      // Retried on the next sync.
    })
    store.setState({ syncSeq: response.seq, lastSyncAt: deps.now() })
    // Write the merged roster back when another device's copy lacks
    // something, which also heals a concurrent last-writer-wins overwrite.
    if (
      remoteRoster &&
      rosterSignature(remoteRoster) !== rosterSignature(store.getState())
    )
      rosterChanged = true
    if (rosterChanged) await saveRoster(me)
    await publishCards()
    await publishShares()
  }

  /**
   * Coalesces concurrent callers. A call made while a sync runs may announce an
   * event that sync already fetched past, so it gets one more sync afterwards,
   * shared by everyone who asked meanwhile.
   */
  function sync(): Promise<void> {
    if (!syncInFlight) {
      syncInFlight = runSync().finally(() => {
        syncInFlight = null
      })
      return syncInFlight
    }
    syncQueued ??= syncInFlight
      .catch(() => {
        // The follow-up runs either way; its own outcome is what callers see.
      })
      .then(() => {
        syncQueued = null
        return sync()
      })
    return syncQueued
  }

  /** Opens this inbox's live signal, which says when to sync. */
  async function openLive() {
    return relay.openLive(ownerAuth(await ensureInbox()))
  }

  /**
   * Reads the inbox from this device's cursor and applies nothing: proof the
   * relay accepts this device's signature, for Tools' relay check.
   */
  async function probeInbox() {
    const me = await ensureInbox()
    const since = store.getState().syncSeq
    const response = await relay.syncInbox(ownerAuth(me), since)
    return {
      since,
      seq: response.seq,
      slots: response.slots.length,
      cards: response.cards.length,
      events: response.events.length,
      rosterChanged: response.roster !== null,
    }
  }

  /**
   * Registers this device for pushes when anything about the registration
   * changed, or when the last one is a day old: the relay may have dropped the
   * device since (a rejected token, or evicted for a newer device), and a
   * re-sent registration keeps an active device from being the one evicted.
   */
  async function registerPush(device: {
    apnsToken: string
    apnsEnvironment: 'sandbox' | 'production'
    /** The app's bundle id, so Beta and production builds get their own topic. */
    apnsTopic?: string
    /** A kind left out is never pushed to this device. */
    templates: Partial<Record<BuddyPushKind, PushTemplate>> &
      Record<JoinRequestPushKind, PushTemplate>
  }): Promise<PushRegistrationOutcome> {
    const me = await ensureInbox()
    let deviceId = store.getState().deviceId
    if (!deviceId) {
      deviceId = newId()
      store.setState({ deviceId })
    }
    const registrationKey = toB64u(
      sha256(json({ inboxId: me.inboxId, deviceId, ...device }))
    )
    const { pushRegistrationKey, pushRegisteredAt } = store.getState()
    const unchanged = pushRegistrationKey === registrationKey
    const age = deps.now() - pushRegisteredAt
    if (unchanged && age >= 0 && age < PUSH_REGISTRATION_REFRESH_MS)
      return 'unchanged'
    try {
      await relay.registerDevice(ownerAuth(me), { deviceId, ...device })
    } catch (error) {
      // Whatever the relay holds now is unknown; send it again next time.
      store.setState({ pushRegistrationKey: null })
      throw error
    }
    store.setState({
      pushRegistrationKey: registrationKey,
      pushRegisteredAt: deps.now(),
    })
    return unchanged ? 'refreshed' : 'registered'
  }

  /**
   * Removes this User from every buddy, then wipes the relay and the seed. The
   * seed is the only way to retry a removal, so nothing is wiped until every
   * buddy has been left.
   */
  async function deleteEverything() {
    const me = identity()
    queueRemoval(store.getState().buddies)
    await flushRemovals(me)
    if (store.getState().pendingRemovals.length > 0)
      throw new BuddyRemovalPendingError('everything')
    try {
      await relay.deleteInbox(ownerAuth(me))
    } catch (error) {
      if (!isRelayError(error, 'not_found')) throw error
    }
    deps.deleteRootSeed()
    cachedIdentity = null
    pairCache.clear()
    shareSends.clear()
    // Choices about this device and what to share outlive the data; shared
    // Plans, invitations, replies, and the notification queue don't.
    const {
      devOverride,
      flagLastKnown,
      onboardingComplete,
      notificationsEnabled,
      joinRequestNotifications,
      sharing,
    } = store.getState()
    store.setState({
      ...initialBuddiesState,
      devOverride,
      flagLastKnown,
      onboardingComplete,
      notificationsEnabled,
      joinRequestNotifications,
      sharing,
    })
  }

  return {
    ensureInbox,
    createInvite,
    inviteLinkFor,
    cancelInvite,
    previewInvite,
    acceptInvite,
    confirmClaim,
    rejectClaim,
    removeBuddy,
    setShowOnCalendar,
    setColor,
    setNickname,
    setSharing,
    publishCards,
    publishShares,
    replyToShare,
    deliverReplies,
    sendHeldReplies,
    askToJoin,
    withdrawJoinRequest,
    dismissJoinRequest,
    joinRequestPushKinds,
    expire: expireLocal,
    shareIdForKey,
    markNotificationsRead,
    markNotificationRead,
    dismissNotification,
    sync,
    openLive,
    probeInbox,
    registerPush,
    deleteEverything,
  }
}

export type BuddiesEngine = ReturnType<typeof createBuddiesEngine>
