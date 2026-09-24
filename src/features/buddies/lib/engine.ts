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
  buddyCardSchema,
  pairConfirmedSchema,
  PairingCard,
  pairingCardSchema,
  Roster,
  rosterSchema,
} from '@/features/buddies/lib/schemas'
import { buildBuddyCardDays } from '@/features/buddies/lib/card'
import {
  Buddy,
  BuddiesState,
  initialBuddiesState,
  INVITE_TTL_MS,
  MAX_BUDDIES,
  occupiedBuddySpots,
  PendingRemoval,
} from '@/features/buddies/lib/state'
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
export const BUDDY_PUSH_KINDS = ['invite.claimed', 'pair.confirmed'] as const
export type BuddyPushKind = (typeof BUDDY_PUSH_KINDS)[number]

const aad = {
  inviteCard: (inviteId: string) => `ww-buddies/v1/invite-card|${inviteId}`,
  claim: (inviteId: string) => `ww-buddies/v1/invite-claim|${inviteId}`,
  card: (inboxId: string, slotId: string) =>
    `ww-buddies/v1/card|${inboxId}|${slotId}`,
  event: (inboxId: string, slotId: string, eventId: string) =>
    `ww-buddies/v1/event|${inboxId}|${slotId}|${eventId}`,
  roster: (inboxId: string) => `ww-buddies/v1/roster|${inboxId}`,
}

type PairKeys = { incoming: DirectionKeys; outgoing: DirectionKeys }
type PairParty = Pick<Buddy, 'inboxId' | 'dhPub' | 'inviteSecret'>

function unionBy<T>(local: T[], remote: T[], key: (item: T) => string) {
  const seen = new Set(local.map(key))
  return [...local, ...remote.filter((item) => !seen.has(key(item)))]
}

/** What decides whether two rosters hold the same relationships. */
function rosterSignature(
  roster: Pick<
    Roster,
    'buddies' | 'outgoingInvites' | 'incomingClaims' | 'closedInviteIds'
  >
) {
  return JSON.stringify([
    roster.buddies.map((b) => `${b.inboxId}:${b.status}`).sort(),
    roster.outgoingInvites.map((i) => i.inviteId).sort(),
    roster.incomingClaims.map((c) => c.inviteId).sort(),
    Object.keys(roster.closedInviteIds).sort(),
  ])
}

function omitKey<T>(record: Record<string, T>, key: string) {
  return Object.fromEntries(
    Object.entries(record).filter(([entryKey]) => entryKey !== key)
  )
}

