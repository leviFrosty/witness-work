import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  concatBytes,
  fromB64u,
  toB64u,
  utf8,
} from '@/features/buddies/lib/bytes'
import { ed25519Sign, seal } from '@/features/buddies/lib/crypto'
import {
  BuddyInviteError,
  createBuddiesEngine,
} from '@/features/buddies/lib/engine'
import { createBuddiesKeyChange } from '@/features/buddies/lib/keyChange'
import {
  aad,
  deriveDirection,
  deriveIdentity,
  deriveInvite,
  derivePairSecret,
} from '@/features/buddies/lib/keys'
import { createRelayClient } from '@/features/buddies/lib/relay'
import {
  type Buddy,
  type BuddiesState,
  initialBuddiesState,
} from '@/features/buddies/lib/state'
import { fetchAccountInfo } from '@/lib/serverAccount/client'
import { rekeyAccount } from '@/lib/serverAccount/keyChangeClient'
import {
  appendKeyHistory,
  keyHistoryEntry,
  sealKeyHistory,
} from '@/lib/serverAccount/keyHistory'
import {
  deriveAccountSigningKey,
  signInboxLink,
} from '@/lib/serverAccount/keys'
import {
  interopEnabled,
  interopRelayUrl,
  interopSessions,
} from '@/lib/serverAccount/testing/interopSessions'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/http/online', () => ({ isKnownOffline: () => false }))

/**
 * Opt-in contract check of Buddies' reset after an account key change against a
 * real worker (see `interopSessions`; docs/buddies-protocol.md, "Reconnect
 * invites"): `account/rekey`, `inbox/delete` with a successor, and
 * `inbox/successor`. Skipped by default.
 */
const random = (length: number) => new Uint8Array(nodeRandomBytes(length))
const pub = (key: Uint8Array) => deriveAccountSigningKey(key).publicKey

/** A User on one device, whose account key can change. */
function user(name: string, initialKey = random(32)) {
  let key = initialKey
  const sessions = interopSessions(random, key)
  let state: BuddiesState = { ...initialBuddiesState }
  const store = {
    getState: () => state,
    setState: (
      partial:
        | Partial<BuddiesState>
        | ((current: BuddiesState) => Partial<BuddiesState>)
    ) => {
      state = {
        ...state,
        ...(typeof partial === 'function' ? partial(state) : partial),
      }
    },
  }
  const relay = createRelayClient({
    baseUrl: interopRelayUrl!,
    randomBytes: random,
    authorize: (run, { signal }) =>
      sessions.withSession(run, { accountKey: key, signal }),
  })
  const engine = createBuddiesEngine({
    relay,
    store,
    randomBytes: random,
    now: Date.now,
    getRootSeed: async () => key,
    account: { forget: sessions.forget },
    getProfile: () => ({ name }),
    getShares: () => [],
    getStreak: () => undefined,
    deleteRootSeed: async () => {},
    getPlans: () => ({ dayPlans: [], recurringPlans: [] }),
  })
  const progress = (() => {
    let value: string | null = null
    return {
      read: async () => value,
      write: async (next: string) => {
        value = next
      },
      remove: async () => {
        value = null
      },
    }
  })()
  const step = createBuddiesKeyChange({
    relay,
    engine,
    progress,
    randomBytes: random,
    now: Date.now,
  })
  const accountId = () =>
    sessions.withSession(async (_, session) => session.accountId, {
      accountKey: key,
    })

  /** Steps 0 to 4 of a key change, then Buddies' step 6. */
  async function changeKey() {
    const change = await rekey()
    return { ...change, outcome: await change.finish() }
  }

  /** Steps 0 to 4 of a key change; `finish` runs Buddies' step 6. */
  async function rekey() {
    const oldKey = key
    const newKey = random(32)
    const id = await accountId()
    expect(await step.prepare({ oldKey, accountId: id })).toBe('linked')
    const info = await fetchAccountInfo({
      baseUrl: interopRelayUrl!,
      authorize: (run) => sessions.withSession(run, { accountKey: oldKey }),
    })
    const result = await rekeyAccount(
      {
        oldKey,
        newKey,
        keyEpoch: info.keyEpoch ?? 0,
        history: sealKeyHistory(
          newKey,
          id,
          (info.keyEpoch ?? 0) + 1,
          appendKeyHistory(
            null,
            keyHistoryEntry(oldKey, info.keyEpoch ?? 0, Date.now())
          ),
          random(24)
        ),
      },
      {
        baseUrl: interopRelayUrl!,
        authorize: (run) => sessions.withSession(run, { accountKey: oldKey }),
        now: Date.now,
        randomBytes: random,
      }
    )
    if (result.outcome !== 'committed') throw new Error('not committed')
    await sessions.repoint(pub(oldKey), pub(newKey), {
      accessToken: result.accessToken,
      accessExpiresAt: result.accessExpiresAt,
    })
    key = newKey
    return {
      finish: () => step.reset({ oldKey, newKey, accountId: id }),
      oldKey,
      newKey,
      oldInboxId: deriveIdentity(oldKey).inboxId,
      newInboxId: deriveIdentity(newKey).inboxId,
    }
  }

  return {
    engine,
    store,
    relay,
    sessions,
    step,
    changeKey,
    rekey,
    accountId,
    key: () => key,
    inboxId: () => deriveIdentity(key).inboxId,
  }
}