export function createBuddiesEngine(deps: BuddiesEngineDeps) {
  const { relay, store } = deps
  let cachedIdentity: { seed: string; identity: BuddyIdentity } | null = null
  const pairCache = new Map<string, PairKeys>()
  let syncInFlight: Promise<void> | null = null
  /** Slots added while a sync is in flight are missing from its response. */
  const slotsAddedDuringSync = new Set<string>()

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

  function displayName(): string {
    return store.getState().displayName.trim()
  }

  function pairingCard(me: BuddyIdentity): PairingCard {
    return {
      v: 1,
      name: displayName(),
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
    const { displayName, buddies, outgoingInvites, incomingClaims } =
      store.getState()
    const roster: Roster = {
      v: 1,
      displayName,
      buddies,
      outgoingInvites,
      incomingClaims,
      closedInviteIds: store.getState().closedInviteIds,
    }
    try {
      await relay.putRoster(
        ownerAuth(me),
        seal(me.rosterKey, json(roster), aad.roster(me.inboxId), nonce())
      )
    } catch {
      // Offline or relay hiccup — the next sync that sees a different roster
      // on the relay writes the merged one back.
    }
  }

  function forgetBuddy(inboxId: string) {
    store.setState((state) => ({
      buddies: state.buddies.filter((b) => b.inboxId !== inboxId),
      cards: omitKey(state.cards, inboxId),
      publishedCardHashes: omitKey(state.publishedCardHashes, inboxId),
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
    return { name: card.name, expiresAt }
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
          status: 'awaitingConfirm',
          pairedAt: deps.now(),
          colorIndex,
          showOnCalendar: true,
          expiresAt,
        },
      ],
    }))
    await saveRoster(me)
    return { name: card.name }
  }

  async function confirmClaim(inviteId: string) {
    const claim = store
      .getState()
      .incomingClaims.find((candidate) => candidate.inviteId === inviteId)
    if (!claim) return
    requireName()
    const me = await ensureInbox()
    const buddy: Buddy = {
      inboxId: claim.inboxId,
      name: claim.name,
      dhPub: claim.dhPub,
      inviteSecret: claim.secret,
      status: 'active',
      pairedAt: deps.now(),
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
          json({ v: 1, name: displayName() }),
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
    store.setState((state) => ({ buddies: [...state.buddies, buddy] }))
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
  function queueRemoval(parties: PendingRemoval[]) {
    const inboxIds = new Set(parties.map((party) => party.inboxId))
    for (const inboxId of inboxIds) forgetBuddy(inboxId)
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
    queueRemoval([buddy])
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

  /** Publishes one Buddy Card per active buddy, skipping unchanged content. */
  async function publishCards() {
    const name = displayName()
    const active = store.getState().buddies.filter((b) => b.status === 'active')
    if (active.length === 0 || !name) return
    const me = identity()
    const { dayPlans, recurringPlans } = deps.getPlans()
    const days = buildBuddyCardDays(
      dayPlans,
      recurringPlans,
      new Date(deps.now())
    )
    const contentHash = toB64u(sha256(json({ name, days })))
    for (const buddy of active) {
      if (store.getState().publishedCardHashes[buddy.inboxId] === contentHash)
        continue
      const { outgoing } = pairKeys(me, buddy)
      const card = {
        v: 1,
        name,
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
          dhPub: card.dhPub,
          inboxId: card.inboxId,
          receivedAt: deps.now(),
          expiresAt: invite.expiresAt,
        },
      ],
    }))
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
            ? { ...b, name: body.name, status: 'active', expiresAt: undefined }
            : b
        ),
      }))
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
          b.inboxId === buddy.inboxId ? { ...b, name: parsed.name } : b
        ),
      }))
    } catch {
      // Undecryptable or malformed cards are dropped; the next publish replaces them.
    }
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
   * Folds another device's roster into local state. Relationships union, and
   * removals win: closed invites carry tombstones, and a removed buddy's slot
   * is gone from the inbox, so the sync that follows drops them again. Returns
   * the buddies this device didn't know about.
   */
  function mergeRoster(me: BuddyIdentity, remote: Roster): string[] {
    const state = store.getState()
    const closedInviteIds = {
      ...remote.closedInviteIds,
      ...state.closedInviteIds,
    }
    const known = new Set(state.buddies.map((b) => b.inboxId))
    const usedColors = new Set(state.buddies.map((b) => b.colorIndex))
    const added: Buddy[] = []
    for (const buddy of remote.buddies) {
      if (
        known.has(buddy.inboxId) ||
        buddy.inboxId === me.inboxId ||
        isPendingRemoval(buddy.inboxId)
      )
        continue
      const colorIndex = usedColors.has(buddy.colorIndex)
        ? nextColorIndex(usedColors)
        : buddy.colorIndex
      usedColors.add(colorIndex)
      added.push({ ...buddy, colorIndex })
    }
    const buddies = [
      ...state.buddies.map((local): Buddy => {
        const theirs = remote.buddies.find((b) => b.inboxId === local.inboxId)
        // Another device already applied the confirmation event.
        return local.status === 'awaitingConfirm' && theirs?.status === 'active'
          ? {
              ...local,
              name: theirs.name,
              status: 'active',
              expiresAt: undefined,
            }
          : local
      }),
      ...added,
    ]
    const isOpen = (inviteId: string) => !(inviteId in closedInviteIds)
    store.setState({
      displayName: state.displayName || remote.displayName,
      buddies,
      outgoingInvites: unionBy(
        state.outgoingInvites,
        remote.outgoingInvites,
        (invite) => invite.inviteId
      ).filter((invite) => isOpen(invite.inviteId)),
      incomingClaims: unionBy(
        state.incomingClaims,
        remote.incomingClaims,
        (claim) => claim.inviteId
      ).filter(
        (claim) =>
          isOpen(claim.inviteId) &&
          !buddies.some((b) => b.inboxId === claim.inboxId)
      ),
      closedInviteIds,
    })
    return added.map((b) => b.inboxId)
  }

  function expireStale() {
    const now = deps.now()
    const lapsed = store
      .getState()
      .buddies.filter(
        (b) => b.status === 'awaitingConfirm' && (b.expiresAt ?? 0) <= now
      )
    if (lapsed.length > 0) queueRemoval(lapsed)
    store.setState((state) => ({
      outgoingInvites: state.outgoingInvites.filter((i) => i.expiresAt > now),
      incomingClaims: state.incomingClaims.filter((c) => c.expiresAt > now),
      closedInviteIds: Object.fromEntries(
        Object.entries(state.closedInviteIds).filter(
          ([, expiresAt]) => expiresAt > now
        )
      ),
    }))
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
    const me = await ensureInbox()
    slotsAddedDuringSync.clear()
    if (store.getState().slotsNeedRestore) await restoreInbox(me)
    const since = store.getState().syncSeq
    let response = await fetchInbox(me, since)

    const remoteRoster = response.roster
      ? readRoster(me, response.roster.blob)
      : null
    if (remoteRoster) {
      const learned = mergeRoster(me, remoteRoster)
      // This device already synced past the new buddies' cards and events.
      if (learned.length > 0 && since > 0) response = await fetchInbox(me, 0)
    }

    let rosterChanged = false
    for (const event of [...response.events].sort((a, b) => a.seq - b.seq)) {
      if (event.kind === 'invite.claimed' && event.slotId === '') {
        applyClaim(me, event)
      } else if (event.kind === 'pair.confirmed') {
        rosterChanged = applyConfirmation(me, event) || rosterChanged
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
  }

  /** Coalesces concurrent callers onto one in-flight sync. */
  function sync(): Promise<void> {
    if (!syncInFlight) {
      syncInFlight = runSync().finally(() => {
        syncInFlight = null
      })
    }
    return syncInFlight
  }

  async function registerPush(device: {
    apnsToken: string
    apnsEnvironment: 'sandbox' | 'production'
    templates: Record<BuddyPushKind, PushTemplate>
  }) {
    const me = await ensureInbox()
    let deviceId = store.getState().deviceId
    if (!deviceId) {
      deviceId = newId()
      store.setState({ deviceId })
    }
    const registrationKey = toB64u(
      sha256(json({ inboxId: me.inboxId, deviceId, ...device }))
    )
    if (store.getState().pushRegistrationKey === registrationKey) return
    await relay.registerDevice(ownerAuth(me), { deviceId, ...device })
    store.setState({ pushRegistrationKey: registrationKey })
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
    store.setState({
      ...initialBuddiesState,
      devOverride: store.getState().devOverride,
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
    publishCards,
    sync,
    registerPush,
    deleteEverything,
  }
}

export type BuddiesEngine = ReturnType<typeof createBuddiesEngine>