type User = ReturnType<typeof user>

async function pair(inviter: User, invitee: User) {
  const link = await inviter.engine.createInvite()
  await invitee.engine.acceptInvite(link)
  await inviter.engine.sync()
  const [claim] = inviter.store.getState().incomingClaims
  await inviter.engine.confirmClaim(claim.inviteId)
  await invitee.engine.sync()
}

/** The slot `oldKey`'s pairing with `theirs` writes into their inbox from. */
function oldSlot(oldKey: Uint8Array, theirs: Buddy) {
  const me = deriveIdentity(oldKey)
  const outgoing = deriveDirection(
    derivePairSecret(
      me.dhPrivate,
      fromB64u(theirs.dhPub),
      fromB64u(theirs.inviteSecret),
      me.inboxId,
      theirs.inboxId
    ),
    theirs.inboxId
  )
  return {
    auth: {
      inboxId: theirs.inboxId,
      slotId: outgoing.slotId,
      writerSeed: outgoing.writerSeed,
    },
    outgoing,
  }
}

/**
 * Writes `body` into `buddy`'s inbox through `writer`'s pairing made with
 * `oldKey`, as anyone who kept that key could.
 */
async function forge(
  writer: User,
  oldKey: Uint8Array,
  theirs: Buddy,
  body: Record<string, unknown>
) {
  const { auth, outgoing } = oldSlot(oldKey, theirs)
  const eventId = toB64u(random(16))
  await writer.relay.putEvent(auth, {
    eventId,
    kind: 'pair.reconnect',
    blob: seal(
      outgoing.contentKey,
      utf8(JSON.stringify(body)),
      aad.event(theirs.inboxId, outgoing.slotId, eventId),
      random(12)
    ),
    push: false,
  })
}

/**
 * The iOS extension's owner-signed `inbox/sync` (`BuddiesInboxFetch.swift`)
 * with `key`'s owner key: with its header, or as a plain legacy request.
 */
async function ownerSignedSync(key: Uint8Array, extension: boolean) {
  const me = deriveIdentity(key)
  const payload = utf8(
    JSON.stringify({
      inboxId: me.inboxId,
      since: 0,
      ts: Date.now(),
      nonce: toB64u(random(16)),
    })
  )
  const response = await fetch(`${interopRelayUrl}/buddies/v1/inbox/sync`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(extension ? { 'x-buddies-client': 'notification-service' } : {}),
    },
    body: JSON.stringify({
      payload: toB64u(payload),
      signature: toB64u(
        ed25519Sign(
          concatBytes(utf8('ww-buddies/v1\ninbox/sync\n'), payload),
          me.ownerSeed
        )
      ),
    }),
  })
  return { status: response.status, body: (await response.json()) as unknown }
}

const KEY_CHANGED = {
  status: 401,
  body: expect.objectContaining({
    error: 'unauthorized',
    reason: 'key_changed',
  }),
}

describe.skipIf(!interopEnabled)('buddies key change interop', () => {
  it('refuses the old key’s owner-signed sync for good, and each device lands where it should', async () => {
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)
    const oldKey = mom.key()
    // Mom's other phone, still holding the old key, with Buddies running.
    const oldPhone = user('Mom', oldKey)
    await oldPhone.engine.sync()
    expect(oldPhone.store.getState().buddies).toHaveLength(1)
    // Before the change, the extension's fetch (legacy on, too) reads it.
    expect((await ownerSignedSync(oldKey, true)).status).toBe(200)
    expect((await ownerSignedSync(oldKey, false)).status).toBe(200)

    const change = await mom.rekey()
    expect(await ownerSignedSync(oldKey, true)).toEqual(KEY_CHANGED)
    expect(await ownerSignedSync(oldKey, false)).toEqual(KEY_CHANGED)

    // The old phone: the extension's refusal drops the inbox for good, and
    // its session finds the key retired (the signed-out state).
    expect(await oldPhone.engine.ownerKeyRefused(change.oldInboxId)).toBe(
      'retired'
    )
    expect(oldPhone.store.getState()).toMatchObject({
      registeredInboxId: null,
      buddies: [],
      refusedInboxIds: [change.oldInboxId],
    })
    await expect(oldPhone.engine.sync()).rejects.toMatchObject({
      code: 'cancelled',
    })
    await expect(
      fetchAccountInfo({
        baseUrl: interopRelayUrl!,
        authorize: (run) =>
          oldPhone.sessions.withSession(run, { accountKey: oldKey }),
      })
    ).rejects.toMatchObject({ failure: 'keyRetired' })

    // The new key's device links the old inbox again (with a session, as it
    // may); the old key stays refused.
    const old = deriveIdentity(oldKey)
    await mom.relay.registerInbox({
      inboxId: old.inboxId,
      ownerSeed: old.ownerSeed,
      ownerPub: old.ownerPub,
      link: {
        sign: (accountId) =>
          signInboxLink(
            deriveAccountSigningKey(change.newKey),
            accountId,
            old.inboxId,
            old.ownerPub
          ),
      },
    })
    expect(await ownerSignedSync(oldKey, true)).toEqual(KEY_CHANGED)
    expect(await ownerSignedSync(oldKey, false)).toEqual(KEY_CHANGED)

    // Step 6 still names the new inbox as the successor, over Bearer. The old
    // inbox is gone then, so the old key reads nothing (`not_found`).
    expect((await change.finish()).done).toBe(false)
    expect(await anna.relay.inboxSuccessor(change.oldInboxId)).toBe(
      change.newInboxId
    )
    expect(mom.store.getState().registeredInboxId).toBe(change.newInboxId)
    for (const extension of [true, false])
      expect(await ownerSignedSync(oldKey, extension)).toEqual({
        status: 404,
        body: expect.objectContaining({ error: 'not_found' }),
      })

    // A device that got the new key with the old inbox still registered
    // moves to the new one.
    const newPhone = user('Mom', change.newKey)
    newPhone.store.setState({ registeredInboxId: change.oldInboxId })
    expect(await newPhone.engine.ownerKeyRefused(change.oldInboxId)).toBe(
      'moved'
    )
    await newPhone.engine.sync()
    expect(newPhone.store.getState().registeredInboxId).toBe(change.newInboxId)
    expect(await ownerSignedSync(change.newKey, true)).toMatchObject({
      status: 200,
    })
  })

  it('seals the old pairing, so the old key writes no more, and the buddy still reconnects after it leaves', async () => {
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)
    const momsAnna = mom.store.getState().buddies[0]
    const change = await mom.changeKey()

    // Someone who kept Mom's old key, with a session on their own account.
    const thief = user('Thief')
    await thief.engine.ensureInbox()
    await expect(
      forge(thief, change.oldKey, momsAnna, { v: 1 })
    ).rejects.toMatchObject({ code: 'sealed', status: 403 })
    // Leaving still works, and keeps the invite.
    await thief.relay.leaveSlot(oldSlot(change.oldKey, momsAnna).auth)

    await anna.engine.sync()
    expect(anna.store.getState().buddies).toEqual([])
    expect(
      anna.store.getState().reconnectOffers[change.oldInboxId]
    ).toMatchObject({ invites: [{ inboxId: change.newInboxId }] })
    expect(await anna.engine.acceptReconnect(change.oldInboxId)).toEqual({
      claimed: true,
    })
    await mom.engine.sync()
    await anna.engine.sync()
    expect(anna.store.getState().buddies).toMatchObject([
      { inboxId: change.newInboxId, status: 'active' },
    ])
    expect(await mom.step.carryOn()).toEqual({ done: true })
  })

  it('reconnects a buddy to the inbox the relay names as the successor', async () => {
    const mom = user('Mom')
    const anna = user('Anna')
    await pair(mom, anna)

    const change = await mom.changeKey()
    expect(change.outcome.done).toBe(false)
    expect(await anna.relay.inboxSuccessor(change.oldInboxId)).toBe(
      change.newInboxId
    )

    await anna.engine.sync()
    expect(
      anna.store.getState().reconnectOffers[change.oldInboxId]
    ).toMatchObject({ invites: [{ inboxId: change.newInboxId }], name: 'Mom' })
    expect(await anna.engine.acceptReconnect(change.oldInboxId)).toEqual({
      claimed: true,
    })
    await mom.engine.sync()
    await anna.engine.sync()
    expect(anna.store.getState().buddies).toMatchObject([
      { inboxId: change.newInboxId, status: 'active' },
    ])
    expect(mom.store.getState().buddies).toMatchObject([
      { inboxId: anna.inboxId(), status: 'active' },
    ])
    expect(await mom.step.carryOn()).toEqual({ done: true })

    // No one with the old key brings the replaced inbox back.
    const thief = user('Thief')
    const thiefKey = thief.key()
    const old = deriveIdentity(change.oldKey)
    await expect(
      thief.relay.registerInbox({
        inboxId: old.inboxId,
        ownerSeed: old.ownerSeed,
        ownerPub: old.ownerPub,
        link: {
          sign: (id) =>
            signInboxLink(
              deriveAccountSigningKey(thiefKey),
              id,
              old.inboxId,
              old.ownerPub
            ),
        },
      })
    ).rejects.toMatchObject({ code: 'conflict' })
    expect(await anna.relay.inboxSuccessor(change.oldInboxId)).toBe(
      change.newInboxId
    )
  })

  it('refuses a forged invitation, then takes the real one', async () => {
    const mom = user('Mom')
    const anna = user('Anna')
    const eve = user('Eve')
    await pair(mom, anna)
    const oldKey = mom.key()
    const momsAnna = mom.store.getState().buddies[0]
    const evesLink = await eve.engine.createInvite()
    const evesSecret = evesLink.split('#1')[1]

    // Someone with Mom's key offers their own inbox, before any change.
    await forge(mom, oldKey, momsAnna, {
      v: 1,
      inboxId: eve.inboxId(),
      secret: evesSecret,
      expiresAt: Date.now() + 60 * 60 * 1000,
    })
    await anna.engine.sync()
    await expect(anna.engine.acceptReconnect(mom.inboxId())).rejects.toEqual(
      new BuddyInviteError('reconnectUnverified')
    )

    // After the change, the relay names Mom's new inbox, not that one.
    const change = await mom.changeKey()
    await expect(
      anna.engine.acceptReconnect(change.oldInboxId)
    ).rejects.toEqual(new BuddyInviteError('invalid'))
    const evesInvite = await eve.relay.fetchInvite(
      deriveInvite(fromB64u(evesSecret)).inviteId
    )
    expect(evesInvite.status).toBe('open')

    // Mom's real invitation still reconnects her.
    await anna.engine.sync()
    expect(await anna.engine.acceptReconnect(change.oldInboxId)).toEqual({
      claimed: true,
    })
    await mom.engine.sync()
    await anna.engine.sync()
    expect(anna.store.getState().buddies).toMatchObject([
      { inboxId: change.newInboxId, status: 'active' },
    ])
  })

  it('links an inbox from before accounts before the change, so no one else can', async () => {
    const mom = user('Mom')
    // Registered the legacy way: an owner envelope and no token.
    const me = deriveIdentity(mom.key())
    const payload = utf8(
      JSON.stringify({
        inboxId: me.inboxId,
        ownerPub: me.ownerPub,
        ts: Date.now(),
        nonce: toB64u(random(16)),
      })
    )
    const legacy = await fetch(`${interopRelayUrl}/buddies/v1/inbox/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        payload: toB64u(payload),
        signature: toB64u(
          ed25519Sign(
            concatBytes(utf8('ww-buddies/v1\ninbox/register\n'), payload),
            me.ownerSeed
          )
        ),
      }),
    })
    expect(legacy.status).toBe(200)

    // Unlinked, it can't name a successor: `forbidden`, as the step expects.
    const other = user('Other')
    await other.engine.ensureInbox()
    await expect(
      mom.relay.deleteInbox(
        {
          inboxId: me.inboxId,
          ownerSeed: me.ownerSeed,
          ownerPub: me.ownerPub,
          link: {
            sign: () => {
              throw new Error('no link')
            },
          },
        },
        { successor: other.inboxId() }
      )
    ).rejects.toMatchObject({ code: 'forbidden' })

    const accountId = await mom.accountId()
    expect(await mom.step.prepare({ oldKey: mom.key(), accountId })).toBe(
      'linked'
    )
    const info = await fetchAccountInfo({
      baseUrl: interopRelayUrl!,
      authorize: (run) =>
        mom.sessions.withSession(run, { accountKey: mom.key() }),
    })
    expect(info.inboxIds).toContain(me.inboxId)

    // Someone else with the old key can't link it to their own account.
    const thief = user('Thief')
    const thiefKey = thief.key()
    await expect(
      thief.relay.registerInbox({
        inboxId: me.inboxId,
        ownerSeed: me.ownerSeed,
        ownerPub: me.ownerPub,
        link: {
          sign: (id) =>
            signInboxLink(
              deriveAccountSigningKey(thiefKey),
              id,
              me.inboxId,
              me.ownerPub
            ),
        },
      })
    ).rejects.toMatchObject({ code: 'conflict' })
  })
})
